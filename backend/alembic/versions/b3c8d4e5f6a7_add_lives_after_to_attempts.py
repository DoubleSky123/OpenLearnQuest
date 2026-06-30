"""add_lives_after_to_attempts

Revision ID: b3c8d4e5f6a7
Revises: a4b7c2d1e3f5
Create Date: 2026-05-29

Add lives_after to question_attempts so the leaderboard can show
per-question lives remaining without relying on session-level aggregation.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b3c8d4e5f6a7'
down_revision: Union[str, None] = 'a4b7c2d1e3f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('question_attempts', sa.Column('lives_after', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('question_attempts', 'lives_after')
