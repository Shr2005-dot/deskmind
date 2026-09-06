"""add leads table

Revision ID: aa1b2c3d4e5f
Revises: 4a1b2c3d4e5f
Create Date: 2026-08-26 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa1b2c3d4e5f'
down_revision: Union[str, None] = '4a1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'leads',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('bot_id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['bot_id'], ['bots.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_leads_bot_id'), 'leads', ['bot_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_leads_bot_id'), table_name='leads')
    op.drop_table('leads')