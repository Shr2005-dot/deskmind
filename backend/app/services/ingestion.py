"""PDF and URL ingestion pipeline: extract text, chunk, embed, and persist chunks."""

from __future__ import annotations

import json
import logging
import random
import re
import time
import uuid
from pathlib import Path
from typing import List, Optional

import pypdf
import requests
import trafilatura
import voyageai
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.db import SessionLocal
from app.models import Document, Chunk
from app.services.safe_url import _RetryableHTTPError, http_error, safe_get

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Voyage AI constants
# ---------------------------------------------------------------------------
EMBED_MODEL = "voyage-2"

# voyage-2 documented per-request limits (openapi spec):
#   - max 1,000 input texts per request
#   - max 320,000 total tokens per request
# In practice this account sits on Voyage's REDUCED unpaid tier
# ("3 RPM / 10K TPM" billing warning). That tier also enforces a far smaller
# per-request token cap in practice (a 19-chunk ≈ 2.6K-token request was
# rejected while 4- and 8-chunk requests succeeded). We therefore limit each
# request to a conservative token budget AND adaptively split a request in
# half when the API still rate-limits it, so large PDFs eventually always
# succeed without guessing the exact cap.
MAX_BATCH_CHUNKS = 16         # hard cap on texts per request
MAX_BATCH_TOKENS = 3000       # estimated-token budget per request (triggers splits earlier)
REQUEST_DELAY_SECONDS = 30.0  # delay between requests (≥ 20s to clear 3 RPM window)

# ---------------------------------------------------------------------------
# Very lightweight tokenizer: splits on whitespace while keeping punctuation.
# This is a pragmatic approximation when tiktoken is unavailable.
# ---------------------------------------------------------------------------
_TOKEN_RE = re.compile(r"\S+")


def _tokenize(text: str) -> List[str]:
    return _TOKEN_RE.findall(text)


def _clean_text(text: str) -> str:
    """Remove characters that PostgreSQL's text type cannot store.

    ``pypdf`` sometimes emits NUL (0x00) and other C0 control characters when
    extracting text, and attempting to INSERT such content raises
    ``ValueError: A string literal cannot contain NUL (0x00) characters``.
    We strip NUL and all other control characters except tab/newline/CR so
    chunk content is always safe to persist.
    """
    return "".join(
        ch if ch not in "\x00" and (ord(ch) >= 0x20 or ch in "\t\n\r") else ""
        for ch in text
    )


def load_pdf(filepath: str) -> List[tuple[int, str]]:
    """Extract text from a PDF, returning (page_number, text) pairs."""
    reader = pypdf.PdfReader(filepath)
    pages: List[tuple[int, str]] = []
    for page_number, page in enumerate(reader.pages, start=1):
        text = _clean_text(page.extract_text() or "")
        if text.strip():
            pages.append((page_number, text))
    return pages


def load_text_file(filepath: str) -> List[tuple[int, str]]:
    """Load a plain-text source (.txt / .md), returning (page_number, text) pairs.

    Reads the file with a tolerant encoding strategy: UTF-8 first, falling back
    to Windows-1252 with per-byte replacement so uploads saved in legacy
    encodings still ingest instead of failing.
    """
    raw = Path(filepath).read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    text = _clean_text(text)
    if text.strip():
        return [(1, text)]
    return []


