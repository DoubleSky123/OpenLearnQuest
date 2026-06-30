"""add active_type_level to mastery

Revision ID: d6e7f8a9b1c2
Revises: c5d6e7f8a9b1
Branch Labels: None
Depends On: None

Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = 'd6e7f8a9b1c2'
down_revision = 'c5d6e7f8a9b1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'mastery',
        sa.Column('active_type_level', sa.Integer(), nullable=False, server_default='1'),
    )
    # Existing rows: start students at their current ceiling so behaviour is unchanged for them.
    op.execute("UPDATE mastery SET active_type_level = type_unlocked")


def downgrade():
    op.drop_column('mastery', 'active_type_level')
