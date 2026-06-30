"""add_error_diagnosis_to_attempts

Revision ID: e1f2a3b4c5d6
Revises: fa6e3faadff0
Create Date: 2026-06-08 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'fa6e3faadff0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('question_attempts', sa.Column('error_type', sa.String(), nullable=True))
    op.add_column('question_attempts', sa.Column('error_concept', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('question_attempts', 'error_concept')
    op.drop_column('question_attempts', 'error_type')