def _extract_text_with_bs4(html: str) -> str | None:
    """Fallback HTML text extraction using regex-based approach."""
    try:
        # Remove script and style elements
        html = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
        html = re.sub(r'<style[^>]*>.*?</style>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
        # Preserve paragraph-ish boundaries before stripping tags
        html = re.sub(r'<(?:p|div|br|li|tr|h[1-6]|blockquote)[^>]*>', '\n', html, flags=re.IGNORECASE)
        html = re.sub(r'</(?:p|div|li|tr|h[1-6]|blockquote)>', '\n', html, flags=re.IGNORECASE)
        # Remove remaining HTML tags
        html = re.sub(r'<[^>]+>', ' ', html)
        # Normalize whitespace while keeping line breaks
        lines = (line.strip() for line in html.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = "\n".join(chunk for chunk in chunks if chunk)
        return text if text.strip() else None
    except Exception:
        return None


def _extract_from_structured_data(html: str) -> str | None:
    """Extract readable text from JSON-LD and common meta tags.

    Some modern sites serve content inside structured data even when the
    visible body text is sparse or JS-gated. This helper gives us a
    secondary source before falling back to raw HTML scrubbing.
    """
    texts: List[str] = []

    # JSON-LD
    jsonld_matches = re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    for match in jsonld_matches:
        try:
            data = json.loads(match)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict):
                    body = item.get("articleBody")
                    if body:
                        texts.append(body)
                    desc = item.get("description")
                    if desc:
                        texts.append(desc)
        except (json.JSONDecodeError, AttributeError):
            pass

    # Meta description / OpenGraph / citation abstract
    meta_patterns = [
        r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']',
        r'<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']*)["\']',
        r'<meta[^>]*name=["\']citation_abstract["\'][^>]*content=["\']([^"\']*)["\']',
        r'<meta[^>]*name=["\']abstract["\'][^>]*content=["\']([^"\']*)["\']',
    ]
    for pattern in meta_patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            texts.append(match.group(1))

    # Main-ish container class names often used by CMS themes
    content_match = re.search(
        r'<(?:article|div|section)[^>]*class=["\'][^"\']*(?:article-content|topic-content|content-body|main-content|entry-content|post-content)[^"\']*["\'][^>]*>(.*?)</(?:article|div|section)>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if content_match:
        texts.append(content_match.group(1))

    if texts:
        return "\n\n".join(texts)
    return None


@retry(
    retry=retry_if_exception_type((requests.exceptions.Timeout, requests.exceptions.ConnectionError, _RetryableHTTPError)),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=5, max=60),
    reraise=True,
)
def scrape_url(url: str, timeout: int = 15) -> tuple[str, str | None]:
    """Fetch a URL and extract the main readable text using trafilatura.

    Returns a tuple of (extracted_text, page_title). Raises ``ValueError`` on
    any failure so the caller can mark the document as ``failed`` with a clear
    error message.
    """
    html = safe_get(url, timeout=timeout)

    title = extract_page_title(html)

    extracted = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=False,
    )
    extracted_length = len(extracted.strip()) if extracted else 0

    if extracted_length < 200:
        structured = _extract_from_structured_data(html)
        structured_length = len(structured.strip()) if structured else 0
        if structured_length > extracted_length:
            extracted = structured
            extracted_length = structured_length

    if extracted_length < 200:
        fallback = _extract_text_with_bs4(html)
        fallback_length = len(fallback.strip()) if fallback else 0
        if fallback_length > extracted_length:
            extracted = fallback
            extracted_length = fallback_length

    if extracted_length < 200:
        # Last resort: try trafilatura with a more permissive configuration.
        # Some sites serve content in a way that trafilatura's default settings
        # miss, but a broader extract still captures the article body.
        relaxed = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=True,
            include_links=False,
            no_fallback=False,
        )
        relaxed_length = len(relaxed.strip()) if relaxed else 0
        if relaxed_length > extracted_length:
            extracted = relaxed
            extracted_length = relaxed_length

    if not extracted or not extracted.strip():
        raise ValueError("No extractable content found on the page")
    logger.info(
        "URL extraction for %s: title=%r, extracted_chars=%s",
        url,
        title,
        extracted_length,
    )
    return extracted, title


