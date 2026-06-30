"""add state-axis telemetry to question_attempts

Revision ID: c5d6e7f8a9b1
Revises: b4c5d6e7f8a9
Branch Labels: None
Depends On: None

Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'c5d6e7f8a9b1'
down_revision = 'b4c5d6e7f8a9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('question_attempts', sa.Column('intra_difficulty', sa.Integer(), nullable=True))
    op.add_column('question_attempts', sa.Column('scaffold_level', sa.Integer(), nullable=True))
    op.add_column('question_attempts', sa.Column('emotion', sa.String(), nullable=True))


def downgrade():
    op.drop_column('question_attempts', 'emotion')
    op.drop_column('question_attempts', 'scaffold_level')
    op.drop_column('question_attempts', 'intra_difficulty')
