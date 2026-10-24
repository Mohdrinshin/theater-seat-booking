import os
from contextlib import asynccontextmanager
from pathlib import Path
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .db import SessionLocal, engine
from .routers import shows, halls, auth, designs
from .seed import seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    database_url = os.getenv("DATABASE_URL", "postgresql+psycopg2://theater:theater@localhost:5432/theater")
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    command.upgrade(config, "head")
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
app.include_router(auth.router)
app.include_router(halls.router)
app.include_router(designs.router)


@app.get("/api/health")
def health():
    """Report API and database readiness for the frontend startup check."""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"ok": True, "database": "ready"}
