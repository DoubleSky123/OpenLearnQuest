import secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas.auth import UserCreate, UserLogin, Token, UserOut
from ..services.auth import create_user, authenticate_user, create_access_token
from ..dependencies import get_current_user
from ..models.user import User
from ..config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AdminCreate(BaseModel):
    email: str
    username: str
    password: str
    admin_key: str


@router.post("/register", response_model=dict)
def register(body: UserCreate, db: Session = Depends(get_db)):
    user = create_user(db, body.email, body.username, body.password)
    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer", "user": UserOut.model_validate(user)}


@router.post("/register-admin", response_model=dict)
def register_admin(body: AdminCreate, db: Session = Depends(get_db)):
    if not secrets.compare_digest(body.admin_key, settings.admin_key):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    user = create_user(db, body.email, body.username, body.password)
    user.is_admin = True
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer", "user": UserOut.model_validate(user)}


@router.post("/login", response_model=dict)
def login(body: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, body.email, body.password)
    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer", "user": UserOut.model_validate(user)}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


class OnboardingUpdate(BaseModel):
    module_id: str   # 'singly' | 'doubly'


@router.patch("/me/onboarding", response_model=UserOut)
def complete_onboarding(
    body: OnboardingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark onboarding as complete for the given module. Idempotent."""
    if body.module_id == "singly":
        current_user.onboarding_singly_done = True
    db.commit()
    db.refresh(current_user)
    return current_user
