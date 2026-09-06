"""add website metadata to documents

Revision ID: 4c4d5e6f7g8h
Revises: aa1b2c3d4e5f
Create Date: 2026-08-27 13:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c4d5e6f7g8h'
down_revision: Union[str, None] = 'aa1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("source_url", sa.String(), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("title", sa.String(), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "fetched_at")
    op.drop_column("documents", "title")
    op.drop_column("documents", "source_url")
