"""Conversation history routes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import DbSession, get_bot_or_404, get_current_user, require_bot_owner
from app.models import Bot, Conversation, Message

router = APIRouter(prefix="/bots/{bot_id}/conversations", tags=["conversations"])


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class ConversationResponse(BaseModel):
    id: str
    bot_id: str
    created_at: str
    messages: list[MessageResponse]


class ConversationListItem(BaseModel):
    id: str
    bot_id: str
    created_at: str
    message_count: int
    last_message_at: Optional[str] = None
    preview: Optional[str] = None


@router.get("", response_model=list[ConversationListItem])
def list_conversations(
    bot_id: str,
    db: DbSession,
    current_user=Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    bot = require_bot_owner(bot_id, db, current_user)

    conversation_rows = db.scalars(
        select(Conversation)
        .where(Conversation.bot_id == bot.id)
        .order_by(Conversation.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    if not conversation_rows:
        return []

    # Only the conversations on this page need stats/previews.
    conv_ids = [conv.id for conv in conversation_rows]

    message_stats = {}
    if conv_ids:
        rows = db.execute(
            select(
                Message.conversation_id,
                func.count(Message.id).label("message_count"),
                func.max(Message.created_at).label("last_message_at"),
                func.min(Message.created_at).label("first_message_at"),
            )
            .where(Message.conversation_id.in_(conv_ids))
            .group_by(Message.conversation_id)
        ).all()
        for conv_id, message_count, last_message_at, first_message_at in rows:
            message_stats[str(conv_id)] = {
                "message_count": message_count,
                "last_message_at": last_message_at.isoformat() if last_message_at else None,
                "first_message_at": first_message_at.isoformat() if first_message_at else None,
            }

    preview_map: dict[str, str] = {}
    if conv_ids:
        # Get the last user message per conversation for preview
        subq = (
            select(
                Message.conversation_id,
                Message.content,
                Message.created_at,
                func.row_number()
                .over(partition_by=Message.conversation_id, order_by=Message.created_at.desc())
                .label("rn"),
            )
            .where(Message.conversation_id.in_(conv_ids), Message.role == "user")
            .subquery()
        )
        rows = db.execute(
            select(subq).where(subq.c.rn == 1)
        ).all()
        for row in rows:
            preview_map[str(row.conversation_id)] = row.content

    result = []
    for conv in conversation_rows:
        stats = message_stats.get(str(conv.id), {})
        result.append(
            ConversationListItem(
                id=str(conv.id),
                bot_id=str(conv.bot_id),
                created_at=conv.created_at.isoformat() if conv.created_at else datetime.now(timezone.utc).isoformat(),
                message_count=stats.get("message_count", 0),
                last_message_at=stats.get("last_message_at"),
                preview=preview_map.get(str(conv.id)),
            )
        )
    return result


@router.get("/{conversation_id}", response_model=ConversationResponse)
def get_conversation(
    bot_id: str,
    conversation_id: str,
    db: DbSession,
    current_user=Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)
    try:
        conv_uuid = __import__("uuid").UUID(conversation_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid conversation id")

    conv = db.get(Conversation, conv_uuid)
    if not conv or conv.bot_id != bot.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at.asc())
    ).all()

    return ConversationResponse(
        id=str(conv.id),
        bot_id=str(conv.bot_id),
        created_at=conv.created_at.isoformat() if conv.created_at else datetime.now(timezone.utc).isoformat(),
        messages=[
            MessageResponse(
                id=str(msg.id),
                role=msg.role,
                content=msg.content,
                created_at=msg.created_at.isoformat() if msg.created_at else datetime.now(timezone.utc).isoformat(),
            )
            for msg in messages
        ],
    )
