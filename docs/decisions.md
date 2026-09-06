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
