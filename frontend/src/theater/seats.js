import * as THREE from 'three';
import { SEAT_DESIGN_BY_KEY } from '../designs/registry.js';
import { bakeSeat } from '../designs/geometry/bake.js';
import { finishColor, getMaterialLibrary } from '../designs/materials/library.js';
import { seatPosition } from './layout.js';

const SELECTED = new THREE.Color('#c9a46a');
const OCCUPIED = new THREE.Color('#343438');

function finishWithVariation(matKey, data) {
  const color = finishColor(matKey, data.colors || {});
  if (matKey === 'leather' || matKey === 'fabric') {
    const seed = String(data.id ?? `${data.row_label || data.row}-${data.seat_number || data.number}`)
      .split('').reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 17);
    color.multiplyScalar(.96 + (seed % 801) / 10000);
  }
  return color;
}

export class SeatManager {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.byId = new Map(); this.selected = new Set(); this.meshes = [];
  }

  build(seats) {
    this.clearContactShadow();
    this.group.clear(); this.byId.clear(); this.selected.clear(); this.meshes = [];
    this.addContactShadows(seats);
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
          mesh.setColorAt(index, finishWithVariation(matKey, { ...data, colors: data.colors || design.defaultFinish }));
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
      const color = state === 'occupied' ? OCCUPIED : state === 'selected' ? SELECTED : finishWithVariation(matKey, entry.data);
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
  addContactShadows(seats) {
    if (!seats.length) return;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(7,3,5,.28)'); gradient.addColorStop(.58, 'rgba(7,3,5,.14)'); gradient.addColorStop(1, 'rgba(7,3,5,0)');
    context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.PlaneGeometry(1.18, .92);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const shadows = new THREE.InstancedMesh(geometry, material, seats.length);
    shadows.name = 'seat contact shadows'; shadows.renderOrder = 1;
    const temp = new THREE.Object3D();
    seats.forEach((seat, index) => {
      const fallback = seatPosition(seat.row, seat.number);
      const p = Number.isFinite(seat.x) && Number.isFinite(seat.z) ? seat : fallback;
      temp.position.set(p.x, (p.y || 0) + .008, p.z); temp.rotation.set(-Math.PI / 2, 0, 0); temp.updateMatrix();
      shadows.setMatrixAt(index, temp.matrix);
    });
    shadows.instanceMatrix.needsUpdate = true; this.group.add(shadows);
    this.contactShadow = { geometry, material, texture };
  }

  clearContactShadow() {
    if (!this.contactShadow) return;
    this.contactShadow.geometry.dispose(); this.contactShadow.material.dispose(); this.contactShadow.texture.dispose();
    this.contactShadow = null;
  }

  dispose() { this.clearContactShadow(); this.group.removeFromParent(); this.group.clear(); this.byId.clear(); this.selected.clear(); this.meshes = []; }
}
