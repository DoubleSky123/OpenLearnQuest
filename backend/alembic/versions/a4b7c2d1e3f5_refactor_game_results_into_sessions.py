"""refactor_game_results_into_sessions

Revision ID: a4b7c2d1e3f5
Revises: 67a1e9a3a1cf
Create Date: 2026-05-29

Drop redundant game_results table; add lives_remaining and game_mode_detail
directly to game_sessions (the only genuinely new fields were lives_remaining
and the fine-grained mode string — everything else is derivable via JOIN).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a4b7c2d1e3f5'
down_revision: Union[str, None] = '67a1e9a3a1cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('game_results')
    op.add_column('game_sessions', sa.Column('lives_remaining',  sa.Integer(), nullable=True))
    op.add_column('game_sessions', sa.Column('game_mode_detail', sa.String(),  nullable=True))


def downgrade() -> None:
    op.drop_column('game_sessions', 'game_mode_detail')
    op.drop_column('game_sessions', 'lives_remaining')
    op.create_table(
        'game_results',
        sa.Column('id',             sa.String(),  primary_key=True),
        sa.Column('user_id',        sa.String(),  nullable=False),
        sa.Column('module_id',      sa.String(),  nullable=False),
        sa.Column('game_mode',      sa.String(),  nullable=False),
        sa.Column('title',          sa.String(),  nullable=False),
        sa.Column('time_seconds',   sa.Integer(), nullable=False),
        sa.Column('lives_remaining',sa.Integer(), nullable=False),
        sa.Column('error_count',    sa.Integer(), nullable=False),
        sa.Column('xp_gained',      sa.Integer(), nullable=False),
        sa.Column('completed_at',   sa.DateTime(),nullable=False),
    )
