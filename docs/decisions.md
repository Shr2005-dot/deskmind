# Architectural Decisions

## CORS Policy for Public vs Protected Endpoints

**Date:** 2026-08-22

### Decision
Allow open CORS (`Access-Control-Allow-Origin: *`) specifically for the public chat endpoint `/bots/{bot_id}/chat`, while keeping all authenticated endpoints restricted to known dashboard origins (`localhost:3000` and future production dashboard URL).

### Rationale
- The embeddable chat widget runs on arbitrary client websites (unknown domains).
- The `/bots/{bot_id}/chat` endpoint is intentionally unauthenticated because the widget is a public-facing product feature.
- Authenticated endpoints (bot CRUD, document management, auth) must remain restricted to the dashboard to prevent unauthorized access.
- This is a standard SaaS pattern: public API endpoints expose open CORS, while private API endpoints do not.

### Tradeoffs
- Open CORS on the chat endpoint means any website can embed the widget and make chat requests. This is acceptable because the chat endpoint is designed to be public.
- Rate limiting and abuse prevention should be implemented at the API gateway or load balancer level if needed.

## Chat Endpoint Never Returns 5xx (Provider Failures Degrade to a Readable Answer)

**Date:** 2026-09-26

### Decision
`POST /bots/{bot_id}/chat` always answers `200 OK` with a user-readable `answer`, even when retrieval (Voyage AI embeddings) or generation (Groq) fails. Failures are logged server-side with full tracebacks and the user is told to retry.

### Rationale
- The deployed backend sits behind Cloudflare, which replaces a 5xx response body with its own HTML error page. That page carries no CORS headers, so the browser cannot read it and axios reports only `Network Error` — a dead end with no useful information for the user.
- The chat endpoint is user-facing, so an apologetic, retryable answer is better UX than an opaque failure.
- Retrieval already degraded gracefully (keyword-only search plus `observations.degraded`); applying the same idea to generation keeps behaviour consistent.

### Tradeoffs
- Monitors cannot rely on HTTP status codes to detect provider outages; use the server log (`Retrieval failed for bot ...` / `Generation failed for bot ...`) or `retrieval_details.degraded`.
- The assistant message is still persisted, so conversation history stays coherent and the user can simply retry.

## Groq Model Resolution with Fallback

**Date:** 2026-09-26

### Decision
The configured Groq model (`GROQ_MODEL`, default `openai/gpt-oss-120b`) is verified against Groq's model list on first use. When it is unavailable (retired, or withdrawn from the account) the backend falls back through `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`, caches the first working model for the process, and re-resolves if a call still returns `model_not_found`. Generation also caps `max_tokens` (1024) to stay inside the free tier's per-minute token budget.

### Rationale
- Groq retired `groq/compound-mini`, the previous default, so every grounded chat attempt failed with a 404 `model_not_found` and surfaced to users as `Network Error`.
- Model IDs are a fast-moving external dependency; a hard-coded default that can break the entire product is not resilient.
- Groq reserves prompt tokens plus `max_tokens` against the per-minute token limit, so an uncapped completion can trigger 429s on its own.

### Tradeoffs
- Fallback models differ slightly in style and quality; the warning log records which model served a request.
- One extra `models.list()` call per process.
