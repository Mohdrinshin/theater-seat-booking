# Theater 3D – 3D seat selection

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
Tables are created and a demo show is seeded automatically on first start
(layout copied from the PVR screenshot: Classic rows A-G, Prime rows H-J, 3 blocks x 4 seats).

## Structure
- `backend/app/` – FastAPI (models, seed, routers)
- `frontend/src/theater/` – Three.js scene, seat meshes, layout maths
- `frontend/src/ui/` – side panel (selection + booking)
- `prompts/IDE_AGENT_PROMPT.md` – prompt to hand to your IDE agent
