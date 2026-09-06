"""Configurable RAG (Retrieval-Augmented Generation) settings.

All values are read from environment variables with sensible defaults so the
application works out-of-the-box while remaining tunable without code changes.
"""

from __future__ import annotations

import os


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


# ---------------------------------------------------------------------------
# Hybrid retrieval
# ---------------------------------------------------------------------------
RAG_ENABLE_HYBRID_SEARCH: bool = _env_bool("RAG_ENABLE_HYBRID_SEARCH", True)

# How many candidates to pull from vector search before fusion.
RAG_VECTOR_TOP_K: int = _env_int("RAG_VECTOR_TOP_K", 15)

# How many candidates to pull from keyword search before fusion.
RAG_KEYWORD_TOP_K: int = _env_int("RAG_KEYWORD_TOP_K", 15)

# ---------------------------------------------------------------------------
# Final context selection
# ---------------------------------------------------------------------------
# Maximum chunks to include in the final prompt after reranking.
RAG_FINAL_TOP_K: int = _env_int("RAG_FINAL_TOP_K", 5)

# Minimum reranker score required for a chunk to be included.
# Scores are normalized to [0, 1].  Below this threshold the bot refuses.
RAG_RELEVANCE_THRESHOLD: float = _env_float("RAG_RELEVANCE_THRESHOLD", 0.30)

# Approximate token budget for the context window sent to the LLM.
# Chunks beyond this limit are truncated or dropped.
RAG_MAX_CONTEXT_TOKENS: int = _env_int("RAG_MAX_CONTEXT_TOKENS", 4000)

# ---------------------------------------------------------------------------
# Query rewriting
# ---------------------------------------------------------------------------
# When enabled, ambiguous follow-up questions may be rewritten before retrieval.
RAG_ENABLE_QUERY_REWRITE: bool = _env_bool("RAG_ENABLE_QUERY_REWRITE", True)

# Number of recent conversation turns to inspect for reference resolution.
RAG_CONVERSATION_CONTEXT_TURNS: int = _env_int("RAG_CONVERSATION_CONTEXT_TURNS", 4)

# ---------------------------------------------------------------------------
# Reranker weights
# ---------------------------------------------------------------------------
# These control the transparent local scoring heuristic. They do NOT require
# any external paid API.
#
# Weights must sum to 1.0 (approximately). Each component is normalized to
# [0, 1] before weighting.
RAG_RERANK_VECTOR_WEIGHT: float = _env_float("RAG_RERANK_VECTOR_WEIGHT", 0.45)
RAG_RERANK_KEYWORD_WEIGHT: float = _env_float("RAG_RERANK_KEYWORD_WEIGHT", 0.30)
RAG_RERANK_COVERAGE_WEIGHT: float = _env_float("RAG_RERANK_COVERAGE_WEIGHT", 0.25)
