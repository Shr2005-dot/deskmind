"""Groq model resolution and generation retry tests.

Groq retires model ids without warning. A retired id used to take the whole chat
endpoint down: generation raised ``model_not_found``, the route answered 502,
Cloudflare replaced that 502 with its own HTML error page (which carries no CORS
headers) and the browser could only report "Network Error". ``resolve_groq_model``
now verifies the configured model and falls back to known-good ones.
"""

from __future__ import annotations

from typing import Any, Iterable

import pytest

from app.services import chat as chat_service


class _FakeModel:
    def __init__(self, model_id: str) -> None:
        self.id = model_id


class _FakePage:
    def __init__(self, model_ids: Iterable[str]) -> None:
        self.data = [_FakeModel(model_id) for model_id in model_ids]


class _FakeModels:
    """Stands in for ``client.models``; ``model_ids`` may be mutated mid-test."""

    def __init__(self, model_ids: Iterable[str], error: Exception | None = None) -> None:
        self.model_ids = list(model_ids)
        self.error = error
        self.list_calls = 0

    def list(self) -> _FakePage:
        self.list_calls += 1
        if self.error is not None:
            raise self.error
        return _FakePage(self.model_ids)


class _FakeCompletion:
    def __init__(self, content: str) -> None:
        message = type("_Message", (), {"content": content})()
        self.choices = [type("_Choice", (), {"message": message})()]


class _FakeCompletions:
    """Returns queued outcomes in order; ``Exception`` entries are raised."""

    def __init__(self, outcomes: Iterable[Any] = ()) -> None:
        self._outcomes = list(outcomes)
        self.models_used: list[str] = []

    def create(self, *, model: str, messages: Any, max_tokens: int | None = None, **kwargs: Any):
        self.models_used.append(model)
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return _FakeCompletion(outcome)


class _FakeGroqClient:
    def __init__(
        self,
        model_ids: Iterable[str],
        outcomes: Iterable[Any] = (),
        list_error: Exception | None = None,
    ) -> None:
        self.models = _FakeModels(model_ids, error=list_error)
        self.chat = type("_Chat", (), {"completions": _FakeCompletions(outcomes)})()


def _model_not_found_error() -> Exception:
    """Build an exception shaped like the groq SDK's ``NotFoundError``."""
    error_type = type("NotFoundError", (Exception,), {})
    return error_type(
        "Error code: 404 - {'error': {'message': \"The model `groq/compound-mini` "
        "does not exist or you do not have access to it.\", "
        "'code': 'model_not_found'}}"
    )


@pytest.fixture(autouse=True)
def _reset_model_cache():
    """Each test starts and ends with an empty resolved-model cache."""
    chat_service.forget_resolved_groq_model()
    yield
    chat_service.forget_resolved_groq_model()


class TestResolveGroqModel:
    def test_uses_configured_model_when_available(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "openai/gpt-oss-120b")
        client = _FakeGroqClient(["openai/gpt-oss-120b", "openai/gpt-oss-20b"])

        assert chat_service.resolve_groq_model(client) == "openai/gpt-oss-120b"

    def test_falls_back_when_configured_model_retired(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "groq/compound-mini")
        client = _FakeGroqClient(["openai/gpt-oss-120b", "openai/gpt-oss-20b"])

        assert chat_service.resolve_groq_model(client) == "openai/gpt-oss-120b"

    def test_falls_back_to_smaller_models_in_order(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "groq/compound-mini")
        client = _FakeGroqClient(["openai/gpt-oss-20b", "qwen/qwen3.8-27b"])

        assert chat_service.resolve_groq_model(client) == "openai/gpt-oss-20b"

    def test_resolution_is_cached_for_the_process(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "groq/compound-mini")
        client = _FakeGroqClient(["openai/gpt-oss-120b"])

        assert chat_service.resolve_groq_model(client) == "openai/gpt-oss-120b"
        assert chat_service.resolve_groq_model(client) == "openai/gpt-oss-120b"
        assert client.models.list_calls == 1

    def test_model_listing_failure_falls_back_to_configured_model(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "openai/gpt-oss-120b")
        client = _FakeGroqClient([], list_error=Exception("network down"))

        assert chat_service.resolve_groq_model(client) == "openai/gpt-oss-120b"

    def test_unknown_model_everywhere_returns_the_configured_one(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "totally/made-up")
        client = _FakeGroqClient([])

        # Nothing matched, so the configured model is returned and the caller's
        # own error handling decides what to do.
        assert chat_service.resolve_groq_model(client) == "totally/made-up"


