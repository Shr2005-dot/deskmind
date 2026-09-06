"""Dashboard analytics routes: aggregated stats across all bots for the current user."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import DbSession, get_current_user
from app.models import Bot, Conversation, Document, Lead, Message

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardStatsResponse(BaseModel):
    total_bots: int
    total_documents: int
    total_conversations: int
    total_messages: int
    total_leads: int


class DashboardOverviewResponse(BaseModel):
    stats: DashboardStatsResponse
    recent_bots: list[dict]
    recent_leads: list[dict]


@router.get("/overview", response_model=DashboardOverviewResponse)
def get_dashboard_overview(
    db: DbSession,
    current_user=Depends(get_current_user),
):
    bot_ids = db.scalars(select(Bot.id).where(Bot.user_id == current_user.id)).all()

    total_bots = len(bot_ids)
    total_documents = 0
    total_conversations = 0
    total_messages = 0
    total_leads = 0

    if bot_ids:
        total_documents = db.scalar(
            select(func.count(Document.id)).where(Document.bot_id.in_(bot_ids))
        ) or 0

        conv_ids = db.scalars(
            select(Conversation.id).where(Conversation.bot_id.in_(bot_ids))
        ).all()
        total_conversations = len(conv_ids)

        if conv_ids:
            total_messages = db.scalar(
                select(func.count(Message.id)).where(Message.conversation_id.in_(conv_ids))
            ) or 0

        total_leads = db.scalar(
            select(func.count(Lead.id)).where(Lead.bot_id.in_(bot_ids))
        ) or 0

    recent_bots_rows = db.scalars(
        select(Bot)
        .where(Bot.user_id == current_user.id)
        .order_by(Bot.created_at.desc())
        .limit(5)
    ).all()

    recent_bots = [
        {
            "id": str(bot.id),
            "name": bot.name,
            "document_count": db.scalar(
                select(func.count(Document.id)).where(Document.bot_id == bot.id)
            ) or 0,
            "created_at": bot.created_at.isoformat() if bot.created_at else None,
        }
        for bot in recent_bots_rows
    ]

    recent_leads_rows = db.scalars(
        select(Lead)
        .where(Lead.bot_id.in_(bot_ids) if bot_ids else False)
        .order_by(Lead.created_at.desc())
        .limit(5)
    ).all()

    recent_leads = [
        {
            "id": str(lead.id),
            "email": lead.email,
            "question": lead.question,
            "status": lead.status,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
        }
        for lead in recent_leads_rows
    ]

    return DashboardOverviewResponse(
        stats=DashboardStatsResponse(
            total_bots=total_bots,
            total_documents=total_documents,
            total_conversations=total_conversations,
            total_messages=total_messages,
            total_leads=total_leads,
        ),
        recent_bots=recent_bots,
        recent_leads=recent_leads,
    )
