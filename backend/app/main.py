import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .db import Base, SessionLocal, engine
from .routers import shows
from .seed import seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="Theater 3D API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(shows.router)


@app.get("/api/health")
def health():
    """Report API and database readiness for the frontend startup check."""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"ok": True, "database": "ready"}
