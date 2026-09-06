"""Account settings routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import DbSession, get_current_user
from app.models import User

router = APIRouter(prefix="/account", tags=["account"])


class AccountProfileResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    picture_url: Optional[str] = None
    created_at: Optional[str] = None


class DeleteAccountResponse(BaseModel):
    detail: str


@router.get("/profile", response_model=AccountProfileResponse)
def get_profile(
    current_user: User = Depends(get_current_user),
):
    return AccountProfileResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        picture_url=current_user.picture_url,
        created_at=current_user.created_at.isoformat() if current_user.created_at else None,
    )


@router.delete("", response_model=DeleteAccountResponse)
def delete_account(
    db: DbSession,
    current_user: User = Depends(get_current_user),
):
    db.delete(current_user)
    db.commit()
    return DeleteAccountResponse(detail="Account deleted")