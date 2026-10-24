import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Rounded superellipsoid cushion. Default thickness axis is Z (back/seat pads).
export function pillow(width, height, depth, { axis = 'z', bulge = 0.22, e = 0.52, bend = 0 } = {}) {
  const geometry = mergeVertices(new THREE.SphereGeometry(1, 40, 28));
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const axes = axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];
    const thickness = axis;
    for (const component of ['x', 'y', 'z']) {
      const pow = component === thickness ? 0.55 : e;
      const value = v[component];
      v[component] = Math.sign(value) * Math.pow(Math.abs(value), pow);
    }
    const u = v[axes[0]], t = v[axes[1]];
    v[thickness] *= (1 - bulge) + bulge * Math.max(0, (1 - u * u) * (1 - t * t));
    if (bend) v.z += bend * (v.x * v.x);
    v.x *= width / 2; v.y *= height / 2; v.z *= depth / 2;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}
