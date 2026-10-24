// All geometry lives here so the 3D room and the DB layout stay in sync.
// Matches the PVR seat map: rows A-G (classic), H-J (prime), 3 blocks of 4 seats.
export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'];
export const CLASSIC_COUNT = 7;           // rows before the prime section

export const SEAT_W = 0.7;                // spacing between seats
export const BLOCK_GAP = 1.1;             // aisle between 4-seat blocks
export const ROW_DEPTH = 1.15;            // distance between rows
export const RISER = 0.28;                // height gained per row (stadium tiers)
export const FIRST_ROW_Z = 4;             // distance from screen to row A
export const SECTION_GAP = 1.2;           // extra gap between classic and prime

export const SCREEN = { width: 16, height: 7, y: 4.2, z: 0 };

export function seatPosition(rowLetter, number) {
  const r = ROWS.indexOf(rowLetter);
  const block = Math.floor((number - 1) / 4);      // 0,1,2
  const inBlock = (number - 1) % 4;                // 0..3
  const blockWidth = 3 * SEAT_W;
  const totalWidth = 3 * blockWidth + 2 * BLOCK_GAP;
  const x = -totalWidth / 2 + block * (blockWidth + BLOCK_GAP) + inBlock * SEAT_W;
  const prime = r >= CLASSIC_COUNT ? SECTION_GAP : 0;
  const z = FIRST_ROW_Z + r * ROW_DEPTH + prime;
  const y = r * RISER;
  return { x, y, z };
}
