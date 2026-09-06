"""add lead status column

Revision ID: 2ec44ff80786
Revises: 271e151ca819
Create Date: 2026-08-29 18:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2ec44ff80786'
down_revision: Union[str, None] = '271e151ca819'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('leads', sa.Column('status', sa.String(), nullable=False, server_default='new'))
    op.alter_column('leads', 'status', server_default=None)


def downgrade() -> None:
    op.drop_column('leads', 'status')
