"""add type_unlocked to mastery

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Branch Labels: None
Depends On: None

Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'b4c5d6e7f8a9'
down_revision = 'a3b4c5d6e7f8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'mastery',
        sa.Column('type_unlocked', sa.Integer(), nullable=False, server_default='1'),
    )


def downgrade():
    op.drop_column('mastery', 'type_unlocked')
