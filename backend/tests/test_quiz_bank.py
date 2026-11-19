"""The study's test bank (services/quiz_bank.py, app/data/study/quiz_items.json).

Every item: one correct program (the template), and wrong options that are
exactly misconceptions' canonical mutants — checked by running them. The
shipped file must match a fresh build, so editing TEMPLATES or the catalog
fails here until `python build_quiz_bank.py` is run (like the heap fixtures).
"""
import pytest

from app.services import misconceptions as mc
from app.services import quiz_bank as qb

BANK = list(qb.load())


def test_the_bank_is_shipped():
    assert BANK, "run: python build_quiz_bank.py"


@pytest.mark.parametrize("item", BANK, ids=[it["id"] for it in BANK])
def test_every_item_passes_the_execution_checks(item):
    assert qb.verify(item) == []


def test_the_shipped_bank_matches_a_fresh_build():
    assert BANK == qb.build(), "TEMPLATES or the catalog changed: run python build_quiz_bank.py"


def test_both_forms_test_every_misconception_on_every_operation():
    want = {(op, m.id) for op in qb.TEMPLATES for m in mc.applicable(op)}
    for form in qb.FORMS:
        got = {(it["operation"], o["misconception"]) for it in qb.form_items(form)
               for o in it["options"] if o["misconception"]}
        assert got == want, form


def test_the_forms_are_parallel_same_groups_different_boards():
    a = {it["group"]: it for it in qb.form_items("A")}
    b = {it["group"]: it for it in qb.form_items("B")}
    assert a.keys() == b.keys()
    for g in a:
        assert [o["misconception"] for o in a[g]["options"]] == [o["misconception"] for o in b[g]["options"]]
        assert a[g]["boards"] != b[g]["boards"], f"{g}: form B must not repeat form A's board"
        assert [len(x["values"]) for x in a[g]["boards"]] == [len(x["values"]) for x in b[g]["boards"]], \
            f"{g}: parallel boards have the same shape"


def test_items_have_three_or_four_options():
    assert {len(it["options"]) for it in BANK} <= {3, 4}


def test_the_student_never_sees_the_answer_or_the_misconception():
    it = BANK[0]
    shown = qb.client_item(it, qb.option_order("someone", it))
    assert set(shown) == {"id", "prompt", "question", "setup", "options"}
    assert all(set(o) == {"id", "lines"} for o in shown["options"])
    for m in mc.CATALOG:
        assert m not in repr(shown)
    assert {o["id"] for o in shown["options"]} == {o["id"] for o in it["options"]}


def test_option_order_is_shuffled_per_student_and_stable():
    it = next(i for i in BANK if len(i["options"]) == 4)
    orders = {tuple(qb.option_order(f"student-{k}", it)) for k in range(20)}
    assert len(orders) > 1
    assert qb.option_order("s", it) == qb.option_order("s", it)
    first = [qb.option_order(f"student-{k}", it)[0] for k in range(40)]
    right = next(o["id"] for o in it["options"] if o["correct"])
    assert 0 < first.count(right) < 40, "the right option is not always first"


def test_judge_is_by_option_id():
    it = BANK[0]
    for o in it["options"]:
        assert qb.judge(it, o["id"]) == (o["correct"], o["misconception"])
    with pytest.raises(StopIteration):
        qb.judge(it, "not-an-option")


def test_detect_cycle_shows_two_lists_because_one_cannot_expose_both_bugs():
    it = next(i for i in BANK if i["operation"] == "detectCycle")
    assert len(it["boards"]) == 2 and "both lists" in it["prompt"]
