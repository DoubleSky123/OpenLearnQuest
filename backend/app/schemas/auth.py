from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    xp: int
    is_admin: bool = False
    onboarding_singly_done: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}
