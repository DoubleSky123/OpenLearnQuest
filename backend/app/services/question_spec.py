"""
Question spec: maps mastery + emotion → question type + difficulty parameters.
No imports from other services — pure data and logic.
"""
import math
from dataclasses import dataclass

DIFFICULTY_PARAMS: dict[int, dict] = {
    1: {
        "distractor_similarity": "clearly wrong (uses a completely different concept)",
        "variable_style": "semantic names (newNode, head, temp)",
        "step_granularity": "atomic (one pointer operation per step)",
        "num_steps": 3,
    },
    2: {
        "distractor_similarity": "plausible but wrong (same concept, wrong order or wrong target)",
        "variable_style": "semantic names (newNode, head, temp)",
        "step_granularity": "atomic (one pointer operation per step)",
        "num_steps": 4,
    },
    3: {
        "distractor_similarity": "subtle (off-by-one pointer, e.g. .next vs .next.next)",
        "variable_style": "semantic names (newNode, head, temp)",
        "step_granularity": "mixed (some steps may combine two related ops)",
        "num_steps": 5,
    },
    4: {
        "distractor_similarity": "very subtle (almost-correct step with a single wrong pointer)",
        "variable_style": "abstract names (p, q, curr, prev)",
        "step_granularity": "combined (multiple related ops per step)",
        "num_steps": 5,
    },
}

DIFFICULTY_TYPE_MAP: dict[int, str] = {
    1: "fill_blank",
    2: "find_bug",
    3: "ordering",
    4: "ordering",
}

# ── Within-type difficulty (STATE axis) ──────────────────────────────────────
# intra_difficulty ∈ {1: easy, 2: medium, 3: hard}. Set by the ZPD controller
# and applied WITHIN a fixed question type — it never changes the type itself
# (type is the competence axis, driven by mastery / type_unlocked).
#
# Each type maps the level to its own knobs. Knobs that need extra content are
# marked and left for follow-up:
#   - find_bug "bug subtlety" needs multiple bug variants per operation (or AI),
#     so for now only option count / node count vary by level.
#   - fill_blank "num_blanks" blanks only a subset of steps (None = all steps).
INTRA_KNOBS: dict[str, dict[int, dict]] = {
    "ordering": {
        1: {"node_count": 2, "distractors": 1},
        2: {"node_count": 3, "distractors": 2},
        3: {"node_count": 4, "distractors": 3},
    },
    "fill_blank": {
        1: {"node_count": 2, "num_blanks": 2,    "options": 2},
        2: {"node_count": 3, "num_blanks": None, "options": 3},
        3: {"node_count": 4, "num_blanks": None, "options": 3},
    },
    "find_bug": {
        # TODO(intra): bug subtlety needs multiple bug variants per op — only
        # option/node count vary for now.
        1: {"node_count": 2, "options": 2},
        2: {"node_count": 3, "options": 3},
        3: {"node_count": 4, "options": 3},
    },
}


def resolve_intra(question_type: str, intra_level: int | None) -> dict | None:
    """Knob settings for a within-type difficulty level. None → use legacy behaviour."""
    if intra_level is None:
        return None
    table = INTRA_KNOBS.get(question_type)
    if not table:
        return None
    return table.get(intra_level) or table.get(2)


@dataclass
class QuestionSpec:
    type: str
    difficulty: int
    params: dict
    operation: str
    emotion: str
    intra_difficulty: int | None = None   # within-type difficulty (state axis); None = legacy


def select_spec(
    operation: str,
    emotion: str,
    type_unlocked: int = 1,     # 1=fill_blank, 2=find_bug, 3=ordering (only goes up)
    intra_difficulty: int | None = None,   # within-type difficulty from the ZPD controller
) -> QuestionSpec:
    """
    Two-axis spec:
      COMPETENCE axis → question TYPE, determined SOLELY by type_unlocked.
                        Emotion never changes the type (it only adjusts within-type
                        difficulty + scaffolding, handled elsewhere).
      STATE axis      → within-type difficulty from intra_difficulty (1=easy,2=med,3=hard;
                        default medium). Drives the AI prompt params (distractor
                        similarity, granularity, naming).
    """
    type_level = min(3, max(1, type_unlocked))
    qtype      = DIFFICULTY_TYPE_MAP[type_level]

    intra      = intra_difficulty if intra_difficulty in (1, 2, 3) else 2
    params     = DIFFICULTY_PARAMS[intra]

    return QuestionSpec(
        type=qtype,
        difficulty=intra,
        params=params,
        operation=operation,
        emotion=emotion,
        intra_difficulty=intra,
    )
