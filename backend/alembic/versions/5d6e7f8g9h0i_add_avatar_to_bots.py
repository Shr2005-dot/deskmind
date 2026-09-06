"""add avatar to bots

Revision ID: 5d6e7f8g9h0i
Revises: 4c4d5e6f7g8h
Create Date: 2026-08-29 00:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '5d6e7f8g9h0i'
down_revision: Union[str, None] = '4c4d5e6f7g8h'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bots', sa.Column('avatar', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('bots', 'avatar')
