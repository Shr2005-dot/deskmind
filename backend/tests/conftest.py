"""Shared pytest fixtures for the DeskMind backend test suite."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base
from app.deps import get_db
from app.main import app
from app.models import Bot, Conversation, Document, Lead, Message, User

# ---------------------------------------------------------------------------
# Test database isolation
#
# CRITICAL: tests must NEVER run against the production schema. The previous
# behaviour fell back to DATABASE_URL when TEST_DATABASE_URL was unset, so the
# session-scoped ``drop_all`` teardown wiped all production accounts and data.
#
# New behaviour:
#   * If TEST_DATABASE_URL is set it is used verbatim (a dedicated database).
#   * Otherwise we use SUPABASE_DATABASE_URL (or DATABASE_URL as fallback)
#     but redirect every connection to a dedicated schema (deskmind_test by
#     default) via ``search_path``, so production tables in ``public`` are
#     never touched. The schema is created before and dropped after the test
#     session.
# ---------------------------------------------------------------------------
PROJECT_DATABASE_URL: str = os.getenv(
    "SUPABASE_DATABASE_URL",
    os.getenv("DATABASE_URL", ""),
)
TEST_SCHEMA: str = os.getenv("TEST_DB_SCHEMA", "deskmind_test")

_explicit_test_url = os.getenv("TEST_DATABASE_URL")


def _direct_endpoint_url(url: str) -> str:
    """Point a Neon pooler URL at the direct endpoint.

    Neon's pooler (PgBouncer, transaction mode) rejects the ``options``
    startup parameter, so connections that need a per-connection
    ``search_path`` must go through the direct Postgres endpoint. The
    ``-pooler.`` fragment is simply dropped from the hostname; for
    non-Neon URLs this is a no-op.
    """
    return url.replace("-pooler.", ".")


if _explicit_test_url:
    TEST_DATABASE_URL = _explicit_test_url
    # A dedicated test database is used verbatim; no schema redirection.
    _test_connect_args: dict = {}
else:
    if not PROJECT_DATABASE_URL:
        raise RuntimeError(
            "SUPABASE_DATABASE_URL or DATABASE_URL must be set (via backend/.env) to run the test suite."
        )
    # Keep public in the path so types such as pgvector's ``vector`` (installed
    # in public) resolve, but put the test schema first so all unqualified
    # table reads/writes hit the isolated schema.
    #
    # The search_path is passed via connect_args (a libpq startup parameter)
    # instead of being appended to the URL: SQLAlchemy percent-encodes URL
    # query values, and Neon's pooler rejects the resulting startup parameter.
    TEST_DATABASE_URL = _direct_endpoint_url(PROJECT_DATABASE_URL)
    _test_connect_args = {"options": f"-csearch_path={TEST_SCHEMA},public"}

engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True, connect_args=_test_connect_args)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture(scope="session")
def db_engine():
    """Create the isolated test schema and all tables once per session."""
    print("[DEBUG] db_engine fixture starting")
    if not _explicit_test_url:
        with engine.connect() as conn:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{TEST_SCHEMA}"'))
            conn.commit()

    with engine.connect() as conn:
        result = conn.execute(text('SELECT current_schema(), current_setting(:param)'), {'param': 'search_path'})
        row = result.fetchone()
        print(f"[DEBUG] current_schema={row[0]}, search_path={row[1]}")

    Base.metadata.create_all(bind=engine)
    print("[DEBUG] tables in metadata:", list(Base.metadata.tables.keys()))
    with engine.connect() as conn:
        for schema in ['public', TEST_SCHEMA]:
            result = conn.execute(text('SELECT table_name FROM information_schema.tables WHERE table_schema = :s ORDER BY table_name'), {'s': schema})
            tables = result.fetchall()
            print(f"[DEBUG] tables in {schema}:", [t[0] for t in tables])
    yield engine
    print("[DEBUG] db_engine fixture tearing down")

    # Teardown: only drop the isolated test schema so production tables in
    # ``public`` are never touched. ``Base.metadata.drop_all`` is intentionally
    # omitted because it generates unqualified ``DROP TABLE`` statements that
    # PostgreSQL resolves using ``search_path``; if any production tables were
    # created outside the test schema they would be destroyed as well.
    if not _explicit_test_url:
        with engine.connect() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))
            conn.commit()
    else:
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db(db_engine) -> Generator[Session, None, None]:
    """Provide a transactional session wrapped in a rollback after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    # Override get_db so the TestClient uses this same session/connection
    def _override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    yield session
    app.dependency_overrides.pop(get_db, None)

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def test_user(db: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"test-{uuid.uuid4()}@example.com",
        hashed_password="$2b$12$abcdefghijklmnopqrstuv",  # dummy hash
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def test_user2(db: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"test-{uuid.uuid4()}@example.com",
        hashed_password="$2b$12$abcdefghijklmnopqrstuv",
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def test_bot(db: Session, test_user: User) -> Bot:
    bot = Bot(
        id=uuid.uuid4(),
        user_id=test_user.id,
        name="Test Bot",
        created_at=datetime.now(timezone.utc),
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot


@pytest.fixture
def test_bot_user2(db: Session, test_user2: User) -> Bot:
    bot = Bot(
        id=uuid.uuid4(),
        user_id=test_user2.id,
        name="Other User Bot",
        created_at=datetime.now(timezone.utc),
    )
    db.add(bot)
    db.commit()
    db.refresh(bot)
    return bot


def auth_header(user: User) -> dict[str, str]:
    """Build a minimal Authorization header for a user without calling the login endpoint."""
    from app.utils.security import create_access_token

    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}
