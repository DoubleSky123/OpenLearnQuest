"""The student's home city.

A building is EARNED by learning — never stored as earned: it is derived from
mastery every time, so it can't drift from what the skill tree shows. Only the
student's placement choice is stored (city_buildings).

For now there is one building: master every singly-linked-list operation
("Mastered ✓" on the skill tree, i.e. mastery_summary's `mastered`) and the
Linked List Tower goes into the inventory, ready to place on an empty lot.
"""
from sqlalchemy.orm import Session

from ..models import CityBuilding
from . import game_master as gm

LOT_COUNT = 8

BUILDINGS: dict[str, dict] = {
    "linked_list": {"title": "Linked List Tower", "module_id": "singly"},
}


class CityError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _progress(db: Session, user_id: str) -> dict[str, dict]:
    out = {}
    for key, spec in BUILDINGS.items():
        summary = gm.mastery_summary(gm.get_mastery_map(db, user_id, spec["module_id"]), spec["module_id"])
        out[key] = {
            "title": spec["title"],
            "mastered": summary["total_mastered"],
            "total": summary["total_ops"],
            "earned": summary["total_mastered"] >= summary["total_ops"],
        }
    return out


def city_state(db: Session, user_id: str) -> dict:
    progress = _progress(db, user_id)
    placed = db.query(CityBuilding).filter(CityBuilding.user_id == user_id).all()
    placed_keys = {b.building_key for b in placed}
    return {
        "lots": LOT_COUNT,
        "placed": [{"building_key": b.building_key, "title": BUILDINGS.get(b.building_key, {}).get("title", b.building_key), "lot": b.lot}
                   for b in placed if b.building_key in BUILDINGS],
        "inventory": [{"building_key": k, "title": BUILDINGS[k]["title"]}
                      for k, p in progress.items() if p["earned"] and k not in placed_keys],
        "progress": progress,
    }


def place(db: Session, user_id: str, building_key: str, lot: int) -> dict:
    """Place an earned building on an empty lot, or move it to another one."""
    if building_key not in BUILDINGS:
        raise CityError(404, "Unknown building")
    if not 0 <= lot < LOT_COUNT:
        raise CityError(400, f"Lot must be between 0 and {LOT_COUNT - 1}")
    if not _progress(db, user_id)[building_key]["earned"]:
        raise CityError(403, "This building hasn't been earned yet")
    taken = db.query(CityBuilding).filter(CityBuilding.user_id == user_id, CityBuilding.lot == lot).first()
    if taken and taken.building_key != building_key:
        raise CityError(409, "That lot is already built on")
    mine = db.query(CityBuilding).filter(CityBuilding.user_id == user_id, CityBuilding.building_key == building_key).first()
    if mine:
        mine.lot = lot
    else:
        db.add(CityBuilding(user_id=user_id, building_key=building_key, lot=lot))
    db.commit()
    return city_state(db, user_id)
