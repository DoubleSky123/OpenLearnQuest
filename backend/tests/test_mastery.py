"""update_mastery: the competence-axis rules (unlock ladder + concept posterior).
These rules gate what question types students see — pin them."""
import uuid

from app.models import ConceptMastery, Mastery
from app.services.game_master import update_mastery

UID = lambda: str(uuid.uuid4())


def get_mastery(db, user_id, op="insertAtHead"):
    return db.query(Mastery).filter(Mastery.user_id == user_id, Mastery.operation == op).first()


def test_first_perfect_pass_unlocks_find_bug(db):
    uid = UID()
    update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=0)
    m = get_mastery(db, uid)
    assert m.consecutive_passes == 1
    assert m.type_unlocked == 2          # >=1 perfect streak -> find_bug


def test_two_perfect_passes_unlock_ordering(db):
    uid = UID()
    for _ in range(2):
        update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=0)
    assert get_mastery(db, uid).type_unlocked == 3


def test_imperfect_pass_resets_streak_but_never_locks(db):
    uid = UID()
    update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=0)
    update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=0)
    m = get_mastery(db, uid)
    assert m.type_unlocked == 3
    update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=2)
    m = get_mastery(db, uid)
    assert m.consecutive_passes == 0     # imperfect pass resets the streak
    assert m.type_unlocked == 3          # ...but the unlock NEVER goes down


def test_new_record_defaults(db):
    uid = UID()
    update_mastery(db, uid, "singly", "reverseList", passed=True, error_count=1)
    m = get_mastery(db, uid, "reverseList")
    assert (m.type_unlocked, m.active_type_level) == (1, 1)
    assert m.attempts == 1 and m.passes == 1


def test_concept_mastery_asymptotic_and_bounded(db):
    uid = UID()
    # many perfect passes: mastery approaches but never exceeds 1.0
    for _ in range(30):
        update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=0)
    for cm in db.query(ConceptMastery).filter(ConceptMastery.user_id == uid).all():
        assert 0.0 < cm.mastery <= 1.0

def test_concept_mastery_primary_gets_more_weight(db):
    uid = UID()
    update_mastery(db, uid, "singly", "insertAtHead", passed=True, error_count=0)
    rows = {c.concept: c.mastery for c in db.query(ConceptMastery).filter(ConceptMastery.user_id == uid)}
    # insertAtHead concepts: node_creation (primary), pointer_assignment (secondary)
    assert rows["node_creation"] > rows["pointer_assignment"] > 0
