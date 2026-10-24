import * as THREE from 'three';
import { ROOM_THEME_BY_KEY } from './themes.js';
import { computeRoomLayout } from './layout.js';
import { addWallStyle } from './wallStyles.js';

export function buildRoom(scene, themeKey, room, layoutOverrides = {}, seatDesign = null, quality = 'high') {
  const theme = ROOM_THEME_BY_KEY[themeKey] || ROOM_THEME_BY_KEY.multiplex;
  const group = new THREE.Group(); group.name = `room-theme-${theme.key}`; scene.add(group);
  const roomLayout = computeRoomLayout(theme, seatDesign || theme.defaultSeat, layoutOverrides);
  const carpet = new THREE.MeshStandardMaterial({ color: theme.palette.carpet, roughness: .98 });
  const dark = new THREE.MeshStandardMaterial({ color: '#161619', roughness: .75, metalness: .35 });
  const emissive = new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffbb64', emissiveIntensity: .6, roughness: .45 });
  const rows = layoutOverrides.anchors?.length
    ? [...new Map(layoutOverrides.anchors.map((seat) => [seat.row_label || seat.row, seat])).values()].sort((a, b) => a.z - b.z)
    : Array.from({ length: theme.layout.rows }, (_, i) => ({ z: theme.layout.front + i * roomLayout.pitch, y: i * theme.layout.riser, row_label: `${i}` }));
  const anchors = [];
  rows.forEach((row, i) => {
    const z = row.z || theme.layout.front + i * roomLayout.pitch;
    const y = row.y || i * theme.layout.riser;
    const nextZ = rows[i + 1]?.z || (i === rows.length - 1 ? room.depth : z + roomLayout.pitch);
    const depth = Math.max(.3, nextZ - z);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(room.width, .12, depth), carpet);
    platform.position.set(0, y - .06, z + depth / 2); platform.receiveShadow = true; group.add(platform);
    if (i > 0 && y > 0) {
      const riser = new THREE.Mesh(new THREE.BoxGeometry(room.width, y - (rows[i - 1].y || 0), .035), dark);
      riser.position.set(0, (y + (rows[i - 1].y || 0)) / 2, z); group.add(riser);
      for (const side of [-1, 1]) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(.08, .025, .015), emissive);
        light.position.set(side * (room.width / 2 - .14), y - .08, z - .025); light.userData.accent = true; group.add(light);
      }
    }
    anchors.push({ row: row.row_label, z, y });
  });
  addWallStyle(group, room, theme);
  if (theme.palette.curtain) {
    for (const side of [-1, 1]) {
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(.95, room.height * .78), new THREE.MeshStandardMaterial({ color: theme.palette.curtain, roughness: .92, side: THREE.DoubleSide }));
      curtain.position.set(side * Math.min(room.width * .4, 9), room.height * .39, .45); group.add(curtain);
    }
  }
  const stage = new THREE.Mesh(new THREE.BoxGeometry(room.width * .72, Math.max(.12, theme.layout.stage), 1), dark);
  stage.position.set(0, theme.layout.stage / 2, .5); group.add(stage);
  if (theme.style === 'walnut') {
    const beams = []; for (let z = 2; z < room.depth; z += 2.4) beams.push([0, room.height - .12, z]);
    const beam = new THREE.MeshStandardMaterial({ color: theme.palette.feature, roughness: .6 });
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(room.width, .16, .24), beam, beams.length);
    const temp = new THREE.Object3D(); beams.forEach((p, i) => { temp.position.set(...p); temp.updateMatrix(); inst.setMatrixAt(i, temp.matrix); }); group.add(inst);
  }
  return { scene: group, seatAnchors: anchors, cameras: {}, layout: roomLayout, dispose() {
    group.traverse((obj) => { obj.geometry?.dispose(); if (obj.material && !Array.isArray(obj.material)) obj.material.dispose(); });
    group.removeFromParent();
  } };
}
