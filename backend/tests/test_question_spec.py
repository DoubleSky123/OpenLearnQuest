"""select_spec: competence axis picks the TYPE, state axis picks within-type knobs.
Emotion must never change the question type (two-axis invariant)."""
from app.services.question_spec import resolve_intra, select_spec


def test_type_follows_unlock_ladder():
    assert select_spec("insertAtHead", "engaged", type_unlocked=1).type == "fill_blank"
    assert select_spec("insertAtHead", "engaged", type_unlocked=2).type == "find_bug"
    assert select_spec("insertAtHead", "engaged", type_unlocked=3).type == "ordering"


def test_emotion_never_changes_type():
    for emotion in ("engaged", "confused", "frustrated", "bored"):
        assert select_spec("insertAtHead", emotion, type_unlocked=2).type == "find_bug"


def test_intra_difficulty_defaults_to_medium():
    spec = select_spec("insertAtHead", "engaged", type_unlocked=2, intra_difficulty=None)
    assert spec.intra_difficulty == 2
    assert select_spec("x", "engaged", 2, intra_difficulty=3).intra_difficulty == 3


def test_unlock_clamped_to_valid_range():
    assert select_spec("x", "engaged", type_unlocked=0).type == "fill_blank"
    assert select_spec("x", "engaged", type_unlocked=99).type == "ordering"


def test_resolve_intra_knobs():
    assert resolve_intra("ordering", 1)["node_count"] == 2
    assert resolve_intra("ordering", 3)["distractors"] == 3
    assert resolve_intra("fill_blank", 1)["num_blanks"] == 2
    assert resolve_intra("unknown_type", 2) is None
    assert resolve_intra("ordering", None) is None
