from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..services.ai import get_hint, get_pet_message
from ..dependencies import get_current_user
from ..models.user import User

router = APIRouter(prefix="/api/ai", tags=["ai"])


class HintRequest(BaseModel):
    question_title: str
    operation: str
    your_answer: list[str]
    correct_answer: list[str]
    error_count: int = 0
    emotion: str = "ok"


class PetMessageRequest(BaseModel):
    operation: str
    event: str          # 'wrong' | 'success' | 'step_correct'
    emotion: str = "ok"


@router.post("/hint")
def hint(body: HintRequest, current_user: User = Depends(get_current_user)):
    text = get_hint(
        question_title=body.question_title,
        operation=body.operation,
        your_answer=body.your_answer,
        correct_answer=body.correct_answer,
        error_count=body.error_count,
        emotion=body.emotion,
    )
    return {"hint": text}


@router.post("/pet-message")
def pet_message(body: PetMessageRequest, current_user: User = Depends(get_current_user)):
    text = get_pet_message(operation=body.operation, event=body.event, emotion=body.emotion)
    return {"message": text}
