"""Content-variant machinery: integrity of every bug variant + deterministic
rotation of blank sets and bug selection by variant_seed (= attempt count)."""
import pytest

from app.services.question_registry import get_handler
from app.services.question_spec import select_spec
from app.services.static_questions import _BLANKS, _BUGS, TEMPLATES, _pick_bug_variant

ALL_OPS = list(TEMPLATES)


@pytest.mark.parametrize("op", ALL_OPS)
def test_every_bug_variant_is_wellformed(op):
    for v in _BUGS[op]:
        assert v.get("subtlety") in (1, 2, 3), f"{op}: variant missing subtlety tag"
        assert 0 <= v["line"] < len(TEMPLATES[op]["pseudocode"])
        assert v["buggy"].strip() != TEMPLATES[op]["pseudocode"][v["line"]].strip(), \
            f"{op}: buggy line identical to correct"
        assert v["fix"] in v["options"], f"{op}: fix missing from options"
        assert len(set(v["options"])) == len(v["options"]), f"{op}: duplicate options"


def test_pick_bug_variant_prefers_matching_subtlety():
    variants = [{"subtlety": 1, "id": "a"}, {"subtlety": 2, "id": "b"}, {"subtlety": 3, "id": "c"}]
    assert _pick_bug_variant(variants, 1, 0)["id"] == "a"
    assert _pick_bug_variant(variants, 3, 0)["id"] == "c"
    assert _pick_bug_variant(variants, None, 0)["id"] == "b"   # default medium


def test_pick_bug_variant_rotates_ties_deterministically():
    variants = [{"subtlety": 2, "id": "x"}, {"subtlety": 2, "id": "y"}]
    assert _pick_bug_variant(variants, 2, 0)["id"] == "x"
    assert _pick_bug_variant(variants, 2, 1)["id"] == "y"
    assert _pick_bug_variant(variants, 2, 2)["id"] == "x"      # wraps


def test_fill_blank_sets_rotate_with_attempts():
    op = "insertAtHead"
    n_sets = len(_BLANKS[op])
    assert n_sets >= 2
    seen = []
    for seed in range(n_sets):
        spec = select_spec(op, "engaged", type_unlocked=1, variant_seed=seed)
        q = get_handler("fill_blank").build_static(op, spec)
        seen.append(q["variant"])
    assert len(set(seen)) == n_sets, f"rotation not covering all sets: {seen}"
    # wraps around deterministically
    spec = select_spec(op, "engaged", type_unlocked=1, variant_seed=n_sets)
    assert get_handler("fill_blank").build_static(op, spec)["variant"] == seen[0]


def test_find_bug_variant_tag_in_payload():
    spec = select_spec("insertAtHead", "engaged", type_unlocked=2, variant_seed=0)
    q = get_handler("find_bug").build_static("insertAtHead", spec)
    assert q["variant"].startswith("bug")
