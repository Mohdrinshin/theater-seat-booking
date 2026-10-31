# Theater 3D – Hall builder and seat booking

Stack: Three.js (Vite) + FastAPI + PostgreSQL

## Run
Start each service in its own terminal from the repository root:

**Terminal 1 — database**
```bash
docker compose up -d
```

**Terminal 2 — backend** (http://localhost:8000/docs)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

**Terminal 3 — frontend** (http://localhost:5173)
```bash
cd frontend
pnpm install
pnpm dev
```
The frontend only serves the UI. Keep the database and backend running; Vite
forwards `/api` requests to `http://localhost:8000`. If the viewer shows
**Theater unavailable**, check that the backend terminal is still running and
that `http://localhost:8000/api/health` responds before retrying.
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

## Razorpay checkout
Copy `backend/.env.example` to `backend/.env` and set `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` from your Razorpay Dashboard.
The secret stays on the backend; only the public key ID is sent to Standard Checkout.
The backend calculates the GST-inclusive amount, creates the Razorpay order, holds
seats, verifies the Checkout HMAC signature, confirms captured payments, and books
the seats. Expired holds on payments captured too late trigger a refund attempt.
Set `RAZORPAY_MAX_AMOUNT_PAISE=300` to cap all orders at ₹3.00 during testing;
the limit is enforced by the backend after GST is added.

Configure a Razorpay webhook to send `payment.captured` events to
`https://<your-api-host>/api/payments/webhook`, using the same webhook secret in
`RAZORPAY_WEBHOOK_SECRET`. For local development, use Razorpay's test keys and a
public webhook tunnel if you want to exercise webhook delivery. Enable payment
auto-capture in the Razorpay Dashboard; the backend also attempts to capture an
authorized payment during Checkout signature verification.

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
