"""Shared FastAPI dependencies, schemas, and authorization helpers."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Bot, Document, User
from app.utils.security import decode_access_token

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DbSession = Annotated[Session, Depends(get_db)]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DbSession,
) -> User:
    claims = decode_access_token(token)
    if claims is None or "sub" not in claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_bot_or_404(bot_id: str, db: DbSession) -> Bot:
    bot = db.get(Bot, bot_id)
    if not bot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    return bot


def require_bot_owner(
    bot_id: str,
    db: DbSession,
    current_user: User,
) -> Bot:
    bot = get_bot_or_404(bot_id, db)
    if bot.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    return bot


# ---------------------------------------------------------------------------
# Auth schemas
# ---------------------------------------------------------------------------
class UserResponse(BaseModel):
    id: str
    email: str
    google_id: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class SignupResponse(BaseModel):
    id: str
    email: str


# ---------------------------------------------------------------------------
# Bot schemas
# ---------------------------------------------------------------------------
class BotResponse(BaseModel):
    id: str
    name: str
    user_id: str
    avatar: str | None = None
    widget_color: str | None = None
    widget_name: str | None = None
    welcome_message: str | None = None
    suggested_questions: list[str] = []
    document_count: int = 0
    created_at: str | None = None


class BotListResponse(BaseModel):
    id: str
    name: str
    user_id: str
    avatar: str | None = None
    widget_color: str | None = None
    widget_name: str | None = None
    welcome_message: str | None = None
    suggested_questions: list[str] = []
    document_count: int = 0
    created_at: str | None = None


# ---------------------------------------------------------------------------
# Document schemas
# ---------------------------------------------------------------------------
class DocumentResponse(BaseModel):
    id: str
    filename: str
    status: str
    source_type: str
    uploaded_at: str | None = None
    source_url: str | None = None
    title: str | None = None
    fetched_at: str | None = None
    chunk_count: int = 0


class DocumentListResponse(BaseModel):
    id: str
    filename: str
    status: str
    source_type: str
    uploaded_at: str | None = None
    source_url: str | None = None
    title: str | None = None
    fetched_at: str | None = None
    chunk_count: int = 0


# ---------------------------------------------------------------------------
# Lead schemas
# ---------------------------------------------------------------------------
class LeadResponse(BaseModel):
    id: str
    bot_id: str
    email: str
    question: str
    status: str
    created_at: str


# ---------------------------------------------------------------------------
# Analytics schemas
# ---------------------------------------------------------------------------
class MessagesPerDay(BaseModel):
    date: str
    count: int


class TopQuestion(BaseModel):
    question: str
    count: int


class AnalyticsResponse(BaseModel):
    total_conversations: int
    total_messages: int
    messages_per_day: list[MessagesPerDay]
    top_questions: list[TopQuestion]
