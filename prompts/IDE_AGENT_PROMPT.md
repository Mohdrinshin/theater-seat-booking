# Prompt for the IDE agent

You are a senior full-stack + WebGL engineer. This repo (`theater3d`) is a working
starter: Three.js (Vite) frontend, FastAPI + PostgreSQL backend. Read the whole repo
first (`README.md`, `backend/app/*`, `frontend/src/*`), run it, then upgrade it
to match the reference below. Do NOT rewrite from scratch; extend the existing structure.

## 1. Reference analysis

### A) Seat map to reproduce (PVR Cinemas, "PVR Vegas Dwarka")
- Header: movie "Namit Malhotra's Ramayana", Thu 5 Nov 5:45 PM, cinema name.
- Curved SCREEN at the top; legend: Available (white box), Selected (yellow), Occupied (grey).
- Two pricing sections, each with a title and "price + GST":
  - CLASSIC ROWS (745.76 + GST): rows A, B, C, D, E, F, G
  - PRIME ROWS (889.82 + GST): rows H, J (no row I)
- Every row = 12 seats in 3 blocks of 4 (1-4, 5-8, 9-12) separated by aisles; row letters on both sides.
- Occupied pattern is already encoded in `backend/app/seed.py` (copy of the screenshot). Keep it.
- Right panel: show details, "No Seat Selected – Select seats to proceed" empty state, then selected list + total.

### B) 3D experience to reproduce (the "Lumiere Grand Cinema" demo video)
- Full-screen real 3D auditorium: dark walls with thin light strips, red recliner seats
  in tiered rows, a big screen at the front.
- Camera modes: "Free flight" (orbit/fly with mouse drag, scroll = move forward/back,
  WASD optional), "Tour the auditorium" (automatic fly-through), and "View from seat"
  (camera sits at a chosen seat at eye height, looking at the screen).
- Controls overlay: zoom +/-, up/down, home/reset, fullscreen, field-of-view slider.
- Info bar: "Distance to screen: X m · Height: Y m" updating for the hovered/selected seat.
- Right sidebar (dark UI): movie genre/title, date chips (Today, Sat 24, Sun 25 …),
  showtime chips (13:00, 16:15, 19:00, 22:00), "Choose your seats" with legend
  (Available / Selected / Reserved), a "Screen view from selected seat" preview,
  and a Total section ("Per ticket …", total, "Select seats" CTA).
- Bottom: movie selector strip with posters.
- Clicking a seat in 3D toggles selection; selected seats turn yellow/gold glow.

## 2. Tasks (do in this order, commit after each)

1. **Verify the baseline**: `docker compose up -d`, start backend + frontend, confirm the
   3D room renders and seat click/booking works. Fix any bugs you find.
2. **Fidelity of the seat layout**: make sure `frontend/src/theater/layout.js` exactly
   matches the PVR map (3 blocks x 4, rows A-G + H,J, prime section visually separated,
   row letters rendered in 3D as sprites/text at both ends of each row).
3. **Better 3D models**: replace box seats in `seats.js` with a nicer recliner
   (rounded geometry or a GLB loaded with GLTFLoader, using InstancedMesh for performance).
   Add side walls with emissive light strips, ceiling, aisle steps, curved screen
   (partial cylinder), screen glow + optional VideoTexture/poster.
4. **Camera system** (`scene.js`): smooth animated transitions (use lerp/tween) between
   Orbit, Free-flight, Tour, and Seat view; FOV slider; reset; fullscreen.
5. **Hover + info**: raycast hover highlight, tooltip "Row C · Seat 7 · Classic · ₹745.76",
   distance-to-screen readout.
6. **UI parity** (`ui/`): split `panel.js` into components; add date chips, showtime chips,
   movie strip, and the empty state text. Style: dark theme like the Lumiere reference.
7. **Backend**:
   - Add `movies` and `halls`; `shows` should reference both (Alembic migrations instead of `create_all`).
   - Endpoints: `GET /api/movies`, `GET /api/shows?movie_id=&date=`, `GET /api/shows/{id}/seats`,
     `POST /api/shows/{id}/hold` (hold seats 5 min), `POST /api/shows/{id}/book`.
   - Add a seat status `held` + expiry; release expired holds. Keep row-level locking in `book`.
   - Add pytest tests for double-booking races.
   - Optional: WebSocket `/ws/shows/{id}` that broadcasts seat status changes live.
8. **Quality**: keep modules small, no globals, add JSDoc/type hints, README updates,
   a `.env` example, and make `npm run build` pass.

## 3. Constraints
- Stack fixed: Three.js (no React Three Fiber), Vite, FastAPI, SQLAlchemy 2, PostgreSQL.
- Layout maths stays in ONE place (`layout.js`); the DB only stores row letter + number.
- 60 fps target on a mid laptop: use InstancedMesh, limit shadows, dispose geometries.
- Mobile friendly: touch orbit, panel collapses to a bottom sheet.
- Don't add paid assets; use free GLB/CC0 models or procedural geometry.

## 4. Definition of done
Open the site → see the dark 3D hall with red seats → click seats (they turn gold) →
switch to "View from seat" and see the screen from there → book → those seats become
grey/occupied for everyone after refresh.
