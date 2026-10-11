"""Home city: a building is earned from mastery (never stored as earned) and the
student places it on an empty lot."""
import uuid

import pytest

from app.models import CityBuilding
from app.services import city
from app.services.game_master import ALL_OPS, update_mastery

UID = lambda: str(uuid.uuid4())


def master(db, uid, ops):
    for op in ops:
        update_mastery(db, uid, "singly", op, passed=True, error_count=0)


def test_new_student_has_an_empty_city_and_no_building(db):
    state = city.city_state(db, UID())
    assert state["lots"] == city.LOT_COUNT
    assert state["placed"] == [] and state["inventory"] == []
    assert state["progress"]["linked_list"] == {"title": "Linked List Tower", "mastered": 0, "total": 12, "earned": False}


def test_eleven_of_twelve_is_not_enough(db):
    uid = UID()
    master(db, uid, ALL_OPS[:-1])
    state = city.city_state(db, uid)
    assert state["progress"]["linked_list"]["mastered"] == 11
    assert state["inventory"] == []
    with pytest.raises(city.CityError) as e:
        city.place(db, uid, "linked_list", 0)
    assert e.value.status == 403


def test_imperfect_passes_do_not_count_as_mastered(db):
    uid = UID()
    for op in ALL_OPS:
        update_mastery(db, uid, "singly", op, passed=True, error_count=1)
    assert city.city_state(db, uid)["progress"]["linked_list"]["earned"] is False


def test_mastering_every_operation_puts_the_tower_in_the_inventory(db):
    uid = UID()
    master(db, uid, ALL_OPS)
    state = city.city_state(db, uid)
    assert state["inventory"] == [{"building_key": "linked_list", "title": "Linked List Tower"}]


def test_placing_moves_it_from_inventory_to_the_lot_and_moving_keeps_one_row(db):
    uid = UID()
    master(db, uid, ALL_OPS)
    state = city.place(db, uid, "linked_list", 3)
    assert state["inventory"] == []
    assert state["placed"] == [{"building_key": "linked_list", "title": "Linked List Tower", "lot": 3}]
    state = city.place(db, uid, "linked_list", 5)   # move
    assert [b["lot"] for b in state["placed"]] == [5]
    assert db.query(CityBuilding).filter(CityBuilding.user_id == uid).count() == 1


@pytest.mark.parametrize("lot", [-1, city.LOT_COUNT])
def test_lot_must_exist(db, lot):
    uid = UID()
    master(db, uid, ALL_OPS)
    with pytest.raises(city.CityError) as e:
        city.place(db, uid, "linked_list", lot)
    assert e.value.status == 400


def test_unknown_building_is_rejected(db):
    with pytest.raises(city.CityError) as e:
        city.place(db, UID(), "skyscraper", 0)
    assert e.value.status == 404


def test_a_lot_holds_one_building(db):
    uid = UID()
    master(db, uid, ALL_OPS)
    db.add(CityBuilding(user_id=uid, building_key="future_building", lot=2))   # a later district's building
    db.commit()
    with pytest.raises(city.CityError) as e:
        city.place(db, uid, "linked_list", 2)
    assert e.value.status == 409


def test_cities_are_per_student(db):
    a, b = UID(), UID()
    master(db, a, ALL_OPS)
    city.place(db, a, "linked_list", 1)
    assert city.city_state(db, b)["placed"] == []
