"""Document management routes."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import (
    DbSession,
    DocumentListResponse,
    get_bot_or_404,
    get_current_user,
    require_bot_owner,
)
from app.db import SessionLocal
from app.models import Bot, Document, Chunk
from app.services.ingestion import embed_chunks, load_pdf, load_text_file, scrape_url, chunk_text, store_chunks, _generate_fallback_embeddings, _clean_text
from app.services.safe_url import validate_url

router = APIRouter(prefix="/bots/{bot_id}/documents", tags=["documents"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "text/plain",
    "text/markdown",
}
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}

logger = logging.getLogger(__name__)


def _validate_upload_file(file: UploadFile) -> None:
    """Validate uploaded file size, MIME type, and extension."""
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. Allowed: PDF, TXT, MD",
        )

    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension: {extension}. Allowed: .pdf, .txt, .md",
        )

    # Check size without consuming the file stream
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE // (1024 * 1024)} MB",
        )


class UrlIngestRequest(BaseModel):
    url: str


def _run_ingestion(
    document_id: str,
    file_path: str | None = None,
    url: str | None = None,
) -> None:
    """Background ingestion pipeline for a single document.

    Supports both PDF file uploads and URL ingestion. Updates the Document
    status to one of:
      - ready
      - failed: chunking
      - failed: no content
      - failed: storage
      - failed (for any unexpected error; full traceback is logged)
    """
    session: Session = SessionLocal()
    document: Document | None = None
    try:
        document = session.get(Document, document_id)
        if document is None:
            logger.error("Document %s not found during background ingestion", document_id)
            return

        # Stage 1: chunking
        pages: list[tuple[int, str]] = []
        page_title: str | None = None
        try:
            # Re-verify the document still exists; it may have been deleted
            # while this background task was queued or running.
            document = session.get(Document, document_id)
            if document is None:
                logger.info("Document %s was deleted before chunking; aborting ingestion", document_id)
                return

            if url:
                text, page_title = scrape_url(url)
                # URL-extracted HTML text can contain NUL bytes or other control
                # characters that PostgreSQL Text columns reject.  Clean it the
                # same way we clean PDF / text-file content so store_chunks never
                # fails on bad characters.
                text = _clean_text(text)
                pages = [(1, text)]
            elif file_path:
                if Path(file_path).suffix.lower() == ".pdf":
                    pages = load_pdf(file_path)
                else:
                    # Plain-text sources (.txt / .md) are stored as one page.
                    pages = load_text_file(file_path)
            else:
                raise ValueError("No file path or URL provided for ingestion")
        except Exception as exc:
            logger.warning(
                "Chunking failed for document %s; marking as failed: %s",
                document_id,
                exc,
            )
            document = session.get(Document, document_id)
            if document is not None:
                document.status = "failed: chunking"
                session.commit()
            return

        # Update website metadata if applicable
        if url and page_title:
            document = session.get(Document, document_id)
            if document is not None:
                document.title = page_title
                document.fetched_at = datetime.now(timezone.utc)
                session.commit()

        all_chunks: list[str] = []
        all_metadata: list[dict] = []
        for page_number, text in pages:
            page_chunks = chunk_text(text)
            for chunk in page_chunks:
                all_chunks.append(chunk)
                all_metadata.append({"page": page_number})

        logger.info(
            "Document %s produced %s chunks across %s page(s)",
            document_id,
            len(all_chunks),
            len(pages),
        )

        if not all_chunks:
            logger.warning(
                "No chunks produced for document %s; marking as failed (no content)",
                document_id,
            )
            document = session.get(Document, document_id)
            if document is not None:
                document.status = "failed: no content"
                session.commit()
            return

        # Stage 2: embedding
        try:
            embeddings = embed_chunks(all_chunks)
        except Exception:
            logger.warning(
                "Embedding failed for document %s after retries; using fallback embeddings",
                document_id,
            )
            embeddings = _generate_fallback_embeddings(all_chunks)

        # Stage 3: storage
        try:
            document = session.get(Document, document_id)
            if document is None:
                logger.info("Document %s was deleted before storage; aborting chunk persistence", document_id)
                return
            store_chunks(document.id, all_chunks, embeddings, all_metadata)
        except Exception:
            logger.exception("Storage failed for document %s", document_id)
            document = session.get(Document, document_id)
            if document is not None:
                document.status = "failed: storage"
                session.commit()
            return

        document.status = "ready"
        session.commit()
        logger.info(
            "Ingestion complete for document %s: %s chunks stored",
            document_id,
            len(all_chunks),
        )
    except Exception:
        # Ensure no exception in any unexpected code path is ever silently
        # swallowed: log the FULL traceback and surface a generic failure so
        # the (polling) frontend sees it instead of a stuck "processing".
        logger.exception(
            "Unexpected error during ingestion for document %s", document_id
        )
        if document is not None:
            try:
                document.status = "failed"
                session.commit()
            except Exception:
                session.rollback()
                logger.exception(
                    "Could not persist failed status for document %s", document_id
                )
    finally:
        session.close()


@router.post("", status_code=status.HTTP_201_CREATED, response_model=DocumentListResponse)
def upload_document(
    bot_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: DbSession,
    current_user=Depends(get_current_user),
):
    _validate_upload_file(file)

    bot = require_bot_owner(bot_id, db, current_user)

    file_id = uuid.uuid4()
    file_extension = Path(file.filename or "upload.pdf").suffix.lower()
    safe_filename = f"{file_id}{file_extension}"
    file_path = UPLOAD_DIR / safe_filename

    with file_path.open("wb") as buffer:
        buffer.write(file.file.read())

    # Record the real source type so the dashboard shows the correct icon/label.
    source_type = {
        ".pdf": "pdf",
        ".txt": "txt",
        ".md": "markdown",
    }.get(file_extension, "pdf")

    document = Document(
        bot_id=bot.id,
        filename=file.filename or safe_filename,
        status="processing",
        source_type=source_type,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    background_tasks.add_task(_run_ingestion, str(document.id), str(file_path), None)

    return DocumentListResponse(
        id=str(document.id),
        filename=document.filename,
        status=document.status,
        source_type=document.source_type,
        uploaded_at=document.uploaded_at.isoformat() if document.uploaded_at else None,
        source_url=document.source_url,
        title=document.title,
        fetched_at=document.fetched_at.isoformat() if document.fetched_at else None,
        chunk_count=0,
    )


@router.post("/url", status_code=status.HTTP_201_CREATED, response_model=DocumentListResponse)
def ingest_url(
    bot_id: str,
    payload: UrlIngestRequest,
    background_tasks: BackgroundTasks,
    db: DbSession,
    current_user=Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)

    try:
        url = validate_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    # Check for duplicate URLs for this bot
    existing = db.scalar(
        select(Document).where(
            Document.bot_id == bot.id,
            Document.source_url == url,
            Document.source_type == "url",
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This page is already in your knowledge base.",
        )

    document = Document(
        bot_id=bot.id,
        filename=url,
        status="processing",
        source_type="url",
        source_url=url,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    background_tasks.add_task(_run_ingestion, str(document.id), None, url)

    return DocumentListResponse(
        id=str(document.id),
        filename=document.filename,
        status=document.status,
        source_type=document.source_type,
        uploaded_at=document.uploaded_at.isoformat() if document.uploaded_at else None,
        source_url=document.source_url,
        title=document.title,
        fetched_at=document.fetched_at.isoformat() if document.fetched_at else None,
        chunk_count=0,
    )


@router.get("", response_model=list[DocumentListResponse])
def list_documents(
    bot_id: str,
    db: DbSession,
    current_user=Depends(get_current_user),
) -> list[DocumentListResponse]:
    bot = require_bot_owner(bot_id, db, current_user)

    documents = db.scalars(
        select(Document).where(Document.bot_id == bot.id)
    ).all()

    # Efficiently fetch chunk counts for all documents in one query
    chunk_counts: dict[str, int] = {}
    if documents:
        rows = db.execute(
            select(Document.id, func.count(Document.id))
            .join(Document.chunks)
            .where(Document.bot_id == bot.id)
            .group_by(Document.id)
        ).all()
        chunk_counts = {str(doc_id): count for doc_id, count in rows}

    return [
        DocumentListResponse(
            id=str(doc.id),
            filename=doc.filename,
            status=doc.status,
            source_type=doc.source_type,
            uploaded_at=doc.uploaded_at.isoformat() if doc.uploaded_at else None,
            source_url=doc.source_url,
            title=doc.title,
            fetched_at=doc.fetched_at.isoformat() if doc.fetched_at else None,
            chunk_count=chunk_counts.get(str(doc.id), 0),
        )
        for doc in documents
    ]


@router.get("/{document_id}", response_model=DocumentListResponse)
def get_document(
    bot_id: str,
    document_id: str,
    db: DbSession,
    current_user=Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)

    document = db.get(Document, document_id)
    if not document or document.bot_id != bot.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    chunk_count = db.scalar(
        select(func.count(Document.id))
        .join(Document.chunks)
        .where(Document.id == document.id)
    ) or 0

    return DocumentListResponse(
        id=str(document.id),
        filename=document.filename,
        status=document.status,
        source_type=document.source_type,
        uploaded_at=document.uploaded_at.isoformat() if document.uploaded_at else None,
        source_url=document.source_url,
        title=document.title,
        fetched_at=document.fetched_at.isoformat() if document.fetched_at else None,
        chunk_count=chunk_count,
    )


@router.post("/{document_id}/refresh", status_code=status.HTTP_200_OK, response_model=DocumentListResponse)
def refresh_document(
    bot_id: str,
    document_id: str,
    background_tasks: BackgroundTasks,
    db: DbSession,
    current_user=Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)

    document = db.get(Document, document_id)
    if not document or document.bot_id != bot.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    if document.source_type != "url" or not document.source_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only website sources can be refreshed",
        )

    # Reset status and delete old chunks in a transaction
    document.status = "processing"
    document.fetched_at = datetime.now(timezone.utc)
    db.commit()

    # Delete existing chunks for this document before re-ingesting
    from app.models import Chunk
    db.query(Chunk).filter(Chunk.document_id == document.id).delete(synchronize_session=False)
    db.commit()

    background_tasks.add_task(_run_ingestion, str(document.id), None, document.source_url)

    return DocumentListResponse(
        id=str(document.id),
        filename=document.filename,
        status=document.status,
        source_type=document.source_type,
        uploaded_at=document.uploaded_at.isoformat() if document.uploaded_at else None,
        source_url=document.source_url,
        title=document.title,
        fetched_at=document.fetched_at.isoformat() if document.fetched_at else None,
        chunk_count=0,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    bot_id: str,
    document_id: str,
    db: DbSession,
    current_user=Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)

    document = db.get(Document, document_id)
    if not document or document.bot_id != bot.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    db.delete(document)
    db.commit()
    return None


@router.delete("", status_code=status.HTTP_200_OK)
def delete_all_documents(
    bot_id: str,
    db: DbSession,
    current_user=Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)

    documents = db.scalars(select(Document).where(Document.bot_id == bot.id)).all()
    count = len(documents)
    for document in documents:
        db.delete(document)
    db.commit()
    return {"deleted": count}
