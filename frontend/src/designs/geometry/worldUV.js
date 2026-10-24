export function applyWorldUV(geometry) {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (!uv || !position) return geometry;
  for (let i = 0; i < position.count; i += 1) uv.setXY(i, position.getX(i), position.getY(i));
  uv.needsUpdate = true;
  return geometry;
}
