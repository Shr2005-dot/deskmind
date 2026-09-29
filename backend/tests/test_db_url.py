"""Tests for database URL normalization.

The deployed app must always resolve the ``psycopg2`` driver: a driverless
``postgresql://`` URL is resolved by SQLAlchemy's own default DBAPI, which
became psycopg (v3) in SQLAlchemy 2.1 — a package this project does not
install, so the app failed to import inside FastAPI Cloud and every deployment
failed verification with ``ModuleNotFoundError: No module named 'psycopg'``.
"""

from __future__ import annotations

from app.config import DATABASE_URL as CONFIG_DATABASE_URL
from app.db import DATABASE_URL as DB_DATABASE_URL
from app.db import engine
from app.utils.db_url import normalize_database_url


class TestNormalizeDatabaseUrl:
    def test_driverless_postgresql_gets_psycopg2(self):
        normalized = normalize_database_url("postgresql://user:pw@host:5432/deskmind")
        assert normalized == "postgresql+psycopg2://user:pw@host:5432/deskmind"

    def test_legacy_postgres_scheme_gets_psycopg2(self):
        normalized = normalize_database_url("postgres://user:pw@host:5432/deskmind")
        assert normalized == "postgresql+psycopg2://user:pw@host:5432/deskmind"

    def test_query_parameters_are_preserved(self):
        normalized = normalize_database_url(
            "postgresql://user:pw@host:5432/deskmind?sslmode=require"
        )
        assert normalized == (
            "postgresql+psycopg2://user:pw@host:5432/deskmind?sslmode=require"
        )

    def test_explicit_psycopg2_driver_is_untouched(self):
        url = "postgresql+psycopg2://user:pw@host:5432/deskmind"
        assert normalize_database_url(url) == url

    def test_another_explicit_driver_is_not_overridden(self):
        # Someone may deliberately opt into psycopg (v3); that choice stands.
        url = "postgresql+psycopg://user:pw@host:5432/deskmind"
        assert normalize_database_url(url) == url

    def test_non_postgres_urls_are_untouched(self):
        for url in ("sqlite:///./test.db", "mysql+pymysql://user:pw@host/db"):
            assert normalize_database_url(url) == url

    def test_empty_url_is_untouched(self):
        assert normalize_database_url("") == ""


class TestApplicationEngine:
    def test_config_resolves_a_driver_explicit_url(self):
        assert CONFIG_DATABASE_URL.startswith("postgresql+psycopg2://") or (
            "://" in CONFIG_DATABASE_URL
            and CONFIG_DATABASE_URL.split("://", 1)[0] != "postgresql"
            and CONFIG_DATABASE_URL.split("://", 1)[0] != "postgres"
        )

    def test_db_module_uses_the_normalized_url(self):
        assert DB_DATABASE_URL == normalize_database_url(DB_DATABASE_URL)

    def test_engine_uses_the_psycopg2_driver(self):
        # This is the exact failure mode that broke the FastAPI Cloud deploy:
        # the engine must never fall back to the psycopg (v3) driver.
        assert engine.dialect.driver == "psycopg2"
