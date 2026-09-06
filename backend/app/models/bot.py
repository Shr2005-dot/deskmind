import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class Bot(Base):
    __tablename__ = "bots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    avatar: Mapped[str | None] = mapped_column(String, nullable=True)
    widget_color: Mapped[str | None] = mapped_column(String, nullable=True)
    widget_name: Mapped[str | None] = mapped_column(String, nullable=True)
    welcome_message: Mapped[str | None] = mapped_column(String, nullable=True)
    suggested_questions: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user: Mapped["User"] = relationship(back_populates="bots")
    documents: Mapped[list["Document"]] = relationship(back_populates="bot", cascade="all, delete-orphan")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="bot", cascade="all, delete-orphan")
    leads: Mapped[list["Lead"]] = relationship(back_populates="bot", cascade="all, delete-orphan")