class TestIsModelUnavailable:
    def test_not_found_error_class(self):
        assert chat_service._is_model_unavailable(_model_not_found_error())

    def test_model_not_found_message(self):
        assert chat_service._is_model_unavailable(Exception("model_not_found"))

    def test_decommissioned_message(self):
        assert chat_service._is_model_unavailable(
            Exception("This model has been decommissioned.")
        )

    def test_connection_error_is_not_a_model_problem(self):
        assert not chat_service._is_model_unavailable(Exception("Connection reset by peer"))

    def test_rate_limit_is_not_a_model_problem(self):
        """A 429 must use the retry-with-wait path, not the model-fallback path."""
        assert not chat_service._is_model_unavailable(
            Exception(
                "Error code: 429 - Rate limit reached for model `openai/gpt-oss-120b` in "
                "organization org_x on tokens per minute (TPM): Limit 8000, Used 4184, "
                "Requested 5181. Please try again in 22.5s."
            )
        )


class TestGenerateAnswer:
    def test_recovers_when_the_model_is_retired_mid_flight(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "openai/gpt-oss-120b")
        client = _FakeGroqClient(
            ["openai/gpt-oss-120b"],
            outcomes=[_model_not_found_error(), "The return window is 30 days."],
        )
        monkeypatch.setattr(chat_service, "Groq", lambda *args, **kwargs: client)

        # The configured model resolves fine at first ...
        assert chat_service.resolve_groq_model(client) == "openai/gpt-oss-120b"
        # ... then Groq retires it before the completion lands.
        client.models.model_ids = ["openai/gpt-oss-20b"]

        assert chat_service.generate_answer("prompt") == "The return window is 30 days."
        assert client.chat.completions.models_used == [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
        ]

    def test_caps_completion_tokens_for_the_token_budget(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "openai/gpt-oss-120b")
        client = _FakeGroqClient(["openai/gpt-oss-120b"])
        seen: dict[str, Any] = {}

        def _spy(*, model: str, messages: Any, max_tokens: int | None = None, **kwargs: Any):
            seen["model"] = model
            seen["max_tokens"] = max_tokens
            return _FakeCompletion("Answer.")

        client.chat.completions.create = _spy
        monkeypatch.setattr(chat_service, "Groq", lambda *args, **kwargs: client)

        assert chat_service.generate_answer("prompt") == "Answer."
        assert seen["model"] == "openai/gpt-oss-120b"
        assert seen["max_tokens"] == chat_service._GENERATION_MAX_TOKENS

    def test_retries_after_a_rate_limit(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "openai/gpt-oss-120b")
        client = _FakeGroqClient(
            ["openai/gpt-oss-120b"],
            outcomes=[
                Exception(
                    "Error code: 429 - Rate limit reached for model "
                    "`openai/gpt-oss-120b` in organization org_x on tokens per minute "
                    "(TPM): Limit 8000, Used 4184, Requested 5181. "
                    "Please try again in 1.0s."
                ),
                "Answer after retry.",
            ],
        )
        monkeypatch.setattr(chat_service, "Groq", lambda *args, **kwargs: client)
        sleeps: list[float] = []
        monkeypatch.setattr(
            chat_service.time, "sleep", lambda seconds: sleeps.append(seconds)
        )

        assert chat_service.generate_answer("prompt") == "Answer after retry."
        # 1.0s suggested by Groq, plus a small safety margin.
        assert sleeps == [1.5]

    def test_non_retryable_failure_raises_for_the_route_to_degrade(self, monkeypatch):
        monkeypatch.setattr(chat_service, "GROQ_MODEL", "openai/gpt-oss-120b")
        client = _FakeGroqClient(["openai/gpt-oss-120b"], outcomes=[Exception("boom")])
        monkeypatch.setattr(chat_service, "Groq", lambda *args, **kwargs: client)

        with pytest.raises(Exception, match="boom"):
            chat_service.generate_answer("prompt")
        # Fails fast instead of burning the whole retry budget.
        assert client.chat.completions.models_used == ["openai/gpt-oss-120b"]
