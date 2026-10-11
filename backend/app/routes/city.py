from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..services import city

router = APIRouter(prefix="/api/city", tags=["city"])


class PlaceBody(BaseModel):
    building_key: str
    lot: int


@router.get("")
def get_city(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The caller's city: lots, placed buildings, earned-but-unplaced inventory, progress."""
    return city.city_state(db, current_user.id)


@router.post("/place")
def place_building(body: PlaceBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Place (or move) an earned building on an empty lot of the caller's city."""
    try:
        return city.place(db, current_user.id, body.building_key, body.lot)
    except city.CityError as e:
        raise HTTPException(status_code=e.status, detail=e.message)
