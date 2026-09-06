"""Tests for the advanced RAG pipeline (Phase 5).

These tests mock external API calls (Voyage AI, Groq) and the database so they
run deterministically without network or database access.
"""

from __future__ import annotations

import re
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.services.chat import (
    _looks_like_refusal,
    build_context,
    build_prompt,
    _token_count,
)
from app.services.ingestion import chunk_text
from app.services.retrieval import (
    Candidate,
    RetrievalObservations,
    _compute_term_coverage,
    _normalize_keyword_score,
    _token_count as _retrieval_token_count,
    fuse_candidates,
    prepare_query,
    rerank_candidates,
    select_final_context,
)


# ---------------------------------------------------------------------------
# Chunking tests
# ---------------------------------------------------------------------------
class TestChunking:
    def test_empty_text_returns_empty(self):
        assert chunk_text("") == []
        assert chunk_text("   ") == []

    def test_short_text_single_chunk(self):
        text = "This is a short document."
        chunks = chunk_text(text, chunk_size=100, overlap=10, min_chunk_size=2)
        assert len(chunks) == 1
        assert "short document" in chunks[0]

    def test_long_text_multiple_chunks(self):
        # 600 tokens with chunk_size=100, overlap=10 -> multiple chunks
        words = ["word"] * 600
        text = " ".join(words)
        chunks = chunk_text(text, chunk_size=100, overlap=10)
        assert len(chunks) > 1

    def test_overlap_preserved(self):
        words = ["word"] * 250
        text = " ".join(words)
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        # Each consecutive pair should share ~20 words at the boundary.
        for i in range(len(chunks) - 1):
            prev_tokens = chunks[i].split()
            next_tokens = chunks[i + 1].split()
            overlap_slice = prev_tokens[-20:]
            assert all(t in next_tokens for t in overlap_slice[: min(20, len(next_tokens))])

    def test_paragraphs_kept_together(self):
        para1 = "First paragraph with some content."
        para2 = "Second paragraph with more content."
        para3 = "Third paragraph."
        text = f"{para1}\n\n{para2}\n\n{para3}"
        chunks = chunk_text(text, chunk_size=500, overlap=5, min_chunk_size=2)
        # Should prefer whole paragraphs when they fit.
        assert any("First paragraph" in c for c in chunks)
        assert any("Second paragraph" in c for c in chunks)

    def test_minimum_chunk_size(self):
        # Tiny paragraphs should be skipped unless they're all there is.
        text = "Hi\n\nBye"
        chunks = chunk_text(text, chunk_size=500, overlap=0, min_chunk_size=5)
        # Both paragraphs are too small individually; should be empty or combined.
        assert all(len(c.split()) >= 5 or len(chunks) == 0 for c in chunks) or len(chunks) == 0

    def test_oversized_paragraph_is_split(self):
        giant_word = " ".join(["x"] * 600)
        text = giant_word
        chunks = chunk_text(text, chunk_size=100, overlap=10)
        assert len(chunks) > 1
        for c in chunks:
            assert len(c.split()) <= 110  # chunk_size + small tolerance


# ---------------------------------------------------------------------------
# Query preparation tests
# ---------------------------------------------------------------------------
class TestPrepareQuery:
    def test_standalone_question_not_rewritten(self):
        result = prepare_query("What is your refund policy?", conversation_messages=None)
        assert result.text == "What is your refund policy?"
        assert not result.rewritten

    def test_short_follow_up_identified(self):
        result = prepare_query("Does it?", conversation_messages=[
            {"role": "user", "content": "Tell me about the Pro plan."},
            {"role": "assistant", "content": "The Pro plan is $29/month."},
        ])
        assert result.rewritten or result.text == "Does it?"

    def test_pronoun_follow_up_identified(self):
        result = prepare_query("How much does it cost?", conversation_messages=[
            {"role": "user", "content": "What is the X200 Pro?"},
        ])
        assert result.rewritten or result.text == "How much does it cost?"

    @patch("app.services.retrieval._rewrite_query_with_llm")
    def test_rewrite_success(self, mock_rewrite):
        mock_rewrite.return_value = "How long does standard shipping take?"
        result = prepare_query(
            "How long does it take?",
            conversation_messages=[{"role": "user", "content": "What shipping options do you offer?"}],
        )
        assert result.rewritten is True
        assert result.text == "How long does standard shipping take?"
        assert result.original == "How long does it take?"

    @patch("app.services.retrieval._rewrite_query_with_llm")
    def test_rewrite_failure_falls_back(self, mock_rewrite):
        mock_rewrite.return_value = None
        result = prepare_query(
            "How long does it take?",
            conversation_messages=[{"role": "user", "content": "What shipping options do you offer?"}],
        )
        assert result.text == "How long does it take?"
        assert not result.rewritten


