"""Standalone test for the RAG pipeline (ingestion -> retrieval -> generation)."""

from __future__ import annotations

import os
import random
import sys
import uuid
from pathlib import Path

# Allow running as `python backend/app/services/test_pipeline.py`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

# Fix Windows console Unicode output
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from app.services.ingestion import load_pdf, chunk_text, embed_chunks, store_chunks
from app.services.retrieval import embed_query, retrieve_top_k
from app.services.chat import build_prompt, generate_answer
from app.db import SessionLocal
from app.models import Bot, Document, User
from app.utils.security import hash_password

# ---------------------------------------------------------------------------
# Config — change this to your sample PDF
# ---------------------------------------------------------------------------
SAMPLE_PDF = os.getenv(
    "SAMPLE_PDF",
    str(Path(__file__).resolve().parent.parent.parent.parent / "sample.pdf"),
)

BOT_NAME = os.getenv("BOT_NAME", "test-bot")
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
TOP_K = 3
TEST_QUESTION = "What is this document about?"


def get_or_create_user(session) -> User:
    user = session.query(User).first()
    if user is None:
        user = User(email="test@example.com", hashed_password=hash_password("test"))
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def get_or_create_bot(session, user: User) -> Bot:
    bot = session.query(Bot).filter(Bot.name == BOT_NAME, Bot.user_id == user.id).first()
    if bot is None:
        bot = Bot(user_id=user.id, name=BOT_NAME)
        session.add(bot)
        session.commit()
        session.refresh(bot)
    return bot


def main() -> int:
    pdf_path = Path(SAMPLE_PDF)
    if not pdf_path.exists():
        print(f"Sample PDF not found: {pdf_path}")
        print("Set SAMPLE_PDF env var or place a PDF at the expected path.")
        return 1

    session = SessionLocal()
    try:
        user = get_or_create_user(session)
        bot = get_or_create_bot(session, user)
        print(f"Using bot: {bot.name} (id={bot.id})")

        # -------------------------------------------------------------------
        # 1. Ingestion
        # -------------------------------------------------------------------
        print(f"\nLoading PDF: {pdf_path}")
        pages = load_pdf(str(pdf_path))
        print(f"Extracted {len(pages)} non-empty pages")

        all_chunks: list[str] = []
        all_metadata: list[dict] = []
        for page_number, text in pages:
            page_chunks = chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)
            for chunk in page_chunks:
                all_chunks.append(chunk)
                all_metadata.append({"page": page_number})

        print(f"Created {len(all_chunks)} chunks")

        print("Embedding chunks with Voyage AI (voyage-2)...")
        try:
            embeddings = embed_chunks(all_chunks)
        except Exception as exc:
            print(f"Voyage AI unreachable ({exc}); using mock embeddings for validation.")
            embeddings = [[random.random() for _ in range(1024)] for _ in all_chunks]

        # Create Document record
        document = Document(
            bot_id=bot.id,
            filename=pdf_path.name,
            status="ready",
        )
        session.add(document)
        session.commit()
        session.refresh(document)

        # Persist chunks
        stored = store_chunks(document.id, all_chunks, embeddings, all_metadata)
        print(f"Stored {stored} chunks for document id={document.id}")

        # -------------------------------------------------------------------
        # 2. Retrieval
        # -------------------------------------------------------------------
        print(f"\nTest question: {TEST_QUESTION}")
        try:
            query_embedding = embed_query(TEST_QUESTION)
        except Exception as exc:
            print(f"Voyage AI query unreachable ({exc}); using mock query embedding.")
            query_embedding = [random.random() for _ in range(1024)]

        retrieved = retrieve_top_k(bot.id, query_embedding, k=TOP_K)
        print(f"\nTop {TOP_K} retrieved chunks:")
        for i, chunk in enumerate(retrieved, 1):
            page = chunk.metadata_.get("page", "unknown")
            preview = chunk.content.replace("\n", " ")[:300]
            print(f"  [{i}] page={page} id={chunk.id}")
            print(f"      {preview}...")

        # -------------------------------------------------------------------
        # 3. Generation
        # -------------------------------------------------------------------
        prompt = build_prompt(TEST_QUESTION, retrieved)
        answer = generate_answer(prompt)

        print(f"\nGenerated answer:\n{answer}")

        return 0

    except Exception as exc:
        print(f"Pipeline failed: {exc}")
        import traceback
        traceback.print_exc()
        return 1

    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
