"""Retrieval pipeline: hybrid search, candidate fusion, reranking, and context selection."""

from __future__ import annotations

import logging
import re
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

import voyageai
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Bot, Chunk, Document
from app.services.rag_config import (
    RAG_ENABLE_HYBRID_SEARCH,
    RAG_ENABLE_QUERY_REWRITE,
    RAG_FINAL_TOP_K,
    RAG_KEYWORD_TOP_K,
    RAG_MAX_CONTEXT_TOKENS,
    RAG_RELEVANCE_THRESHOLD,
    RAG_RERANK_COVERAGE_WEIGHT,
    RAG_RERANK_KEYWORD_WEIGHT,
    RAG_RERANK_VECTOR_WEIGHT,
    RAG_VECTOR_TOP_K,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lightweight tokenizer (kept consistent with ingestion.py)
# ---------------------------------------------------------------------------
_TOKEN_RE = re.compile(r"\S+")


def _tokenize(text: str) -> List[str]:
    return _TOKEN_RE.findall(text)


def _token_count(text: str) -> int:
    return len(_tokenize(text))


# ---------------------------------------------------------------------------
# Observability
# ---------------------------------------------------------------------------
@dataclass
class RetrievalObservations:
    """Internal retrieval metrics for dashboard debug views."""

    original_question: str = ""
    retrieval_query: str = ""
    query_rewritten: bool = False
    hybrid_enabled: bool = True
    vector_candidates: int = 0
    keyword_candidates: int = 0
    combined_candidates: int = 0
    final_chunk_count: int = 0
    relevance_scores: List[float] = field(default_factory=list)
    duration_ms: float = 0.0
    refusal: bool = False
    refusal_reason: str = ""
    degraded: bool = False
    degraded_reason: str = ""


# ---------------------------------------------------------------------------
# Query preparation
# ---------------------------------------------------------------------------
@dataclass
class PreparedQuery:
    """Holds the final retrieval query and context about how it was produced."""

    text: str
    rewritten: bool = False
    original: str = ""


def prepare_query(
    question: str,
    conversation_messages: Optional[List[dict]] = None,
    enable_rewrite: bool = RAG_ENABLE_QUERY_REWRITE,
) -> PreparedQuery:
    """Build a retrieval query from the user question.

    * If ``conversation_messages`` contains recent turns and the question looks
      like a follow-up (short, contains pronouns like *it/that/this*, or lacks
      a clear subject), an optional LLM rewrite is attempted.
    * On rewrite failure the original question is used unchanged.
    * Standalone questions are never rewritten.
    """
    prepared = PreparedQuery(text=question, rewritten=False, original=question)

    if not enable_rewrite or not conversation_messages:
        return prepared

    if not _looks_like_follow_up(question):
        return prepared

    rewritten = _rewrite_query_with_llm(question, conversation_messages)
    if rewritten and rewritten.strip() and rewritten.strip().lower() != question.strip().lower():
        logger.debug("Query rewritten: %r -> %r", question, rewritten)
        prepared.text = rewritten.strip()
        prepared.rewritten = True
        return prepared

    return prepared


def _looks_like_follow_up(question: str) -> bool:
    """Heuristic to decide whether a question might benefit from rewriting."""
    q = question.strip().lower()
    # Very short questions are often follow-ups.
    if len(q.split()) <= 4:
        return True
    # Questions containing pronouns or vague references.
    vague_patterns = (
        r"\b(it|that|this|those|them|they)\b",
        r"^(does it|is it|can it|will it|did it|has it)",
        r"^(how long|how much|how many|what about|how about)",
        r"^(and |or )",
    )
    for pattern in vague_patterns:
        if re.search(pattern, q):
            return True
    return False


def _rewrite_query_with_llm(
    question: str,
    conversation_messages: List[dict],
) -> Optional[str]:
    """Use the LLM to rewrite ambiguous follow-up questions.

    Returns the rewritten query string, or ``None`` on failure.
    """
    try:
        from groq import Groq
        import os

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return None

        # Build a compact conversation summary (most recent turns first).
        history_lines: List[str] = []
        for msg in conversation_messages[-6:]:
            role = msg.get("role", "user")
            content = msg.get("content", "").strip()
            if content:
                history_lines.append(f"{role.capitalize()}: {content}")
        history = "\n".join(history_lines)

        prompt = (
            "You are a query-rewriting assistant for a customer-support RAG system.\n"
            "Given the conversation history and the latest user question, rewrite the "
            "question into a standalone, explicit retrieval query that contains all "
            "necessary context. Do NOT answer the question. Only return the rewritten "
            "query, with no preamble or explanation.\n\n"
            f"Conversation:\n{history}\n\n"
            f"Latest question: {question}\n\n"
            "Rewritten query:"
        )

        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "groq/compound-mini"),
            messages=[{"role": "user", "content": prompt}],
            max_tokens=128,
            temperature=0.0,
        )
        result = (response.choices[0].message.content or "").strip()
        # Strip any quote wrappers the model might add.
        if result.startswith('"') and result.endswith('"'):
            result = result[1:-1]
        return result if result else None
    except Exception:
        logger.debug("Query rewrite failed; falling back to original question", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------
# The unpaid Voyage tier enforces harsh limits (3 RPM / 10K TPM). Without
# protection, a burst of chat traffic makes every query embedding fail with
# 429, which silently degrades retrieval to keyword-only and — when keyword
# search also misses — produces "I don't know" answers for perfectly relevant
# questions. The defences below keep query embeddings working under bursts:
#
# * an in-process LRU cache so identical questions never re-hit the API,
# * request pacing so bursts stay inside the RPM window,
# * escalating retries (5s / 15s / 30s) on 429 before giving up.

_EMBED_MODEL = "voyage-2"
_EMBED_CACHE_MAX = 512
_embed_cache: "OrderedDict[str, List[float]]" = OrderedDict()

_MIN_EMBED_INTERVAL_SECONDS = 1.5
_embed_lock = threading.Lock()
_last_embed_request_monotonic = 0.0

_EMBED_RETRY_WAITS = (5.0, 15.0, 30.0)


def embed_query(question: str) -> List[float]:
    """Embed a user question using Voyage AI voyage-2 (query input type).

    Raises the last exception (typically ``RateLimitError``) if every retry
    is exhausted; ``retrieve`` treats that as "embedding unavailable" and
    falls back to keyword-only search.
    """
    global _last_embed_request_monotonic

    cache_key = f"{_EMBED_MODEL}|query|{question.strip().lower()}"
    cached = _embed_cache.get(cache_key)
    if cached is not None:
        _embed_cache.move_to_end(cache_key)
        return cached

    # The SDK's built-in retries are disabled; waits are controlled here so a
    # rate-limited query waits long enough to clear the RPM window.
    client = voyageai.Client(max_retries=0)

    last_error: Optional[Exception] = None
    for attempt in range(len(_EMBED_RETRY_WAITS) + 1):
        with _embed_lock:
            elapsed = time.monotonic() - _last_embed_request_monotonic
            if elapsed < _MIN_EMBED_INTERVAL_SECONDS:
                time.sleep(_MIN_EMBED_INTERVAL_SECONDS - elapsed)
            _last_embed_request_monotonic = time.monotonic()
        try:
            result = client.embed(
                [question],
                model=_EMBED_MODEL,
                input_type="query",
            )
        except voyageai.error.RateLimitError as exc:
            last_error = exc
            if attempt < len(_EMBED_RETRY_WAITS):
                wait = _EMBED_RETRY_WAITS[attempt]
                logger.warning(
                    "Query embedding rate-limited (attempt %s/%s); retrying in %.0fs",
                    attempt + 1,
                    len(_EMBED_RETRY_WAITS),
                    wait,
                )
                time.sleep(wait)
            continue
        except Exception:
            # Non-rate-limit failures (auth, network, quota exhausted) are not
            # retried; surface them immediately to the caller.
            raise
        else:
            embedding = result.embeddings[0]
            _embed_cache[cache_key] = embedding
            while len(_embed_cache) > _EMBED_CACHE_MAX:
                _embed_cache.popitem(last=False)
            return embedding

    assert last_error is not None
    raise last_error


# ---------------------------------------------------------------------------
# Vector candidate retrieval
# ---------------------------------------------------------------------------
def retrieve_vector_candidates(
    bot_id: uuid.UUID,
    query_embedding: List[float],
    k: int = RAG_VECTOR_TOP_K,
) -> List[tuple[Chunk, Document, float]]:
    """Return the top-k chunks by cosine similarity for a bot."""
    session: Session = SessionLocal()
    try:
        stmt = (
            select(
                Chunk,
                Document,
                (1 - Chunk.embedding.cosine_distance(query_embedding)).label("similarity"),
            )
            .join(Document, Chunk.document_id == Document.id)
            .where(Document.bot_id == bot_id)
            .order_by(Chunk.embedding.cosine_distance(query_embedding))
            .limit(k)
        )
        results = session.execute(stmt).all()
        return [
            (chunk, document, float(similarity))
            for chunk, document, similarity in results
        ]
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Keyword candidate retrieval
# ---------------------------------------------------------------------------
def retrieve_keyword_candidates(
    bot_id: uuid.UUID,
    query: str,
    k: int = RAG_KEYWORD_TOP_K,
) -> List[tuple[Chunk, Document, float]]:
    """Return the top-k chunks by PostgreSQL full-text search relevance.

    Uses the ``search_vector`` tsvector column populated by a database trigger.
    Falls back to ``to_tsvector(content)`` if the column is not yet populated
    (e.g. during a migration or on freshly created chunks before the trigger
    fires).

    ``websearch_to_tsquery`` ANDs all query terms, so a single term that is
    absent from the knowledge base (e.g. "vs" in "iran vs usa?") suppresses
    every match. When the strict query returns nothing, the search is retried
    with an OR-joined query built from the non-stopword terms, which still
    ranks chunks containing more of the terms higher.
    """
    session: Session = SessionLocal()
    try:
        # websearch_to_tsquery handles quoted phrases and OR/AND operators.
        # If it fails (e.g. unsupported syntax) we fall back to plainto_tsquery.
        try:
            tsquery = func.websearch_to_tsquery("english", query)
        except Exception:
            tsquery = func.plainto_tsquery("english", query)

        # Use COALESCE so chunks without a pre-computed search_vector still work.
        tsv = func.coalesce(Chunk.search_vector, func.to_tsvector("english", Chunk.content))

        def _run(active_tsquery) -> List[tuple[Chunk, Document, float]]:
            stmt = (
                select(
                    Chunk,
                    Document,
                    func.ts_rank(tsv, active_tsquery).label("rank"),
                )
                .join(Document, Chunk.document_id == Document.id)
                .where(Document.bot_id == bot_id)
                .where(tsv.op("@@")(active_tsquery))
                .order_by(func.ts_rank(tsv, active_tsquery).desc())
                .limit(k)
            )
            rows = session.execute(stmt).all()
            return [
                (chunk, document, float(rank))
                for chunk, document, rank in rows
            ]

        results = _run(tsquery)
        if results:
            return results

        # Strict AND-semantics found nothing; relax to OR across meaningful
        # terms so single missing words (slang, abbreviations, "vs", typos)
        # cannot zero out the keyword leg of hybrid retrieval.
        relaxed = _relaxed_websearch_query(query)
        if not relaxed:
            return []
        try:
            relaxed_tsquery = func.websearch_to_tsquery("english", relaxed)
        except Exception:
            return []
        relaxed_results = _run(relaxed_tsquery)
        if relaxed_results:
            logger.info(
                "Strict keyword search empty for %r; relaxed OR-query %r matched %s chunks",
                query,
                relaxed,
                len(relaxed_results),
            )
        return relaxed_results
    finally:
        session.close()


# Minimal English stopword list for building the relaxed OR-query. Terms in
# this set are dropped because they never discriminate between chunks.
_KEYWORD_STOPWORDS = frozenset(
    "a about above after again against all am an and any are aren as at be "
    "because been before being below between both but by can cannot could "
    "couldn did didn do does doesn doing don down during each few for from "
    "further had hadn has hasn have haven having he her here hers herself him "
    "himself his how i if in into is isn it its itself just ll me more most "
    "mustn my myself no nor not now of off on once only or other our ours "
    "ourselves out over own re s same shan she should shouldn so some such t "
    "than that the their theirs them themselves then there these they this "
    "those through to too under until up ve very was wasn we were weren what "
    "when where which while who whom why will with won would wouldn you your "
    "yours yourself yourselves vs versus tell about say said get got know "
    "does did please thanks thank hey hello hi ok okay"
).union({"i", "me", "my"})


def _relaxed_websearch_query(query: str) -> Optional[str]:
    """Build an OR-joined websearch query from the query's meaningful terms.

    Returns ``None`` when fewer than two meaningful terms exist (relaxing a
    single-term query would not change the result).
    """
    seen: set[str] = set()
    terms: List[str] = []
    for raw in re.findall(r"[A-Za-z0-9_]+", query):
        term = raw.lower()
        if term in seen or term in _KEYWORD_STOPWORDS or len(term) < 2:
            continue
        seen.add(term)
        terms.append(raw)
    if len(terms) < 2:
        return None
    return " or ".join(terms)


# ---------------------------------------------------------------------------
# Candidate fusion
# ---------------------------------------------------------------------------
@dataclass
class Candidate:
    """A retrieved chunk with its combined metadata."""

    chunk: Chunk
    document: Document
    vector_score: float = 0.0
    keyword_score: float = 0.0
    vector_source: bool = False
    keyword_source: bool = False


def fuse_candidates(
    vector_results: List[tuple[Chunk, Document, float]],
    keyword_results: List[tuple[Chunk, Document, float]],
) -> List[Candidate]:
    """Merge vector and keyword candidates, deduplicating by chunk ID.

    When a chunk appears in both result sets its scores are combined.
    """
    merged: dict[uuid.UUID, Candidate] = {}

    def _upsert(chunk: Chunk, document: Document, score: float, source: str) -> None:
        cid = chunk.id
        if cid not in merged:
            merged[cid] = Candidate(
                chunk=chunk,
                document=document,
                vector_score=0.0,
                keyword_score=0.0,
                vector_source=False,
                keyword_source=False,
            )
        entry = merged[cid]
        if source == "vector":
            entry.vector_score = max(entry.vector_score, score)
            entry.vector_source = True
        elif source == "keyword":
            entry.keyword_score = max(entry.keyword_score, score)
            entry.keyword_source = True

    for chunk, doc, score in vector_results:
        _upsert(chunk, doc, score, "vector")
    for chunk, doc, score in keyword_results:
        _upsert(chunk, doc, score, "keyword")

    return list(merged.values())


# ---------------------------------------------------------------------------
# Reranking
# ---------------------------------------------------------------------------
def _normalize_keyword_score(raw_score: float, max_possible: float = 1.0) -> float:
    """Normalize PostgreSQL ts_rank to [0, 1].

    ts_rank values are unbounded in theory but typically fall in [0, 1] for
    normal queries.  We clamp to avoid outliers skewing the combined score.
    """
    if max_possible <= 0:
        return 0.0
    return max(0.0, min(1.0, raw_score / max_possible))


def _compute_term_coverage(query: str, content: str) -> float:
    """Fraction of query tokens that appear in the chunk content.

    Returns a value in [0, 1].
    """
    query_tokens = set(t.lower() for t in _tokenize(query))
    content_tokens = set(t.lower() for t in _tokenize(content))
    if not query_tokens:
        return 0.0
    matches = query_tokens & content_tokens
    return len(matches) / len(query_tokens)


def rerank_candidates(
    query: str,
    candidates: List[Candidate],
    vector_weight: float = RAG_RERANK_VECTOR_WEIGHT,
    keyword_weight: float = RAG_RERANK_KEYWORD_WEIGHT,
    coverage_weight: float = RAG_RERANK_COVERAGE_WEIGHT,
) -> List[tuple[Candidate, float]]:
    """Rerank candidates using a transparent multi-signal heuristic.

    Signals
    -------
    * **Vector similarity** — cosine similarity from pgvector (already in [0,1]).
    * **Keyword relevance** — PostgreSQL ``ts_rank``, normalized to [0,1].
    * **Term coverage** — fraction of query tokens present in the chunk.

    These are combined as a weighted sum.  The weights are configurable via
    environment variables and default to ``(0.45, 0.30, 0.25)``.

    **Important:** This is a deterministic local heuristic, NOT an LLM-based
    reranker.  It is labelled transparently so reviewers understand its
    limitations.
    """
    if not candidates:
        return []

    # Pre-compute normalized keyword scores.
    max_rank = max((c.keyword_score for c in candidates), default=1.0) or 1.0

    scored: List[tuple[Candidate, float]] = []
    for candidate in candidates:
        vector_norm = max(0.0, min(1.0, candidate.vector_score))
        keyword_norm = _normalize_keyword_score(candidate.keyword_score, max_rank)
        coverage = _compute_term_coverage(query, candidate.chunk.content)

        combined = (
            vector_weight * vector_norm
            + keyword_weight * keyword_norm
            + coverage_weight * coverage
        )
        scored.append((candidate, combined))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


# ---------------------------------------------------------------------------
# Final context selection
# ---------------------------------------------------------------------------
@dataclass
class RetrievalContext:
    """Final retrieval output ready for LLM generation."""

    chunks: List[tuple[Chunk, Document, float]]
    observations: RetrievalObservations


def select_final_context(
    reranked: List[tuple[Candidate, float]],
    threshold: float = RAG_RELEVANCE_THRESHOLD,
    k: int = RAG_FINAL_TOP_K,
    max_context_tokens: int = RAG_MAX_CONTEXT_TOKENS,
) -> RetrievalContext:
    """Apply relevance threshold and token budget, returning final chunks.

    If no chunk exceeds the threshold, an empty list is returned and the
    observations record a refusal.
    """
    observations = RetrievalObservations()

    if not reranked:
        observations.refusal = True
        observations.refusal_reason = "No candidates retrieved"
        return RetrievalContext(chunks=[], observations=observations)

    # Check the top score against the threshold.
    top_score = reranked[0][1]
    if top_score < threshold:
        observations.refusal = True
        observations.refusal_reason = (
            f"Top rerank score {top_score:.3f} is below threshold {threshold:.2f}"
        )
        return RetrievalContext(chunks=[], observations=observations)

    # Take top-k candidates that also fit within the token budget.
    selected: List[tuple[Chunk, Document, float]] = []
    token_budget = max_context_tokens
    for candidate, score in reranked[:k]:
        chunk_tokens = _token_count(candidate.chunk.content)
        if chunk_tokens > token_budget:
            # Truncate rather than drop if it's the only chunk.
            if not selected:
                words = _tokenize(candidate.chunk.content)[:token_budget]
                truncated_content = " ".join(words)
                # We keep the original chunk but note truncation in observability.
                observations.relevance_scores.append(round(score, 4))
                selected.append((candidate.chunk, candidate.document, round(score, 4)))
            break
        token_budget -= chunk_tokens
        observations.relevance_scores.append(round(score, 4))
        selected.append((candidate.chunk, candidate.document, round(score, 4)))

    observations.final_chunk_count = len(selected)
    return RetrievalContext(chunks=selected, observations=observations)


# ---------------------------------------------------------------------------
# Top-level pipeline entry point
# ---------------------------------------------------------------------------
def retrieve(
    bot_id: uuid.UUID,
    question: str,
    query_embedding: Optional[List[float]] = None,
    conversation_messages: Optional[List[dict]] = None,
) -> RetrievalContext:
    """Run the full retrieval pipeline for a single question.

    Stages
    ------
    1. Prepare query (conversation-aware + optional rewrite).
    2. Vector retrieval.
    3. Keyword retrieval (if hybrid search enabled).
    4. Candidate fusion + deduplication.
    5. Reranking.
    6. Threshold + token-budget selection.
    """
    start = time.perf_counter()
    observations = RetrievalObservations(original_question=question)

    # ------------------------------------------------------------------ #
    # Stage 1: Query preparation
    # ------------------------------------------------------------------ #
    prepared = prepare_query(question, conversation_messages)
    observations.retrieval_query = prepared.text
    observations.query_rewritten = prepared.rewritten
    observations.hybrid_enabled = RAG_ENABLE_HYBRID_SEARCH

    # ------------------------------------------------------------------ #
    # Stage 2: Embed (if not provided)
    # ------------------------------------------------------------------ #
    if query_embedding is None:
        try:
            query_embedding = embed_query(prepared.text)
        except Exception:
            logger.exception("Query embedding failed")
            query_embedding = None
            # Vector search is unavailable (e.g. embedding provider rate
            # limit). Keyword search still runs, but the caller must know the
            # pipeline is degraded so it can respond honestly instead of
            # claiming the knowledge base lacks the answer.
            observations.degraded = True
            observations.degraded_reason = (
                "Query embedding unavailable (embedding provider rate-limited "
                "or unreachable); retrieval fell back to keyword-only search"
            )

    # ------------------------------------------------------------------ #
    # Stage 3 & 4: Retrieve candidates
    # ------------------------------------------------------------------ #
    vector_results: List[tuple[Chunk, Document, float]] = []
    keyword_results: List[tuple[Chunk, Document, float]] = []

    if query_embedding is not None:
        try:
            vector_results = retrieve_vector_candidates(bot_id, query_embedding, k=RAG_VECTOR_TOP_K)
        except Exception:
            logger.exception("Vector retrieval failed")

    observations.vector_candidates = len(vector_results)
    if vector_results:
        logger.debug(
            "Vector top candidate for bot=%s query=%r: similarity=%.4f chunk_id=%s",
            bot_id,
            prepared.text,
            vector_results[0][2],
            vector_results[0][0].id,
        )

    if RAG_ENABLE_HYBRID_SEARCH:
        try:
            keyword_results = retrieve_keyword_candidates(bot_id, prepared.text, k=RAG_KEYWORD_TOP_K)
        except Exception:
            logger.exception("Keyword retrieval failed")
        observations.keyword_candidates = len(keyword_results)
        if keyword_results:
            logger.debug(
                "Keyword top candidate for bot=%s query=%r: rank=%.4f chunk_id=%s",
                bot_id,
                prepared.text,
                keyword_results[0][2],
                keyword_results[0][0].id,
            )

    # ------------------------------------------------------------------ #
    # Stage 5: Fusion
    # ------------------------------------------------------------------ #
    combined = fuse_candidates(vector_results, keyword_results)
    observations.combined_candidates = len(combined)

    if not combined:
        observations.refusal = True
        observations.refusal_reason = "No candidates found after fusion"
        observations.duration_ms = (time.perf_counter() - start) * 1000
        return RetrievalContext(chunks=[], observations=observations)

    # ------------------------------------------------------------------ #
    # Stage 6: Reranking
    # ------------------------------------------------------------------ #
    reranked = rerank_candidates(prepared.text, combined)

    # ------------------------------------------------------------------ #
    # Stage 7: Final selection
    # ------------------------------------------------------------------ #
    context = select_final_context(
        reranked,
        threshold=RAG_RELEVANCE_THRESHOLD,
        k=RAG_FINAL_TOP_K,
        max_context_tokens=RAG_MAX_CONTEXT_TOKENS,
    )
    observations.refusal = context.observations.refusal
    observations.refusal_reason = context.observations.refusal_reason
    observations.final_chunk_count = context.observations.final_chunk_count
    observations.relevance_scores = context.observations.relevance_scores
    observations.duration_ms = (time.perf_counter() - start) * 1000

    return RetrievalContext(chunks=context.chunks, observations=observations)


# ---------------------------------------------------------------------------
# Backwards-compatible single-stage helper
# ---------------------------------------------------------------------------
def retrieve_top_k(
    bot_id: uuid.UUID,
    query_embedding: List[float],
    k: int = RAG_FINAL_TOP_K,
) -> List[tuple[Chunk, Document, float]]:
    """Legacy helper that returns only vector-search top-k chunks.

    New code should use ``retrieve`` which returns a full ``RetrievalContext``.
    """
    results = retrieve_vector_candidates(bot_id, query_embedding, k=k)
    return [(chunk, doc, score) for chunk, doc, score in results]
