"""add_search_vector_to_chunks

Revision ID: 271e151ca819
Revises: 5d6e7f8g9h0i
Create Date: 2026-08-29 15:33:42.164877

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '271e151ca819'
down_revision: Union[str, None] = '5d6e7f8g9h0i'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add a tsvector column for full-text keyword search.
    op.add_column(
        "chunks",
        sa.Column("search_vector", sa.dialects.postgresql.TSVECTOR(), nullable=True),
    )

    # Backfill existing rows.
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE chunks SET search_vector = to_tsvector('english', content) "
            "WHERE content IS NOT NULL AND content <> ''"
        )
    )

    # GIN index for fast keyword search.
    op.create_index(
        "ix_chunks_search_vector",
        "chunks",
        ["search_vector"],
        postgresql_using="gin",
    )

    # Keep search_vector in sync on INSERT/UPDATE.
    conn.execute(
        sa.text(
            """
            CREATE OR REPLACE FUNCTION chunks_search_vector_trigger() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
                NEW.search_vector :=
                    CASE
                        WHEN NEW.content IS NULL OR NEW.content = '' THEN NULL
                        ELSE to_tsvector('english', NEW.content)
                    END;
                RETURN NEW;
            END
            $$;
            """
        )
    )
    conn.execute(
        sa.text(
            """
            CREATE TRIGGER trg_chunks_search_vector
            BEFORE INSERT OR UPDATE OF content ON chunks
            FOR EACH ROW EXECUTE FUNCTION chunks_search_vector_trigger()
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TRIGGER IF EXISTS trg_chunks_search_vector ON chunks"))
    conn.execute(sa.text("DROP FUNCTION IF EXISTS chunks_search_vector_trigger()"))
    op.drop_index("ix_chunks_search_vector", table_name="chunks")
    op.drop_column("chunks", "search_vector")
