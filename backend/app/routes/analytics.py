"""Analytics routes: aggregated stats for a bot."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import (
    AnalyticsResponse,
    DbSession,
    get_bot_or_404,
    get_current_user,
    require_bot_owner,
)
from app.models import Bot, Conversation, Message

router = APIRouter(prefix="/bots/{bot_id}/analytics", tags=["analytics"])


# AnalyticsResponse is imported from deps.py; keep these for local construction
class MessagesPerDay(BaseModel):
    date: str
    count: int


class TopQuestion(BaseModel):
    question: str
    count: int


@router.get("", response_model=AnalyticsResponse)
def get_analytics(
    bot_id: str,
    db: DbSession,
    current_user=Depends(get_current_user),
) -> AnalyticsResponse:
    bot = require_bot_owner(bot_id, db, current_user)

    # Conversation IDs for this bot
    conv_ids = db.scalars(
        select(Conversation.id).where(Conversation.bot_id == bot.id)
    ).all()

    total_conversations = len(conv_ids)

    total_messages = 0
    if conv_ids:
        total_messages = db.scalar(
            select(func.count(Message.id)).where(
                Message.conversation_id.in_(conv_ids)
            )
        ) or 0

    # Messages per day over the last 14 days
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=13)
    start = start.replace(hour=0, minute=0, second=0, microsecond=0)

    per_day: dict[str, int] = {}
    if conv_ids:
        rows = db.execute(
            select(
                func.date(Message.created_at),
                func.count(Message.id),
            )
            .where(
                Message.conversation_id.in_(conv_ids),
                Message.created_at >= start,
            )
            .group_by(func.date(Message.created_at))
        ).all()
        for day, count in rows:
            key = day.strftime("%Y-%m-%d") if hasattr(day, "strftime") else str(day)
            per_day[key] = count

    messages_per_day: list[MessagesPerDay] = []
    for i in range(14):
        day = start + timedelta(days=i)
        key = day.strftime("%Y-%m-%d")
        messages_per_day.append(MessagesPerDay(date=key, count=per_day.get(key, 0)))

    # Top questions: raw frequency of normalized user messages
    top_rows = []
    if conv_ids:
        top_rows = db.execute(
            select(
                Message.content,
                func.count(Message.id),
            )
            .where(
                Message.conversation_id.in_(conv_ids),
                Message.role == "user",
            )
            .group_by(func.lower(Message.content), Message.content)
            .order_by(func.count(Message.id).desc())
            .limit(10)
        ).all()

    # Grouping by lower(content) can produce duplicate question strings with
    # different case; merge them by normalized text.
    normalized: dict[str, tuple[str, int]] = {}
    for content, count in top_rows:
        key = content.strip().lower()
        if key in normalized:
            existing, existing_count = normalized[key]
            normalized[key] = (existing, existing_count + count)
        else:
            normalized[key] = (content.strip(), count)

    top_questions = [
        TopQuestion(question=question, count=count)
        for question, count in sorted(
            normalized.values(), key=lambda item: item[1], reverse=True
        )[:10]
    ]

    return AnalyticsResponse(
        total_conversations=total_conversations,
        total_messages=total_messages,
        messages_per_day=[item.model_dump() for item in messages_per_day],
        top_questions=[item.model_dump() for item in top_questions],
    )
