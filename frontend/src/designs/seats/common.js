import * as THREE from 'three';
import { pillow } from '../geometry/pillow.js';
import { rbox } from '../geometry/rbox.js';
import { weld } from '../geometry/weld.js';
import { cupHolder } from '../geometry/cupHolder.js';
import { getMaterialLibrary } from '../materials/library.js';
import { applyWorldUV } from '../geometry/worldUV.js';

export function group() { return new THREE.Group(); }
export function part(parent, mat, geometry, x = 0, y = 0, z = 0, rotation = null) {
  applyWorldUV(geometry);
  const mesh = new THREE.Mesh(geometry, getMaterialLibrary()[mat]);
  mesh.userData.mat = mat; mesh.position.set(x, y, z); if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export function hard(parent, mat, w, h, d, x, y, z, radius = .025) { return part(parent, mat, rbox(w, h, d, radius), x, y, z); }
export function soft(parent, mat, w, h, d, x, y, z, opts = {}) { return part(parent, mat, pillow(w, h, d, opts), x, y, z); }
export function cushion(parent, mat, w, h, d, x, y, z, opts = {}) {
  soft(parent, mat, w, h, d, x, y, z, opts);
  part(parent, 'thread', weld(w * .94, d * .94, .004), x, y, z);
}
export { cupHolder };
export function pivot(parent, x, y, z, angle, draw) {
  const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.x = angle; parent.add(holder); draw(holder); return holder;
}
