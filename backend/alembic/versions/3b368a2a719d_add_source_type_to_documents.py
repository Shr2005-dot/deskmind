"""add source_type to documents

Revision ID: 3b368a2a719d
Revises: d8f1ca175f07
Create Date: 2026-08-25 20:47:07.315966

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3b368a2a719d'
down_revision: Union[str, None] = 'd8f1ca175f07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("source_type", sa.String(), nullable=False, server_default="pdf"),
    )


def downgrade() -> None:
    op.drop_column("documents", "source_type")