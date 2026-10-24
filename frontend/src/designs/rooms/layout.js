import { SEAT_DESIGN_BY_KEY } from '../registry.js';

export function computeRoomLayout(theme, seatKey = theme.defaultSeat, overrides = {}) {
  const L = { ...theme.layout, ...overrides };
  const seat = SEAT_DESIGN_BY_KEY[seatKey];
  const sections = L.sec || [4];
  const spacing = seat.width + .06;
  const seatingWidth = sections.reduce((sum, count) => sum + count * spacing, 0) + Math.max(0, sections.length - 1) * L.aisle;
  const width = Math.max(L.minW, seatingWidth + 2 * L.side);
  const pitch = Math.max(L.pitch, seat.depthOpen + .5);
  const depth = L.front + L.rows * pitch + L.back;
  const height = Math.max(L.height, (L.rows - 1) * L.riser + 3);
  let screenWidth = width * L.fill;
  let screenHeight = screenWidth / L.aspect;
  if (screenHeight > height - L.stage - .9) { screenHeight = height - L.stage - .9; screenWidth = screenHeight * L.aspect; }
  return { width, depth, height, pitch, screenWidth, screenHeight, capacity: L.rows * sections.reduce((a, b) => a + b, 0) * seat.capacity };
}
