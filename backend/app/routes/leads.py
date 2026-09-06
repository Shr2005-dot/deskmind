"""Lead capture and management routes."""

from __future__ import annotations

import csv
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from app.deps import (
    DbSession,
    get_bot_or_404,
    get_current_user,
    get_db,
    LeadResponse,
    require_bot_owner,
)
from app.models import Bot, Lead, User

router = APIRouter(prefix="/bots/{bot_id}/leads", tags=["leads"])


class CreateLeadRequest(BaseModel):
    email: EmailStr
    question: str


class UpdateLeadStatusRequest(BaseModel):
    status: str


# Public endpoint used by the widget to capture leads.
@router.post("", status_code=status.HTTP_201_CREATED, response_model=LeadResponse)
def create_lead(
    bot_id: str,
    payload: CreateLeadRequest,
    db: DbSession,
) -> LeadResponse:
    bot = get_bot_or_404(bot_id, db)

    lead = Lead(bot_id=bot.id, email=payload.email, question=payload.question)
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return LeadResponse(
        id=str(lead.id),
        bot_id=str(lead.bot_id),
        email=lead.email,
        question=lead.question,
        status=lead.status,
        created_at=lead.created_at.isoformat(),
    )


# Authed endpoint for the owner's Leads tab.
@router.get("", response_model=List[LeadResponse])
def list_leads(
    bot_id: str,
    db: DbSession,
    current_user: User = Depends(get_current_user),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> List[LeadResponse]:
    bot = require_bot_owner(bot_id, db, current_user)

    stmt = select(Lead).where(Lead.bot_id == bot.id)
    if status:
        stmt = stmt.where(Lead.status == status)
    if search:
        stmt = stmt.where(Lead.email.ilike(f"%{search}%") | Lead.question.ilike(f"%{search}%"))
    leads = db.scalars(stmt.order_by(Lead.created_at.desc())).all()
    return [
        LeadResponse(
            id=str(lead.id),
            bot_id=str(lead.bot_id),
            email=lead.email,
            question=lead.question,
            status=lead.status,
            created_at=lead.created_at.isoformat(),
        )
        for lead in leads
    ]


@router.patch("/{lead_id}", response_model=LeadResponse)
def update_lead_status(
    bot_id: str,
    lead_id: str,
    payload: UpdateLeadStatusRequest,
    db: DbSession,
    current_user: User = Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)
    try:
        lead_uuid = __import__("uuid").UUID(lead_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lead id")

    lead = db.get(Lead, lead_uuid)
    if not lead or lead.bot_id != bot.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    if payload.status not in {"new", "contacted", "converted"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")

    lead.status = payload.status
    db.commit()
    db.refresh(lead)
    return LeadResponse(
        id=str(lead.id),
        bot_id=str(lead.bot_id),
        email=lead.email,
        question=lead.question,
        status=lead.status,
        created_at=lead.created_at.isoformat(),
    )


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    bot_id: str,
    lead_id: str,
    db: DbSession,
    current_user: User = Depends(get_current_user),
):
    bot = require_bot_owner(bot_id, db, current_user)
    try:
        lead_uuid = __import__("uuid").UUID(lead_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lead id")

    lead = db.get(Lead, lead_uuid)
    if not lead or lead.bot_id != bot.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    db.delete(lead)
    db.commit()
    return None


@router.get("/export")
def export_leads_csv(
    bot_id: str,
    db: DbSession,
    current_user: User = Depends(get_current_user),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
):
    bot = require_bot_owner(bot_id, db, current_user)

    stmt = select(Lead).where(Lead.bot_id == bot.id)
    if status:
        stmt = stmt.where(Lead.status == status)
    if search:
        stmt = stmt.where(Lead.email.ilike(f"%{search}%") | Lead.question.ilike(f"%{search}%"))
    leads = db.scalars(stmt.order_by(Lead.created_at.desc())).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "email", "question", "status", "created_at"])
    for lead in leads:
        writer.writerow([str(lead.id), lead.email, lead.question, lead.status, lead.created_at.isoformat()])

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="leads-{bot.id}.csv"',
        },
    )
