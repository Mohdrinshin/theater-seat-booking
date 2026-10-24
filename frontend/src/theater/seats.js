import * as THREE from 'three';
import { seatPosition } from './layout.js';

const COLORS = { available: 0xc0262d, selected: 0xf5c400, occupied: 0x3a3a42 };

function buildSeatMesh(design = 'classic', colors = {}) {
  const g = new THREE.Group();
  const cushion = new THREE.MeshStandardMaterial({ color: colors.cushion || '#a71927', roughness: 0.56 });
  const frame = new THREE.MeshStandardMaterial({ color: colors.frame || '#28252a', roughness: 0.72 });
  const accent = new THREE.MeshStandardMaterial({ color: colors.accent || '#554b43', roughness: 0.42, metalness: 0.25 });
  const part = (w, h, d, x, y, z, material = cushion, radius = 0.08) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), material);
    m.position.set(x, y, z);
    m.userData.rounding = radius;
    m.castShadow = true;
    g.add(m);
  };
  const w = design === 'recliner' ? 0.72 : design === 'couple' ? 1.25 : design === 'lounger' ? 0.82 : 0.52;
  if (design === 'accessible') {
    part(1.05, 0.025, 1.2, 0, 0.025, 0, accent);
    part(0.82, 0.025, 0.06, 0, 0.045, -0.55, cushion);
    part(0.82, 0.025, 0.06, 0, 0.045, 0.55, cushion);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20), accent);
    wheel.rotation.y = Math.PI / 2; wheel.position.set(-0.35, 0.23, 0.18); g.add(wheel);
    part(0.05, 0.36, 0.05, -0.35, 0.2, 0.15, frame);
  } else {
    const seatDepth = design === 'lounger' ? 1.15 : design === 'recliner' ? 0.68 : 0.5;
    part(w, 0.18, seatDepth, 0, 0.36, 0, cushion);
    part(w, design === 'lounger' ? 0.18 : 0.68, 0.12, 0, design === 'lounger' ? 0.49 : 0.68, seatDepth * 0.43, cushion);
    part(0.075, 0.3, seatDepth * 0.82, -w / 2 - 0.04, 0.5, 0, frame);
    part(0.075, 0.3, seatDepth * 0.82, w / 2 + 0.04, 0.5, 0, frame);
    part(w * 0.8, 0.24, 0.34, 0, 0.15, 0, accent);
    if (design === 'recliner' || design === 'lounger') {
      part(w * 0.82, 0.13, design === 'lounger' ? 0.45 : 0.35, 0, 0.22, -seatDepth * 0.62, cushion);
      part(0.28, 0.08, 0.24, w * 0.75, 0.48, -0.05, accent);
    }
    if (design === 'couple') part(0.025, 0.12, 0.5, 0, 0.49, 0, accent);
  }
  g.userData.material = cushion;
  return g;
}

export class SeatManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.byId = new Map();     // seatId -> { data, instances: [{ mesh, index, baseColor }] }
    this.selected = new Set();
  }

  build(seats) {
    for (const child of this.group.children) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    }
    this.group.clear();
    this.byId.clear();
    this.selected.clear();
    const buckets = new Map();
    for (const data of seats) {
      const key = `${data.design || 'classic'}:${JSON.stringify(data.colors || {})}`;
      if (!buckets.has(key)) buckets.set(key, { design: data.design || 'classic', colors: data.colors || {}, seats: [] });
      buckets.get(key).seats.push(data);
    }

    for (const bucket of buckets.values()) {
      const template = buildSeatMesh(bucket.design, bucket.colors);
      template.updateMatrixWorld(true);
      const parts = template.children.map((part) => ({
        geometry: part.geometry,
        material: part.material.clone(),
        matrix: part.matrix.clone(),
        baseColor: part.material.color.clone(),
      }));
      const instanceSets = parts.map((part) => {
        const material = part.material;
        material.color.set(0xffffff);
        const mesh = new THREE.InstancedMesh(part.geometry, material, bucket.seats.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.instanceSeatIds = [];
        this.group.add(mesh);
        return mesh;
      });
      bucket.seats.forEach((data, index) => {
        const p = Number.isFinite(data.x) && Number.isFinite(data.z) ? data : seatPosition(data.row, data.number);
        const position = new THREE.Vector3(p.x, p.y || 0, p.z);
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (data.rotation_y || 0) * Math.PI / 180);
        const outer = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
        const instances = parts.map((part, partIndex) => {
          const mesh = instanceSets[partIndex];
          const matrix = outer.clone().multiply(part.matrix);
          mesh.setMatrixAt(index, matrix);
          mesh.userData.instanceSeatIds[index] = data.id;
          return { mesh, index, baseColor: part.baseColor.clone() };
        });
        this.byId.set(data.id, { data, instances });
      });
      instanceSets.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
      template.traverse((object) => {
        if (object.geometry && !parts.some((part) => part.geometry === object.geometry)) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
      for (const data of bucket.seats) this.paint(data.id);
    }
  }

  paint(id) {
    const { data, instances } = this.byId.get(id);
    const state = data.status === 'occupied' ? 'occupied' : this.selected.has(id) ? 'selected' : 'available';
    for (const instance of instances) {
      instance.mesh.setColorAt(instance.index, state === 'available' ? instance.baseColor : new THREE.Color(COLORS[state]));
      if (instance.mesh.instanceColor) instance.mesh.instanceColor.needsUpdate = true;
    }
  }

  toggle(id) {
    const entry = this.byId.get(id);
    if (!entry || entry.data.status !== 'available') return;
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
    this.paint(id);
  }

  selectedSeats() {
    return [...this.selected].map((id) => this.byId.get(id).data);
  }

  /** Walk up parents so clicks on any sub-mesh resolve to a seat id. */
  pick(raycaster) {
    const hit = raycaster.intersectObjects(this.group.children, false)[0];
    return hit?.object?.userData?.instanceSeatIds?.[hit.instanceId];
  }
}
