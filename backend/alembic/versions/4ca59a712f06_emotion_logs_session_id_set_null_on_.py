"""emotion_logs.session_id SET NULL on session delete

Revision ID: 4ca59a712f06
Revises: 74679e686ff3
Create Date: 2026-07-22 21:51:31.001710

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '4ca59a712f06'
down_revision: Union[str, None] = '74679e686ff3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # emotion telemetry belongs to the user — survive session-row deletion
    # (also removes the FK delete-ordering hazard on user cascade deletes)
    op.drop_constraint("emotion_logs_session_id_fkey", "emotion_logs", type_="foreignkey")
    op.create_foreign_key(
        "emotion_logs_session_id_fkey", "emotion_logs", "game_sessions",
        ["session_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("emotion_logs_session_id_fkey", "emotion_logs", type_="foreignkey")
    op.create_foreign_key(
        "emotion_logs_session_id_fkey", "emotion_logs", "game_sessions",
        ["session_id"], ["id"],
    )
