"""Activity feed routes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import DbSession, get_current_user
from app.models import Bot, Document, Lead

router = APIRouter(prefix="/activity", tags=["activity"])


class ActivityItem(BaseModel):
    id: str
    type: str
    title: str
    description: str
    created_at: str
    meta: Optional[dict] = None


@router.get("", response_model=list[ActivityItem])
def list_activity(
    db: DbSession,
    current_user=Depends(get_current_user),
    limit: int = 20,
):
    bot_ids = db.scalars(select(Bot.id).where(Bot.user_id == current_user.id)).all()
    if not bot_ids:
        return []

    items: list[ActivityItem] = []

    bots = db.scalars(select(Bot).where(Bot.user_id == current_user.id).order_by(Bot.created_at.desc())).all()
    for bot in bots:
        items.append(
            ActivityItem(
                id=f"bot-{bot.id}",
                type="bot_created",
                title="Bot created",
                description=f"New bot '{bot.name}' was created.",
                created_at=bot.created_at.isoformat() if bot.created_at else datetime.now(timezone.utc).isoformat(),
                meta={"bot_id": str(bot.id), "bot_name": bot.name},
            )
        )

    documents = db.scalars(
        select(Document)
        .where(Document.bot_id.in_(bot_ids))
        .order_by(Document.uploaded_at.desc())
        .limit(limit)
    ).all()
    for doc in documents:
        items.append(
            ActivityItem(
                id=f"doc-{doc.id}",
                type="document_uploaded",
                title="Document added",
                description=f"'{doc.filename}' was added to the knowledge base.",
                created_at=doc.uploaded_at.isoformat() if doc.uploaded_at else datetime.now(timezone.utc).isoformat(),
                meta={"document_id": str(doc.id), "bot_id": str(doc.bot_id), "filename": doc.filename},
            )
        )

    leads = db.scalars(
        select(Lead)
        .where(Lead.bot_id.in_(bot_ids))
        .order_by(Lead.created_at.desc())
        .limit(limit)
    ).all()
    for lead in leads:
        items.append(
            ActivityItem(
                id=f"lead-{lead.id}",
                type="lead_captured",
                title="New lead captured",
                description=f"{lead.email} asked a question and left their email.",
                created_at=lead.created_at.isoformat() if lead.created_at else datetime.now(timezone.utc).isoformat(),
                meta={"lead_id": str(lead.id), "bot_id": str(lead.bot_id), "email": lead.email},
            )
        )

    items.sort(key=lambda item: item.created_at, reverse=True)
    return items[:limit]
