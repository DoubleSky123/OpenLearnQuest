"""add perfect_pass to mastery

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa

revision = 'a3b4c5d6e7f8'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'mastery',
        sa.Column('perfect_pass', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade():
    op.drop_column('mastery', 'perfect_pass')