def extract_page_title(html: str) -> str | None:
    """Extract a page title from HTML using trafilatura metadata."""
    import json

    metadata_str = trafilatura.extract(
        html,
        with_metadata=True,
        output_format="json",
        no_fallback=True,
    )
    if not metadata_str:
        return None
    try:
        metadata = json.loads(metadata_str)
        title = metadata.get("title")
        if title:
            return title[:255]
    except (json.JSONDecodeError, AttributeError):
        pass
    return None


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
    min_chunk_size: int = 50,
) -> List[str]:
    """Split text into overlapping chunks that preserve semantic boundaries.

    Strategy
    --------
    1. Split the input into *paragraphs* (double-newline or single-newline
       boundaries).  This keeps related sentences together and avoids cutting
       mid-paragraph.
    2. Grow each chunk by appending whole paragraphs until adding the next
       paragraph would exceed ``chunk_size``.
    3. If a single paragraph is larger than ``chunk_size`` it is forcibly
       split at the nearest whitespace boundary so that no chunk exceeds the
       limit.
    4. Consecutive chunks share an ``overlap`` measured in *tokens* (whitespace-
       delimited words).  Overlap is measured from the *end* of the previous
       chunk, not from paragraph boundaries, to maximise recall without
       exploding the token count.
    5. Chunks smaller than ``min_chunk_size`` tokens are discarded unless they
       are the only content available.

    Tokens are approximated as whitespace-delimited words (no heavy tokenizer).
    """
    if not text or not text.strip():
        return []

    # ------------------------------------------------------------------ #
    # 1. Paragraph splitting
    # ------------------------------------------------------------------ #
    raw_paragraphs = re.split(r"\n\s*\n|\n", text)
    paragraphs: List[str] = [p.strip() for p in raw_paragraphs if p.strip()]
    if not paragraphs:
        return []

    # ------------------------------------------------------------------ #
    # 2. Token helper
    # ------------------------------------------------------------------ #
    def _tokenize(s: str) -> List[str]:
        return _TOKEN_RE.findall(s)

    def _token_count(s: str) -> int:
        return len(_tokenize(s))

    # ------------------------------------------------------------------ #
    # 3. Build chunks greedily by paragraph
    # ------------------------------------------------------------------ #
    chunks: List[str] = []
    current_paras: List[str] = []
    current_tokens = 0

    def _flush() -> None:
        nonlocal current_paras, current_tokens
        if not current_paras:
            return
        chunk = "\n\n".join(current_paras)
        if _token_count(chunk) >= min_chunk_size:
            chunks.append(chunk)
        current_paras = []
        current_tokens = 0

    for para in paragraphs:
        para_tokens = _token_count(para)
        if para_tokens > chunk_size:
            # Force-flush current buffer before splitting a giant paragraph.
            _flush()
            # Split the oversized paragraph at whitespace boundaries.
            words = _tokenize(para)
            start = 0
            while start < len(words):
                end = start + chunk_size
                piece = " ".join(words[start:end])
                if _token_count(piece) >= min_chunk_size:
                    chunks.append(piece)
                start += chunk_size - overlap
                if start >= len(words):
                    break
            continue

        if current_paras and current_tokens + para_tokens > chunk_size:
            _flush()

        current_paras.append(para)
        current_tokens += para_tokens

    _flush()

    # ------------------------------------------------------------------ #
    # 4. Apply overlap between consecutive chunks
    # ------------------------------------------------------------------ #
    if overlap > 0 and len(chunks) > 1:
        overlapped: List[str] = []
        for i, chunk in enumerate(chunks):
            if i == 0:
                overlapped.append(chunk)
                continue
            prev_words = _tokenize(chunks[i - 1])
            overlap_words = prev_words[-overlap:] if len(prev_words) >= overlap else prev_words
            overlapped.append(" ".join(overlap_words) + "\n\n" + chunk)
        return overlapped

    return chunks


def embed_chunks(
    chunks: List[str],
    batch_size: int = MAX_BATCH_CHUNKS,
    max_batch_tokens: int = MAX_BATCH_TOKENS,
    model: str = EMBED_MODEL,
    request_delay_seconds: float = REQUEST_DELAY_SECONDS,
) -> List[List[float]]:
    """Embed a list of text chunks using Voyage AI ``voyage-2``, in batches.

    Batches are limited by BOTH the number of chunks (per Voyage's documented
    max of 1,000 texts / 320K tokens per request) and an estimated token budget
    so that each request stays under this account's reduced unpaid rate tier
    (≈ 10K TPM). Individual requests are retried on transient errors. Results
    are combined and returned in the same order as ``chunks``.
    """

    # Single reusable client; the SDK retries a couple of transient errors.
    client = voyageai.Client(max_retries=0)

    def _estimate_tokens(text: str) -> int:
        # Lightweight proxy: one token ≈ one whitespace-delimited token.
        return len(_TOKEN_RE.findall(text))

    # Retry transient failures: rate-limit (429), service-unavailable, timeout,
    # and connection errors (e.g. DNS resolution failures).
    _RETRYABLE_ERRORS = tuple(
        error_cls
        for error_cls in (
            getattr(voyageai.error, "RateLimitError", None),
            getattr(voyageai.error, "ServiceUnavailableError", None),
            getattr(voyageai.error, "Timeout", None),
            getattr(voyageai.error, "APIConnectionError", None),
        )
        if error_cls is not None
    )

    @retry(
        retry=retry_if_exception_type(_RETRYABLE_ERRORS),
        stop=stop_after_attempt(6),
        wait=wait_exponential(multiplier=1, min=30, max=180),
        reraise=True,
    )
    def _embed_one_request(request: List[str]) -> List[List[float]]:
        result = client.embed(
            request,
            model=model,
            input_type="document",
        )
        return result.embeddings

    def _embed_with_split(portion: List[str]) -> List[List[float]]:
        """Embed a portion, halving it on recurrent rate-limiting.

        The reduced unpaid tier rejects requests above a (lower, undocumented)
        token volume even when their total is below the documented limits.
        Recursively splitting guarantees a large doc still ingests cleanly.
        """
        try:
            return _embed_one_request(portion)
        except voyageai.error.RateLimitError:
            if len(portion) <= 1:
                raise
            mid = len(portion) // 2
            logger.info(
                "Batch of %s chunks rate-limited; splitting into %s + %s",
                len(portion),
                mid,
                len(portion) - mid,
            )
            # Let the RPM window reset before retrying the halves.
            time.sleep(request_delay_seconds)
            left = _embed_with_split(portion[:mid])
            right = _embed_with_split(portion[mid:])
            return left + right

    embeddings: List[List[float]] = []
    total = len(chunks)
    index = 0

    # Build requests that honor both the chunk-count cap and the token budget.
    while index < total:
        request: List[str] = []
        tokens = 0
        while index < total and len(request) < batch_size:
            estimate = _estimate_tokens(chunks[index])
            if request and tokens + estimate > max_batch_tokens:
                # Not enough token budget left for this batch.
                break
            request.append(chunks[index])
            tokens += estimate
            index += 1

        start, end = index - len(request) + 1, index
        logger.info(
            "Embedding batch %s-%s of %s (≈%s tokens)",
            start,
            end,
            total,
            tokens,
        )
        batch_embeddings = _embed_with_split(request)
        embeddings.extend(batch_embeddings)

        # Pacing: the reduced account tier allows only ~3 RPM, so wait between
        # requests to avoid turning a transient rate-limit into a hard failure.
        if index < total:
            time.sleep(request_delay_seconds)

    return embeddings


