import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function rbox(width, height, depth, radius = 0.025, segments = 3) {
  const maxRadius = Math.min(width, height, depth) * 0.48;
  return new RoundedBoxGeometry(width, height, depth, segments, Math.min(radius, maxRadius));
}
