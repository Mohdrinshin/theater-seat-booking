import * as THREE from 'three';
import { SEAT_DESIGN_BY_KEY } from '../designs/registry.js';
import { bakeSeat } from '../designs/geometry/bake.js';
import { finishColor, getMaterialLibrary } from '../designs/materials/library.js';
import { seatPosition } from './layout.js';

const SELECTED = new THREE.Color('#c9a46a');
const OCCUPIED = new THREE.Color('#343438');

export class SeatManager {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.byId = new Map(); this.selected = new Set(); this.meshes = [];
  }

  build(seats) {
    this.group.clear(); this.byId.clear(); this.selected.clear(); this.meshes = [];
    const buckets = new Map();
    for (const data of seats) {
      const designKey = SEAT_DESIGN_BY_KEY[data.design] ? data.design : 'classic';
      const designOptions = data.design_options || { recline: designKey === 'vip', centerArm: true };
      const bucketKey = `${designKey}:${JSON.stringify(designOptions)}`;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, { designKey, designOptions, seats: [] });
      buckets.get(bucketKey).seats.push({ ...data, design: designKey, design_options: designOptions });
    }
    const materials = getMaterialLibrary();
    for (const { designKey, designOptions, seats: designSeats } of buckets.values()) {
      const design = SEAT_DESIGN_BY_KEY[designKey];
      const baked = bakeSeat(design, { recline: designOptions.recline ?? designKey === 'vip', centerArm: designOptions.centerArm ?? true });
      for (const { matKey, geometry } of baked) {
        const mesh = new THREE.InstancedMesh(geometry, materials[matKey], designSeats.length);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.instanceSeatIds = [];
        this.group.add(mesh); this.meshes.push(mesh);
        designSeats.forEach((data, index) => {
          const fallback = seatPosition(data.row, data.number);
          const p = Number.isFinite(data.x) && Number.isFinite(data.z) ? data : fallback;
          const outer = new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, p.y || 0, p.z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (data.rotation_y || 0) * Math.PI / 180),
            new THREE.Vector3(1, 1, 1),
          );
          mesh.setMatrixAt(index, outer);
          mesh.userData.instanceSeatIds[index] = data.id;
          mesh.setColorAt(index, finishColor(matKey, data.colors || design.defaultFinish));
          if (!this.byId.has(data.id)) this.byId.set(data.id, { data, instances: [] });
          this.byId.get(data.id).instances.push({ mesh, index, matKey });
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  paint(id) {
    const entry = this.byId.get(id); if (!entry) return;
    const state = entry.data.status === 'occupied' ? 'occupied' : this.selected.has(id) ? 'selected' : 'available';
    for (const { mesh, index, matKey } of entry.instances) {
      const color = state === 'occupied' ? OCCUPIED : state === 'selected' ? SELECTED : finishColor(matKey, entry.data.colors || {});
      mesh.setColorAt(index, color);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  toggle(id) {
    const entry = this.byId.get(id);
    if (!entry || entry.data.status !== 'available') return;
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
    this.paint(id);
  }

  selectedSeats() { return [...this.selected].map((id) => this.byId.get(id).data); }
  pick(raycaster) {
    const hit = raycaster.intersectObjects(this.group.children, false)[0];
    return hit?.object?.userData?.instanceSeatIds?.[hit.instanceId];
  }
  dispose() { this.group.removeFromParent(); this.group.clear(); this.byId.clear(); this.selected.clear(); this.meshes = []; }
}
