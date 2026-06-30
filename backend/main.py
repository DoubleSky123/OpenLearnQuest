from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routes import auth, progress, tutor, emotion, admin, game_master

app = FastAPI(title="OpenLearnQuest API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(progress.router)
app.include_router(tutor.router)
app.include_router(emotion.router)
app.include_router(admin.router)
app.include_router(game_master.router)


@app.get("/health")
def health():
    return {"status": "ok"}