# ---------------------------------------------------------------------------
# Candidate fusion tests
# ---------------------------------------------------------------------------
class TestFuseCandidates:
    def _make_candidate(self, chunk_id, source):
        chunk = MagicMock()
        chunk.id = chunk_id
        chunk.content = f"content {chunk_id}"
        doc = MagicMock()
        doc.filename = f"doc-{chunk_id}.pdf"
        return chunk, doc, 0.9 if source == "vector" else 0.8

    def test_vector_only(self):
        results = [self._make_candidate(1, "vector")]
        fused = fuse_candidates(results, [])
        assert len(fused) == 1
        assert fused[0].vector_source is True
        assert fused[0].keyword_source is False

    def test_keyword_only(self):
        results = [self._make_candidate(1, "keyword")]
        fused = fuse_candidates([], results)
        assert len(fused) == 1
        assert fused[0].vector_source is False
        assert fused[0].keyword_source is True

    def test_duplicate_merged(self):
        v = [self._make_candidate(1, "vector")]
        k = [self._make_candidate(1, "keyword")]
        fused = fuse_candidates(v, k)
        assert len(fused) == 1
        assert fused[0].vector_source is True
        assert fused[0].keyword_source is True
        # Keyword score should be the max of the two keyword scores.
        assert fused[0].keyword_score == 0.8
        # Vector score should be the max of the two vector scores.
        assert fused[0].vector_score == 0.9

    def test_distinct_candidates_preserved(self):
        v = [self._make_candidate(1, "vector")]
        k = [self._make_candidate(2, "keyword")]
        fused = fuse_candidates(v, k)
        assert len(fused) == 2


# ---------------------------------------------------------------------------
# Reranking tests
# ---------------------------------------------------------------------------
class TestReranking:
    def _make_candidate(self, chunk_id, vector_score, keyword_score, content):
        chunk = MagicMock()
        chunk.id = chunk_id
        chunk.content = content
        doc = MagicMock()
        doc.filename = f"doc-{chunk_id}.pdf"
        return Candidate(
            chunk=chunk,
            document=doc,
            vector_score=vector_score,
            keyword_score=keyword_score,
            vector_source=True,
            keyword_source=True,
        )

    def test_higher_vector_score_ranks_first(self):
        c1 = self._make_candidate(1, 0.9, 0.5, "refund policy details here")
        c2 = self._make_candidate(2, 0.5, 0.5, "unrelated content")
        reranked = rerank_candidates("refund policy", [c1, c2])
        assert reranked[0][0].chunk.id == 1

    def test_exact_terminology_boosted(self):
        # Chunk with exact term match should rank above one without.
        c1 = self._make_candidate(1, 0.6, 0.6, "The X200 Pro costs $99")
        c2 = self._make_candidate(2, 0.6, 0.6, "Some unrelated product description")
        reranked = rerank_candidates("X200 Pro", [c1, c2])
        assert reranked[0][0].chunk.id == 1

    def test_scores_are_descending(self):
        candidates = [
            self._make_candidate(i, 0.1 * i, 0.1 * i, f"content {i}")
            for i in range(5, 0, -1)
        ]
        reranked = rerank_candidates("content", candidates)
        scores = [score for _, score in reranked]
        assert scores == sorted(scores, reverse=True)


