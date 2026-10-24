# Theater 3D – Hall builder and seat booking

Stack: Three.js (Vite) + FastAPI + PostgreSQL

## Run
```bash
# 1. database
docker compose up -d

# 2. backend (http://localhost:8000/docs)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload

# 3. frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```
Alembic upgrades the database at backend startup. The demo show and the published
`PVR Vegas` hall are seeded from the starter map (Classic rows A-G, Prime rows H/J,
three blocks of four seats). The existing `shows` and `seats` data is retained and
copied into the hall-based model by the startup seed.

Open **Owner studio** in the viewer to register an owner account or sign in. The
demo owner is `owner@pvr.local` / `PvrDemo2026!` (set `DEMO_OWNER_PASSWORD` before
the first seed in a non-demo deployment). Create a draft hall, choose a seat design,
generate rows or click the plan to place seats, set sections/prices and screen/room
dimensions, then save or publish. Published halls with future shows accept renames
and price-only layout updates.

Backend routes include `/api/auth`, `/api/seat-designs`, `/api/halls`, and
`/api/shows`. Owner routes require a bearer token returned by register/login.
`GET /api/health` checks database connectivity. Run backend checks with
`pytest backend/tests` from the repository root after installing requirements;
set `TEST_DATABASE_URL` to a disposable, migrated PostgreSQL database to run the
row-lock booking race integration check.

## Structure
- `backend/app/` – FastAPI (models, seed, routers)
- `backend/migrations/` – Alembic schema migration
- `frontend/src/theater/` – Three.js scene, seat meshes, layout maths
- `frontend/src/ui/` – booking panel and owner hall builder
- `prompts/IDE_AGENT_PROMPT.md` – prompt to hand to your IDE agent
