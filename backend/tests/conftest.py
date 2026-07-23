"""Shared fixtures. Run from backend/:  venv/Scripts/python.exe -m pytest tests/ -q

The `db` fixture is an in-memory SQLite database with the full schema — fast,
isolated per test, no Postgres needed. Services that talk to Claude are NOT
exercised here (that's /gen-check and /tutor-sim territory); these tests cover
the deterministic core: executor, mastery math, spec mapping, controller.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))  # backend/ on path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
