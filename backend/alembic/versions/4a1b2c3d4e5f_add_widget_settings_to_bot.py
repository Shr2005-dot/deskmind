"""add widget settings columns to bots

Revision ID: 4a1b2c3d4e5f
Revises: 3b368a2a719d
Create Date: 2026-08-26 19:11:53.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '4a1b2c3d4e5f'
down_revision: Union[str, None] = '3b368a2a719d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bots', sa.Column('widget_color', sa.String(), nullable=True))
    op.add_column('bots', sa.Column('widget_name', sa.String(), nullable=True))
    op.add_column('bots', sa.Column('welcome_message', sa.String(), nullable=True))
    op.add_column('bots', sa.Column('suggested_questions', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('bots', 'suggested_questions')
    op.drop_column('bots', 'welcome_message')
    op.drop_column('bots', 'widget_name')
    op.drop_column('bots', 'widget_color')
