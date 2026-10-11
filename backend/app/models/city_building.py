import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class CityBuilding(Base):
    """A building the student earned and placed in their home city.
    Earning is derived from mastery (services/city.py); only placement is stored."""
    __tablename__ = "city_buildings"
    __table_args__ = (
        UniqueConstraint("user_id", "building_key", name="uq_city_building_user_key"),   # each building once
        UniqueConstraint("user_id", "lot", name="uq_city_building_user_lot"),            # one building per lot
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    building_key: Mapped[str] = mapped_column(String, nullable=False)   # e.g. 'linked_list'
    lot: Mapped[int] = mapped_column(Integer, nullable=False)           # 0-based lot index in the city
    placed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="city_buildings")
