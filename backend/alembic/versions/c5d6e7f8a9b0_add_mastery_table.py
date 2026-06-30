"""add_mastery_table

Revision ID: c5d6e7f8a9b0
Revises: b3c8d4e5f6a7
Create Date: 2026-06-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, None] = 'b3c8d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mastery',
        sa.Column('id',                sa.String(),  primary_key=True),
        sa.Column('user_id',           sa.String(),  nullable=False),
        sa.Column('module_id',         sa.String(),  nullable=False),
        sa.Column('operation',         sa.String(),  nullable=False),
        sa.Column('attempts',          sa.Integer(), default=0, nullable=False, server_default='0'),
        sa.Column('passes',            sa.Integer(), default=0, nullable=False, server_default='0'),
        sa.Column('consecutive_passes',sa.Integer(), default=0, nullable=False, server_default='0'),
        sa.Column('last_seen',         sa.DateTime(),nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.UniqueConstraint('user_id', 'operation', 'module_id', name='uq_mastery_user_op_module'),
    )


def downgrade() -> None:
    op.drop_table('mastery')
