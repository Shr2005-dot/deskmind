"""Chat endpoint tests."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import status

from app.models import Bot, Document, Message
from app.services.retrieval import RetrievalObservations


class TestChat:
    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_grounded_answer(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = False
        mock_chunk = MagicMock()
        mock_chunk.content = "context chunk"
        mock_chunk.metadata_ = {}
        mock_doc = MagicMock()
        mock_doc.filename = "doc.pdf"
        mock_context.chunks = [(mock_chunk, mock_doc, 0.95)]
        mock_retrieve.return_value = mock_context
        mock_generate.return_value = "The answer is 42."

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "What is the answer?"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["answer"] == "The answer is 42."
        assert len(data["sources"]) == 1
        assert data["sources"][0]["document_filename"] == "doc.pdf"

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_retrieval_refusal_no_llm_call(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = True
        mock_context.observations.refusal_reason = "No candidates found"
        mock_context.observations.degraded = False
        mock_context.observations.degraded_reason = ""
        mock_context.chunks = []
        mock_retrieve.return_value = mock_context

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Unknown question?"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["answer"] == "I don't know based on the available knowledge."
        assert data["sources"] == []
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_model_refusal_returns_empty_sources(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = False
        mock_chunk = MagicMock()
        mock_chunk.content = "context chunk"
        mock_chunk.metadata_ = {}
        mock_doc = MagicMock()
        mock_doc.filename = "doc.pdf"
        mock_context.chunks = [(mock_chunk, mock_doc, 0.5)]
        mock_retrieve.return_value = mock_context
        mock_generate.return_value = "I don't know based on the available knowledge."

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Unknown question?"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_debug_header_returns_details(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations = RetrievalObservations(
            original_question="What is the answer?",
            retrieval_query="What is the answer?",
            query_rewritten=False,
            hybrid_enabled=True,
            vector_candidates=15,
            keyword_candidates=8,
            combined_candidates=18,
            final_chunk_count=4,
            relevance_scores=[0.92, 0.87, 0.81, 0.76],
            duration_ms=120.5,
            refusal=False,
            refusal_reason="",
        )
        mock_chunk = MagicMock()
        mock_chunk.content = "context chunk"
        mock_chunk.metadata_ = {}
        mock_doc = MagicMock()
        mock_doc.filename = "doc.pdf"
        mock_context.chunks = [(mock_chunk, mock_doc, 0.92)]
        mock_retrieve.return_value = mock_context
        mock_generate.return_value = "The answer is 42."

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "What is the answer?"},
            headers={
                "Authorization": f"Bearer {token}",
                "x-debug-retrieval": "1",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "retrieval_details" in data
        assert data["retrieval_details"] is not None
        assert data["retrieval_details"]["vector_candidates"] == 15
        assert data["retrieval_details"]["keyword_candidates"] == 8
        assert data["retrieval_details"]["final_chunks"] == 4

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_no_debug_header_no_details(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = False
        mock_context.chunks = [(MagicMock(), MagicMock(), 0.9)]
        mock_retrieve.return_value = mock_context
        mock_generate.return_value = "Answer."

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Hello"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data.get("retrieval_details") is None

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_retrieval_failure_degrades_gracefully(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        """A retrieval outage must not surface as a 5xx.

        Cloudflare replaces a 5xx response body with its own HTML error page,
        which carries no CORS headers, so the browser can only report "Network
        Error". The endpoint therefore answers 200 with a retryable message.
        """
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        mock_retrieve.side_effect = Exception("Voyage is down")

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Tell me about your policies"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "temporarily unavailable" in data["answer"]
        assert data["sources"] == []
        assert data["prompt_for_email"] is False
        mock_generate.assert_not_called()

        # The reply is persisted, so the conversation stays coherent and the
        # user can simply ask again.
        messages = (
            db.query(Message)
            .filter(Message.conversation_id == uuid.UUID(data["conversation_id"]))
            .order_by(Message.created_at)
            .all()
        )
        assert [m.role for m in messages] == ["user", "assistant"]

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_generation_failure_degrades_gracefully(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        """A Groq outage (e.g. a retired GROQ_MODEL) must not surface as a 5xx."""
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = False
        mock_context.observations.degraded = False
        mock_chunk = MagicMock()
        mock_chunk.content = "We offer a 30 day return window."
        mock_chunk.metadata_ = {}
        mock_doc = MagicMock()
        mock_doc.filename = "policies.pdf"
        mock_context.chunks = [(mock_chunk, mock_doc, 0.93)]
        mock_retrieve.return_value = mock_context
        mock_generate.side_effect = Exception(
            "Error code: 404 - model_not_found: groq/compound-mini does not exist"
        )

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "What is the return window?"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "couldn't compose an answer" in data["answer"]
        assert "temporarily unavailable" in data["answer"]
        # Unverified sources must not be shown next to a failure message.
        assert data["sources"] == []
        assert data["prompt_for_email"] is False

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_never_returns_5xx_when_providers_fail(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        """Both providers failing still yields a readable answer, never a 5xx."""
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        mock_retrieve.side_effect = Exception("Voyage is down")
        mock_generate.side_effect = Exception("Groq is down")

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "What are your support hours?"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["answer"]

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_degraded_retrieval_reports_rate_limit(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        """Degraded retrieval says so, instead of claiming it does not know."""
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = True
        mock_context.observations.degraded = True
        mock_context.observations.degraded_reason = "Voyage rate limited"
        mock_context.chunks = []
        mock_retrieve.return_value = mock_context

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "What is your refund policy?"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "rate-limited" in data["answer"]
        assert data["sources"] == []
        mock_generate.assert_not_called()

    def test_chat_bot_not_found(self, client, test_user: User):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.post(
            f"/bots/{__import__('uuid').uuid4()}/chat",
            json={"message": "Hello"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_chat_invalid_conversation_id(self, client, test_user: User, test_bot: Bot, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Hello", "conversation_id": "not-a-uuid"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_prompt_for_email_business_question(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = False
        mock_chunk = MagicMock()
        mock_chunk.content = "We offer seasonal discounts."
        mock_chunk.metadata_ = {}
        mock_doc = MagicMock()
        mock_doc.filename = "policies.pdf"
        mock_context.chunks = [(mock_chunk, mock_doc, 0.95)]
        mock_retrieve.return_value = mock_context
        mock_generate.return_value = "Yes, we currently have a 20% discount."

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Are there any discounts available?"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["prompt_for_email"] is True
        assert data["answer"] == "Yes, we currently have a 20% discount."

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_prompt_for_email_news_updates_question(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = False
        mock_chunk = MagicMock()
        mock_chunk.content = "Daily tech news updates."
        mock_chunk.metadata_ = {}
        mock_doc = MagicMock()
        mock_doc.filename = "news.pdf"
        mock_context.chunks = [(mock_chunk, mock_doc, 0.95)]
        mock_retrieve.return_value = mock_context
        mock_generate.return_value = "You can get daily updates from our news section."

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "I want to get daily updates regarding that news site."},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["prompt_for_email"] is True
        assert data["answer"] == "You can get daily updates from our news section."

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_no_prompt_for_email_when_out_of_context(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = True
        mock_context.observations.refusal_reason = "No candidates found"
        mock_context.observations.degraded = False
        mock_context.observations.degraded_reason = ""
        mock_context.chunks = []
        mock_retrieve.return_value = mock_context

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Are there any discounts available?"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["prompt_for_email"] is False
        assert data["answer"] == "I don't know based on the available knowledge."

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_no_prompt_for_email_irrelevant_in_context_question(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        mock_context = MagicMock()
        mock_context.observations.refusal = False
        mock_chunk = MagicMock()
        mock_chunk.content = "The capital of France is Paris."
        mock_chunk.metadata_ = {}
        mock_doc = MagicMock()
        mock_doc.filename = "geography.pdf"
        mock_context.chunks = [(mock_chunk, mock_doc, 0.95)]
        mock_retrieve.return_value = mock_context
        mock_generate.return_value = "The capital of France is Paris."

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "What is the capital of France?"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["prompt_for_email"] is False
        assert data["answer"] == "The capital of France is Paris."


class TestConversationalChat:
    """Basic conversational questions must bypass RAG and return natural responses."""

    def _auth_header(self, user: User) -> dict[str, str]:
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(user.id)})
        return {"Authorization": f"Bearer {token}"}

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_greeting_skips_retrieval(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Hello"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []
        assert "hello" in data["answer"].lower() or "hi" in data["answer"].lower()
        mock_retrieve.assert_not_called()
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_hi_greeting_skips_retrieval(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Hi"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []
        mock_retrieve.assert_not_called()
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_who_are_you_returns_bot_intro(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Who are you?"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []
        assert test_bot.name in data["answer"]
        assert "assistant" in data["answer"].lower()
        mock_retrieve.assert_not_called()
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_what_can_you_do_returns_bot_intro(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "What can you do?"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []
        assert test_bot.name in data["answer"]
        mock_retrieve.assert_not_called()
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_thank_you_returns_thanks_response(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Thanks"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []
        assert "welcome" in data["answer"].lower() or "anything else" in data["answer"].lower()
        mock_retrieve.assert_not_called()
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_goodbye_returns_farewell(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "Goodbye"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []
        assert "goodbye" in data["answer"].lower() or "great day" in data["answer"].lower()
        mock_retrieve.assert_not_called()
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_nonsense_keyboard_spam_returns_rephrase(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "asdfghjkl"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []
        assert "rephrase" in data["answer"].lower() or "understood" in data["answer"].lower()
        mock_retrieve.assert_not_called()
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_nonsense_digits_returns_rephrase(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "123123123"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []
        assert "rephrase" in data["answer"].lower() or "understood" in data["answer"].lower()
        mock_retrieve.assert_not_called()
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_nonsense_repeated_chars_returns_rephrase(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "aaaaaaa"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["sources"] == []
        assert "rephrase" in data["answer"].lower() or "understood" in data["answer"].lower()
        mock_retrieve.assert_not_called()
        mock_generate.assert_not_called()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_business_question_still_uses_rag(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        """Business questions must still go through the full RAG pipeline."""
        mock_context = MagicMock()
        mock_context.observations.refusal = False
        mock_chunk = MagicMock()
        mock_chunk.content = "context chunk"
        mock_chunk.metadata_ = {}
        mock_doc = MagicMock()
        mock_doc.filename = "doc.pdf"
        mock_context.chunks = [(mock_chunk, mock_doc, 0.95)]
        mock_retrieve.return_value = mock_context
        mock_generate.return_value = "The answer is 42."

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "What is the answer?"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["answer"] == "The answer is 42."
        assert len(data["sources"]) == 1
        assert data["sources"][0]["document_filename"] == "doc.pdf"
        mock_retrieve.assert_called_once()
        mock_generate.assert_called_once()

    @patch("app.routes.chat.generate_answer")
    @patch("app.routes.chat.retrieve")
    def test_chat_out_of_context_business_question_still_refuses(
        self,
        mock_retrieve,
        mock_generate,
        client,
        test_user: User,
        test_bot: Bot,
        db,
    ):
        """Out-of-context business questions must still return the standard refusal."""
        mock_context = MagicMock()
        mock_context.observations.refusal = True
        mock_context.observations.refusal_reason = "No candidates found"
        mock_context.observations.degraded = False
        mock_context.observations.degraded_reason = ""
        mock_context.chunks = []
        mock_retrieve.return_value = mock_context

        response = client.post(
            f"/bots/{test_bot.id}/chat",
            json={"message": "What is the price of the premium subscription plan?"},
            headers=self._auth_header(test_user),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["answer"] == "I don't know based on the available knowledge."
        assert data["sources"] == []
        mock_generate.assert_not_called()
