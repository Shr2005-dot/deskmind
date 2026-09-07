from fastapi import FastAPI, status
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.staticfiles import StaticFiles

import logging
import os
from pathlib import Path

# Surface application logs (including ingestion tracebacks) in the console
# even when run through uvicorn, which is essential for debugging failures.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

from app.routes import auth, bots, documents, chat, analytics, leads, dashboard, conversations, account, activity

app = FastAPI(title="DeskMind API")

# ---------------------------------------------------------------------------
# CORS
#
# Dashboard routes require a specific frontend origin so that credentialed
# requests (Authorization header / cookies) are accepted by the browser.
#
# Public endpoints used by the embedded widget must accept any origin because
# the widget runs on arbitrary client websites. We echo back the request's
# Origin header instead of using "*", and we echo back the requested headers
# instead of "*" because the CORS spec does not allow "*" for
# Access-Control-Allow-Headers.
# ---------------------------------------------------------------------------
RESTRICTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://deskmind-theta.vercel.app"
]


class SelectiveCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")
        path = request.url.path

        is_chat = path.startswith("/bots/") and "/chat" in path
        is_health = path == "/health"
        is_config = path.startswith("/bots/") and "/config" in path
        is_leads = path.startswith("/bots/") and "/leads" in path
        is_widget = path == "/widget.js"
        is_public = is_chat or is_health or is_config or is_leads or is_widget

        if request.method == "OPTIONS":
            response = Response(status_code=status.HTTP_204_NO_CONTENT)
        else:
            try:
                response = await call_next(request)
            except Exception:
                logging.getLogger(__name__).exception("Unhandled exception during request")
                response = JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content={"detail": "Internal server error"},
                )

        if is_public and origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            requested_headers = request.headers.get("access-control-request-headers", "")
            if requested_headers:
                response.headers["Access-Control-Allow-Headers"] = requested_headers
            else:
                response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept"
            response.headers["Access-Control-Allow-Credentials"] = "true"
        elif origin and origin in RESTRICTED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept"

        return response


app.add_middleware(SelectiveCORSMiddleware)


# ---------------------------------------------------------------------------
# Database outages
#
# The managed Postgres (Neon) suspends idle computes and wakes them on demand;
# while it is starting up (or during transient connection drops) queries raise
# SQLAlchemy errors. Those used to bubble up as a generic 500 "Internal server
# error", which told users nothing. Return a truthful 503 so the UI can tell
# the user to simply retry in a moment.
# ---------------------------------------------------------------------------
@app.exception_handler(SQLAlchemyError)
async def database_unavailable_handler(request, exc: SQLAlchemyError):
    logging.getLogger(__name__).exception("Database error during request")
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "detail": "Database is temporarily unavailable. Please try again in a moment."
        },
    )


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(bots.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(analytics.router)
app.include_router(leads.router)
app.include_router(dashboard.router)
app.include_router(conversations.router)
app.include_router(account.router)
app.include_router(activity.router)


# ---------------------------------------------------------------------------
# Widget script endpoint
#
# The embed snippet the dashboard hands out references ``<origin>/widget.js``.
# We serve the built IIFE bundle from the backend so the embed snippet works
# with a single script tag and the widget can auto-discover the API base URL
# from its own script origin.
# ---------------------------------------------------------------------------
WIDGET_JS_PATH = (
    Path(__file__).resolve().parent.parent / "widget" / "dist" / "widget.iife.js"
)


@app.get("/widget.js", include_in_schema=False)
def widget_js():
    if WIDGET_JS_PATH.exists():
        return FileResponse(WIDGET_JS_PATH, media_type="application/javascript")
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": "Widget bundle not found. Build it with `npm run build` in the widget/ directory."},
    )


# ---------------------------------------------------------------------------
# Uploaded bot avatars
#
# Defaults to a folder next to the app; override with AVATARS_DIR for
# platforms with a different writable path (e.g. /tmp on ephemeral hosts).
# ---------------------------------------------------------------------------
AVATARS_DIR = Path(os.getenv("AVATARS_DIR", str(Path(__file__).resolve().parent.parent / "uploads" / "avatars")))
AVATARS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/avatars", StaticFiles(directory=AVATARS_DIR), name="bot-avatars")