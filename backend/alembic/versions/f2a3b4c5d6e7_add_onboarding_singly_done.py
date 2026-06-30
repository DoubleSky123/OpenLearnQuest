"""add onboarding_singly_done to users

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa

revision = 'f2a3b4c5d6e7'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('onboarding_singly_done', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade():
    op.drop_column('users', 'onboarding_singly_done')
