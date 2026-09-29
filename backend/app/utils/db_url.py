"""Normalize database URLs so the SQLAlchemy driver is always explicit.

``DATABASE_URL`` is usually handed out as ``postgresql://...`` with no driver
segment, which leaves the DBAPI choice to SQLAlchemy's own default. SQLAlchemy
2.0 defaults to psycopg2 (the driver ``requirements.txt`` installs), but 2.1
switched that default to psycopg (v3): inside FastAPI Cloud the app then died
at import time with ``ModuleNotFoundError: No module named 'psycopg'``, so the
deployment never passed its verification step.
"""

from __future__ import annotations

# Schemes that carry no driver. ``postgres`` is the legacy alias that libpq
# based tools (and some managed providers) still hand out.
_DRIVERLESS_SCHEMES = ("postgres://", "postgresql://")

_PSYCOPG2_SCHEME = "postgresql+psycopg2://"


def normalize_database_url(url: str) -> str:
    """Return ``url`` with an explicit ``psycopg2`` driver.

    Driverless Postgres URLs (``postgres://``, ``postgresql://``) are rewritten
    to ``postgresql+psycopg2://``; every other URL — including ones that already
    name a driver, and non-Postgres URLs such as ``sqlite://`` — is returned
    unchanged.
    """
    lowered = url.lower()
    for scheme in _DRIVERLESS_SCHEMES:
        if lowered.startswith(scheme):
            return _PSYCOPG2_SCHEME + url[len(scheme):]
    return url
