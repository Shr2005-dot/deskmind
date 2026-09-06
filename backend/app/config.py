from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Core app settings
# ---------------------------------------------------------------------------
SUPABASE_DATABASE_URL: str | None = os.getenv("SUPABASE_DATABASE_URL")
DATABASE_URL: str = os.getenv(
    "SUPABASE_DATABASE_URL",
    os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://user:password@localhost:5432/deskmind",
    ),
)

# ---------------------------------------------------------------------------
# Auth / JWT
# ---------------------------------------------------------------------------
JWT_SECRET_KEY: str | None = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    if os.getenv("ENV", "development") == "production":
        raise RuntimeError("JWT_SECRET_KEY environment variable is required in production")
    JWT_SECRET_KEY = "deskmind-secret-change-me"
    logger.warning("JWT_SECRET_KEY not set; using insecure default for development")

JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# ---------------------------------------------------------------------------
# External services
# ---------------------------------------------------------------------------
GROQ_API_KEY: str | None = os.getenv("GROQ_API_KEY")
VOYAGE_API_KEY: str | None = os.getenv("VOYAGE_API_KEY")

# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------
GOOGLE_CLIENT_ID: str | None = os.getenv("GOOGLE_CLIENT_ID")
if not GOOGLE_CLIENT_ID:
    if os.getenv("ENV", "development") == "production":
        raise RuntimeError("GOOGLE_CLIENT_ID environment variable is required in production")
    logger.warning("GOOGLE_CLIENT_ID not set; Google auth will fail")

logger.info("Configuration loaded: database=%s, google_client_id=%s", DATABASE_URL, GOOGLE_CLIENT_ID)
# ---------------------------------------------------------------------------
# RAG settings (imported from dedicated module)
# ---------------------------------------------------------------------------
from app.services.rag_config import (  # noqa: E402
    RAG_CONVERSATION_CONTEXT_TURNS,
    RAG_ENABLE_HYBRID_SEARCH,
    RAG_ENABLE_QUERY_REWRITE,
    RAG_KEYWORD_TOP_K,
    RAG_MAX_CONTEXT_TOKENS,
    RAG_RELEVANCE_THRESHOLD,
    RAG_RERANK_COVERAGE_WEIGHT,
    RAG_RERANK_KEYWORD_WEIGHT,
    RAG_RERANK_VECTOR_WEIGHT,
    RAG_VECTOR_TOP_K,
    RAG_FINAL_TOP_K,
)