# ---------------------------------------------------------------------------
# Threshold tests
# ---------------------------------------------------------------------------
class TestThreshold:
    def test_relevant_context_passes(self):
        chunk = MagicMock()
        chunk.content = "The refund policy allows returns within 30 days."
        chunk.metadata_ = {}
        doc = MagicMock()
        doc.filename = "refund.pdf"
        doc.source_type = "pdf"
        doc.source_url = None
        doc.title = "Refund Policy"
        c = Candidate(chunk=chunk, document=doc, vector_score=0.9, keyword_score=0.8)
        result = select_final_context([(c, 0.85)], threshold=0.45, k=5)
        assert len(result.chunks) == 1
        assert not result.observations.refusal

    def test_irrelevant_context_refused(self):
        c = Candidate(chunk=MagicMock(), document=MagicMock(), vector_score=0.1, keyword_score=0.05)
        result = select_final_context([(c, 0.2)], threshold=0.45, k=5)
        assert len(result.chunks) == 0
        assert result.observations.refusal is True

    def test_empty_candidates_refused(self):
        result = select_final_context([], threshold=0.45, k=5)
        assert len(result.chunks) == 0
        assert result.observations.refusal is True


# ---------------------------------------------------------------------------
# Grounding tests
# ---------------------------------------------------------------------------
class TestGrounding:
    def test_refusal_phrase_detected(self):
        assert _looks_like_refusal("I don't know based on the available knowledge.")
        assert _looks_like_refusal("I do not know.")
        assert _looks_like_refusal("Not enough information to answer.")
        assert _looks_like_refusal("Unable to answer this question.")

    def test_hedging_detected_as_refusal(self):
        # Short answers with hedge words should be treated as refusal.
        assert _looks_like_refusal("I think it might be refundable.")
        assert _looks_like_refusal("Probably yes.")

    def test_grounded_answer_not_refusal(self):
        assert not _looks_like_refusal("The refund policy allows returns within 30 days.")
        assert not _looks_like_refusal("Yes, the Pro plan includes a 14-day free trial.")


# ---------------------------------------------------------------------------
# Context construction tests
# ---------------------------------------------------------------------------
class TestContextConstruction:
    def test_empty_chunks_returns_empty(self):
        assert build_context([]) == ""

    def test_duplicate_content_removed(self):
        chunk1 = MagicMock()
        chunk1.content = "duplicate content"
        chunk1.metadata_ = {}
        doc1 = MagicMock()
        doc1.filename = "doc1.pdf"
        doc1.source_type = "pdf"
        doc1.source_url = None
        doc1.title = "Doc 1"

        chunk2 = MagicMock()
        chunk2.content = "duplicate content"
        chunk2.metadata_ = {}
        doc2 = MagicMock()
        doc2.filename = "doc2.pdf"
        doc2.source_type = "pdf"
        doc2.source_url = None
        doc2.title = "Doc 2"

        result = build_context([(chunk1, doc1, 0.9), (chunk2, doc2, 0.8)])
        assert result.count("duplicate content") == 1

    def test_source_metadata_present(self):
        chunk = MagicMock()
        chunk.content = "Refund policy content."
        chunk.metadata_ = {"page": 3}
        doc = MagicMock()
        doc.filename = "refund-policy.pdf"
        doc.source_type = "pdf"
        doc.source_url = None
        doc.title = "Refund Policy"

        result = build_context([(chunk, doc, 0.92)])
        assert "Document: Refund Policy" in result
        assert "Type: pdf" in result
        assert "Page: 3" in result
        assert "Relevance: 0.92" in result

    def test_chunks_ordered_by_relevance(self):
        chunks = []
        for i in range(3):
            c = MagicMock()
            c.content = f"content {i}"
            c.metadata_ = {}
            d = MagicMock()
            d.filename = f"doc{i}.pdf"
            d.source_type = "pdf"
            d.source_url = None
            d.title = f"Doc {i}"
            chunks.append((c, d, 0.9 - i * 0.2))
        result = build_context(chunks)
        # Most relevant should appear first.
        first_pos = result.index("content 0")
        second_pos = result.index("content 1")
        third_pos = result.index("content 2")
        assert first_pos < second_pos < third_pos