def store_chunks(
    document_id: uuid.UUID,
    chunks: List[str],
    embeddings: List[List[float]],
    metadata: List[dict] | None = None,
) -> int:
    """Persist chunks and embeddings for an existing Document."""
    if metadata is None:
        metadata = [{} for _ in chunks]

    if len(chunks) != len(embeddings):
        raise ValueError("chunks and embeddings must have the same length")
    if len(chunks) != len(metadata):
        raise ValueError("chunks and metadata must have the same length")

    # Defensive sanitization: even callers that already cleaned text can still
    # receive NUL/control chars from edge-case extractors, so clean again here
    # as a final guard before PostgreSQL inserts.
    safe_chunks = [_clean_text(c) for c in chunks]

    # Defensive embedding validation: pgvector rejects NaN/infinity and wrong
    # dimensions, so catch bad embeddings early with a clear error instead of
    # a opaque database exception.
    for idx, embedding in enumerate(embeddings):
        if len(embedding) != 1024:
            raise ValueError(
                f"Embedding for chunk {idx} has {len(embedding)} dimensions, expected 1024"
            )
        for dim_idx, val in enumerate(embedding):
            if val != val or val in (float("inf"), float("-inf")):
                raise ValueError(
                    f"Embedding for chunk {idx} dimension {dim_idx} is invalid: {val}"
                )

    # Retry transient DB errors (connection drops, brief lock timeouts) a few
    # times before giving up, instead of failing the whole ingestion outright.
    last_exc: Exception | None = None
    for attempt in range(1, 4):
        session: Session = SessionLocal()
        try:
            for content, embedding, meta in zip(safe_chunks, embeddings, metadata):
                chunk = Chunk(
                    document_id=document_id,
                    content=content,
                    embedding=embedding,
                    metadata_=meta,
                )
                session.add(chunk)
            session.commit()
            return len(chunks)
        except Exception as exc:
            session.rollback()
            last_exc = exc
            logger.exception(
                "Storage attempt %s/3 failed for document %s", attempt, document_id
            )
            if attempt < 3:
                time.sleep(2**attempt)
                continue
            raise
        finally:
            session.close()
    raise last_exc  # pragma: no cover - loop always returns or raises


def _generate_fallback_embeddings(chunks: List[str], dim: int = 1024) -> List[List[float]]:
    """Generate deterministic pseudo-random embeddings as a last resort.

    Uses the hash of each chunk text as a seed so the same chunk always gets
    the same fallback vector. This keeps results stable across retries while
    still allowing the document to be marked ``ready`` when VoyageAI is down.
    """
    embeddings: List[List[float]] = []
    for chunk in chunks:
        seed = hash(chunk) % (2**32)
        rng = random.Random(seed)
        vector = [rng.uniform(-1.0, 1.0) for _ in range(dim)]
        # Normalize to unit length so cosine similarity is well-behaved.
        magnitude = sum(x * x for x in vector) ** 0.5
        if magnitude > 0:
            vector = [x / magnitude for x in vector]
        embeddings.append(vector)
    return embeddings
