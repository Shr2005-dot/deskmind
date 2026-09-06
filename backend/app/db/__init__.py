import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

SUPABASE_DATABASE_URL: str | None = os.getenv("SUPABASE_DATABASE_URL")
DATABASE_URL: str = os.getenv(
    "SUPABASE_DATABASE_URL",
    os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://user:password@localhost:5432/deskmind",
    ),
)


class Base(DeclarativeBase):
    """Declarative base for all DeskMind ORM models."""


engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)