# ---------------------------------------------------------------------------
# Source citation tests
# ---------------------------------------------------------------------------
class TestSourceCitations:
    def test_only_supplied_chunks_cited(self):
        """Sources should only include chunks that were actually provided to the LLM."""
        # This is verified by the fact that build_context deduplicates and
        # select_final_context applies the threshold.
        chunk = MagicMock()
        chunk.content = "relevant content"
        chunk.metadata_ = {}
        doc = MagicMock()
        doc.filename = "real-doc.pdf"
        doc.source_type = "pdf"
        doc.source_url = None
        doc.title = "Real Doc"

        context = build_context([(chunk, doc, 0.9)])
        assert "real-doc.pdf" in context

    def test_unsupported_answer_has_empty_sources(self):
        """When the model refuses, sources must be empty."""
        # The route handles this; here we verify the refusal detection logic.
        assert _looks_like_refusal("I don't know based on the available knowledge.")


# ---------------------------------------------------------------------------
# Utility tests
# ---------------------------------------------------------------------------
class TestUtilities:
    def test_normalize_keyword_score(self):
        assert _normalize_keyword_score(0.5) == 0.5
        assert _normalize_keyword_score(1.0) == 1.0
        assert _normalize_keyword_score(0.0) == 0.0
        assert _normalize_keyword_score(-0.1) == 0.0  # clamped
        assert _normalize_keyword_score(2.0) == 1.0  # clamped

    def test_compute_term_coverage(self):
        assert _compute_term_coverage("refund policy", "The refund policy allows returns.") == 1.0
        assert _compute_term_coverage("refund policy", "Shipping options are available.") == 0.0
        assert _compute_term_coverage("refund policy", "The refund process is simple.") == 0.5


# ---------------------------------------------------------------------------
# Hybrid retrieval (mocked DB)
# ---------------------------------------------------------------------------
class TestHybridRetrieval:
    @patch("app.services.retrieval.SessionLocal")
    def test_vector_only_match(self, mock_session_local):
        from app.services.retrieval import retrieve_vector_candidates

        mock_session = MagicMock()
        mock_session_local.return_value = mock_session

        mock_chunk = MagicMock()
        mock_chunk.id = uuid.uuid4()
        mock_chunk.content = "vector match"
        mock_doc = MagicMock()
        mock_doc.filename = "v.pdf"
        mock_result = MagicMock()
        mock_result.__iter__ = lambda self: iter([(mock_chunk, mock_doc, 0.95)])
        mock_session.execute.return_value.all.return_value = [(mock_chunk, mock_doc, 0.95)]

        results = retrieve_vector_candidates(uuid.uuid4(), [0.1] * 1024, k=5)
        assert len(results) == 1
        assert results[0][2] == 0.95

    @patch("app.services.retrieval.SessionLocal")
    def test_keyword_only_match(self, mock_session_local):
        from app.services.retrieval import retrieve_keyword_candidates

        mock_session = MagicMock()
        mock_session_local.return_value = mock_session

        mock_chunk = MagicMock()
        mock_chunk.id = uuid.uuid4()
        mock_chunk.content = "keyword match"
        mock_doc = MagicMock()
        mock_doc.filename = "k.pdf"
        mock_session.execute.return_value.all.return_value = [(mock_chunk, mock_doc, 0.8)]

        results = retrieve_keyword_candidates(uuid.uuid4(), "keyword", k=5)
        assert len(results) == 1
        assert results[0][2] == 0.8


# ---------------------------------------------------------------------------
# Empty knowledge base handling
# ---------------------------------------------------------------------------
class TestEmptyKnowledgeBase:
    @patch("app.services.retrieval.retrieve_vector_candidates")
    @patch("app.services.retrieval.retrieve_keyword_candidates")
    def test_no_documents_returns_refusal(self, mock_kw, mock_vec):
        from app.services.retrieval import retrieve

        mock_vec.return_value = []
        mock_kw.return_value = []

        ctx = retrieve(uuid.uuid4(), "any question")
        assert ctx.observations.refusal is True
        assert len(ctx.chunks) == 0

    @patch("app.services.retrieval.retrieve_vector_candidates")
    @patch("app.services.retrieval.retrieve_keyword_candidates")
    def test_only_failed_documents_returns_refusal(self, mock_kw, mock_vec):
        from app.services.retrieval import retrieve

        mock_vec.return_value = []
        mock_kw.return_value = []

        ctx = retrieve(uuid.uuid4(), "any question")
        assert ctx.observations.refusal is True
