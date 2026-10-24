import * as THREE from 'three';
import { seatPosition } from './layout.js';

const COLORS = { available: 0xc0262d, selected: 0xf5c400, occupied: 0x3a3a42 };

function buildSeatMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const part = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  };
  part(0.55, 0.18, 0.55, 0, 0.35, 0);        // cushion
  part(0.55, 0.7, 0.12, 0, 0.65, 0.25);      // backrest (screen is toward -z)
  part(0.08, 0.3, 0.5, -0.3, 0.5, 0);        // left arm
  part(0.08, 0.3, 0.5, 0.3, 0.5, 0);         // right arm
  part(0.4, 0.3, 0.4, 0, 0.15, 0);           // base
  g.userData.material = mat;
  return g;
}

export class SeatManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.byId = new Map();     // seatId -> { data, mesh }
    this.selected = new Set();
  }

  build(seats) {
    this.group.clear();
    this.byId.clear();
    this.selected.clear();
    for (const s of seats) {
      const mesh = buildSeatMesh();
      const p = seatPosition(s.row, s.number);
      mesh.position.set(p.x, p.y, p.z);
      mesh.userData.seatId = s.id;
      this.group.add(mesh);
      this.byId.set(s.id, { data: s, mesh });
      this.paint(s.id);
    }
  }

  paint(id) {
    const { data, mesh } = this.byId.get(id);
    const state = data.status === 'occupied' ? 'occupied' : this.selected.has(id) ? 'selected' : 'available';
    mesh.userData.material.color.setHex(COLORS[state]);
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
    const hit = raycaster.intersectObjects(this.group.children, true)[0];
    let o = hit?.object;
    while (o && o.userData.seatId === undefined) o = o.parent;
    return o?.userData.seatId;
  }
}
