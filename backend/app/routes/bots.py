"""Bot CRUD routes."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import (
    BotListResponse,
    BotResponse,
    DbSession,
    get_bot_or_404,
    get_current_user,
    get_db,
    require_bot_owner,
)
from app.models import Bot, Document, User

router = APIRouter(prefix="/bots", tags=["bots"])

AVATARS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "avatars"
AVATARS_DIR.mkdir(parents=True, exist_ok=True)

MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2 MB
ALLOWED_AVATAR_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

MAX_GUEST_BOTS = 2


class CreateBotRequest(BaseModel):
    name: str
    avatar: str | None = None


class UpdateBotRequest(BaseModel):
    name: str | None = None
    avatar: str | None = None
    widget_color: str | None = None
    widget_name: str | None = None
    welcome_message: str | None = None
    suggested_questions: List[str] | None = None


class BotConfigResponse(BaseModel):
    id: str
    name: str
    avatar: str | None = None
    widget_color: str
    widget_name: str
    welcome_message: str
    suggested_questions: List[str]


def _bot_to_response(bot: Bot, document_count: int = 0, request: Request | None = None) -> BotResponse:
    avatar = bot.avatar
    if avatar and request and not avatar.startswith("http"):
        if avatar.startswith("/uploads/avatars/"):
            avatar = f"{request.base_url}{avatar.lstrip('/')}"
    return BotResponse(
        id=str(bot.id),
        name=bot.name,
        user_id=str(bot.user_id),
        avatar=avatar,
        widget_color=bot.widget_color,
        widget_name=bot.widget_name,
        welcome_message=bot.welcome_message,
        suggested_questions=json.loads(bot.suggested_questions) if bot.suggested_questions else [],
        document_count=document_count,
        created_at=bot.created_at.isoformat() if bot.created_at else None,
    )


def _delete_avatar_file(avatar_path: str | None) -> None:
    if not avatar_path:
        return
    if not avatar_path.startswith("/uploads/avatars/"):
        return
    filename = avatar_path.split("/")[-1]
    target = AVATARS_DIR / filename
    if target.exists():
        target.unlink()


def _resolve_avatar_url(avatar: str | None, request: Request) -> str | None:
    if not avatar:
        return None
    if avatar.startswith("http"):
        return avatar
    if avatar.startswith("/uploads/avatars/"):
        return f"{request.base_url}{avatar.lstrip('/')}"
    return avatar


@router.post("/{bot_id}/avatar", response_model=BotResponse)
def upload_bot_avatar(
    bot_id: str,
    file: UploadFile,
    request: Request,
    db: DbSession,
    current_user: User = Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar must be an image file",
        )

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Avatar is too large. Maximum size is {MAX_AVATAR_SIZE // (1024 * 1024)} MB",
        )

    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_AVATAR_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported avatar format. Allowed: {', '.join(sorted(ALLOWED_AVATAR_EXTENSIONS))}",
        )

    contents = file.file.read()
    # Basic magic-byte sanity check so completely fake files are rejected.
    if not (
        contents.startswith(b"\xff\xd8\xff")  # jpg
        or contents.startswith(b"\x89PNG\r\n\x1a\n")  # png
        or contents[:4] == b"RIFF" and contents[8:12] == b"WEBP"  # webp
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid image",
        )

    _delete_avatar_file(bot.avatar)

    filename = f"{uuid.uuid4().hex}{extension}"
    destination = AVATARS_DIR / filename
    with open(destination, "wb") as buffer:
        buffer.write(contents)

    bot.avatar = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(bot)

    doc_count = db.scalar(select(func.count(Document.id)).where(Document.bot_id == bot.id)) or 0
    return _bot_to_response(bot, document_count=doc_count, request=request)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=BotResponse)
def create_bot(
    payload: CreateBotRequest,
    request: Request,
    db: DbSession,
    current_user: User = Depends(get_current_user),
):
    if not current_user.google_id:
        existing_count = db.scalar(
            select(func.count(Bot.id)).where(Bot.user_id == current_user.id)
        ) or 0
        if existing_count >= MAX_GUEST_BOTS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Guest accounts are limited to 2 bots. "
                    "Continue with Google to create more bots."
                ),
            )

    bot = Bot(user_id=current_user.id, name=payload.name, avatar=payload.avatar)
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return _bot_to_response(bot, request=request)


@router.get("", response_model=List[BotListResponse])
def list_bots(
    request: Request,
    db: DbSession,
    current_user: User = Depends(get_current_user),
) -> List[BotListResponse]:
    bots = db.scalars(
        select(Bot).where(Bot.user_id == current_user.id)
    ).all()

    # Efficiently compute document counts for all bots in a single query.
    counts: dict[str, int] = {}
    if bots:
        rows = db.execute(
            select(Document.bot_id, func.count(Document.id))
            .where(Document.bot_id.in_([bot.id for bot in bots]))
            .group_by(Document.bot_id)
        ).all()
        counts = {str(bot_id): count for bot_id, count in rows}

    return [
        BotListResponse(
            id=str(bot.id),
            name=bot.name,
            user_id=str(bot.user_id),
            avatar=_resolve_avatar_url(bot.avatar, request),
            widget_color=bot.widget_color,
            widget_name=bot.widget_name,
            welcome_message=bot.welcome_message,
            suggested_questions=json.loads(bot.suggested_questions) if bot.suggested_questions else [],
            document_count=counts.get(str(bot.id), 0),
            created_at=bot.created_at.isoformat() if bot.created_at else None,
        )
        for bot in bots
    ]


@router.get("/{bot_id}", response_model=BotResponse)
def get_bot(
    bot_id: str,
    request: Request,
    db: DbSession,
    current_user: User = Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)
    doc_count = db.scalar(
        select(func.count(Document.id)).where(Document.bot_id == bot.id)
    ) or 0
    return _bot_to_response(bot, document_count=doc_count, request=request)


@router.patch("/{bot_id}", response_model=BotResponse)
def update_bot(
    bot_id: str,
    payload: UpdateBotRequest,
    request: Request,
    db: DbSession,
    current_user: User = Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)

    if payload.name is not None:
        bot.name = payload.name
    if payload.avatar is not None:
        _delete_avatar_file(bot.avatar)
        bot.avatar = payload.avatar
    if payload.widget_color is not None:
        bot.widget_color = payload.widget_color
    if payload.widget_name is not None:
        bot.widget_name = payload.widget_name
    if payload.welcome_message is not None:
        bot.welcome_message = payload.welcome_message
    if payload.suggested_questions is not None:
        bot.suggested_questions = json.dumps(payload.suggested_questions)

    db.commit()
    db.refresh(bot)
    return _bot_to_response(bot, request=request)


@router.get("/{bot_id}/config", response_model=BotConfigResponse)
def get_bot_config(
    bot_id: str,
    request: Request,
    db: DbSession,
):
    bot = get_bot_or_404(bot_id, db)
    return BotConfigResponse(
        id=str(bot.id),
        name=bot.name,
        avatar=_resolve_avatar_url(bot.avatar, request),
        widget_color=bot.widget_color or "#6366f1",
        widget_name=bot.widget_name or bot.name,
        welcome_message=bot.welcome_message or "",
        suggested_questions=json.loads(bot.suggested_questions) if bot.suggested_questions else [],
    )


@router.delete("/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bot(
    bot_id: str,
    db: DbSession,
    current_user: User = Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)
    _delete_avatar_file(bot.avatar)
    db.delete(bot)
    db.commit()
    return None
