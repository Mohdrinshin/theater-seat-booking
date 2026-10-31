import * as THREE from 'three';
import { ROOM_THEME_BY_KEY } from './themes.js';
import { computeRoomLayout } from './layout.js';
import { addWallStyle } from './wallStyles.js';

export function buildRoom(scene, themeKey, room, layoutOverrides = {}, seatDesign = null, quality = 'high') {
  const theme = ROOM_THEME_BY_KEY[themeKey] || ROOM_THEME_BY_KEY.multiplex;
  const group = new THREE.Group(); group.name = `room-theme-${theme.key}`; scene.add(group);
  const roomLayout = computeRoomLayout(theme, seatDesign || theme.defaultSeat, layoutOverrides);
  const carpetMap = theme.style === 'crimson-premiere' ? createCarpetTexture(room.width, room.depth) : null;
  const carpet = new THREE.MeshStandardMaterial({ color: theme.palette.carpet, roughness: .98, map: carpetMap });
  const dark = new THREE.MeshStandardMaterial({ color: '#161619', roughness: .75, metalness: .35 });
  const emissive = new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffbb64', emissiveIntensity: .6, roughness: .45 });
  const rows = layoutOverrides.anchors?.length
    ? [...new Map(layoutOverrides.anchors.map((seat) => [seat.row_label || seat.row, seat])).values()].sort((a, b) => a.z - b.z)
    : Array.from({ length: theme.layout.rows }, (_, i) => ({ z: theme.layout.front + i * roomLayout.pitch, y: i * theme.layout.riser, row_label: `${i}` }));
  const anchors = [];
  const grand = theme.style === 'crimson-premiere';
  const stairCenters = grand ? [-theme.layout.stairCenter, theme.layout.stairCenter] : [];
  const stairWidth = theme.layout.stairWidth || 1.18;
  rows.forEach((row, i) => {
    const z = row.z || theme.layout.front + i * roomLayout.pitch;
    const y = row.y || i * theme.layout.riser;
    const nextZ = rows[i + 1]?.z || (i === rows.length - 1 ? room.depth : z + roomLayout.pitch);
    const depth = Math.max(.3, nextZ - z);
    if (grand) {
      let leftEdge = -room.width / 2;
      const aisles = stairCenters.map((center) => [center - stairWidth / 2, center + stairWidth / 2]).sort((a, b) => a[0] - b[0]);
      for (const [aisleLeft, aisleRight] of aisles) {
        const width = Math.max(0, aisleLeft - leftEdge);
        if (width > .1) addPlatform(leftEdge + width / 2, width, y, z, depth);
        const stair = new THREE.Mesh(new THREE.BoxGeometry(aisleRight - aisleLeft - .1, .08, depth), dark);
        stair.position.set((aisleLeft + aisleRight) / 2, y - .025, z + depth / 2); stair.receiveShadow = true; group.add(stair);
        for (const edge of [aisleLeft + .05, aisleRight - .05]) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(.035, .024, depth - .06), emissive);
          strip.position.set(edge, y + .026, z + depth / 2); strip.userData.accent = true; group.add(strip);
        }
        leftEdge = aisleRight;
      }
      const finalWidth = room.width / 2 - leftEdge;
      if (finalWidth > .1) addPlatform(leftEdge + finalWidth / 2, finalWidth, y, z, depth);
    } else addPlatform(0, room.width, y, z, depth);
    if (i > 0 && y > 0) {
      const rise = y - (rows[i - 1].y || 0);
      if (grand) {
        let leftEdge = -room.width / 2;
        for (const [aisleLeft, aisleRight] of stairCenters.map((center) => [center - stairWidth / 2, center + stairWidth / 2]).sort((a, b) => a[0] - b[0])) {
          const width = aisleLeft - leftEdge;
          if (width > .1) { const riser = new THREE.Mesh(new THREE.BoxGeometry(width, rise, .035), dark); riser.position.set(leftEdge + width / 2, (y + (rows[i - 1].y || 0)) / 2, z); group.add(riser); }
          const face = new THREE.Mesh(new THREE.BoxGeometry(aisleRight - aisleLeft - .1, rise, .04), dark);
          face.position.set((aisleLeft + aisleRight) / 2, (y + (rows[i - 1].y || 0)) / 2, z); group.add(face);
          const edge = new THREE.Mesh(new THREE.BoxGeometry(aisleRight - aisleLeft - .12, .025, .05), emissive);
          edge.position.set((aisleLeft + aisleRight) / 2, y - .04, z - .025); edge.userData.accent = true; group.add(edge);
          leftEdge = aisleRight;
        }
        const width = room.width / 2 - leftEdge;
        if (width > .1) { const riser = new THREE.Mesh(new THREE.BoxGeometry(width, rise, .035), dark); riser.position.set(leftEdge + width / 2, (y + (rows[i - 1].y || 0)) / 2, z); group.add(riser); }
      } else {
        const riser = new THREE.Mesh(new THREE.BoxGeometry(room.width, rise, .035), dark);
        riser.position.set(0, (y + (rows[i - 1].y || 0)) / 2, z); group.add(riser);
      }
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
  if (grand) {
    addCrimsonCeiling(group, room, theme);
    addWayfindingArrows(group, room);
  }
  return { scene: group, seatAnchors: anchors, cameras: {}, layout: roomLayout, dispose() {
    group.traverse((obj) => { obj.geometry?.dispose(); if (obj.material && !Array.isArray(obj.material)) obj.material.dispose(); });
    carpetMap?.dispose();
    group.removeFromParent();
  } };

  function addPlatform(x, width, y, z, depth) {
    const platform = new THREE.Mesh(new THREE.BoxGeometry(width, .12, depth), carpet);
    platform.position.set(x, y - .06, z + depth / 2); platform.receiveShadow = true; group.add(platform);
  }
}

export function createCarpetTexture(width, depth) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#777'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 3) for (let x = 0; x < 256; x += 3) {
    const value = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    ctx.fillStyle = value > .5 ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.12)';
    ctx.fillRect(x, y, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(width * 1.4, depth * 1.4);
  return texture;
}

function addCrimsonCeiling(group, room, theme) {
  const light = new THREE.MeshStandardMaterial({ color: theme.palette.light, emissive: theme.palette.light, emissiveIntensity: 1.6, roughness: .25, toneMapped: false });
  const amber = new THREE.MeshStandardMaterial({ color: theme.palette.amber, emissive: theme.palette.amber, emissiveIntensity: 1.3, roughness: .3, toneMapped: false });
  const trim = (width, height, depth, x, y, z, material = light) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z); mesh.userData.accent = true; group.add(mesh);
  };
  const y = room.height - .14;
  trim(.045, .045, room.depth - 1, -room.width * .46, y, room.depth / 2);
  trim(.045, .045, room.depth - 1, room.width * .46, y, room.depth / 2);
  for (let z = 1.3; z < room.depth - 1; z += 2.6) {
    trim(room.width * .92, .055, .07, 0, y, z, z % 5.2 < 2.6 ? light : amber);
    for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight(0xffe8cf, 12, 9, Math.PI / 5, .72, 1.8);
      spot.position.set(side * room.width * .36, room.height - .28, z);
      spot.target.position.set(side * room.width * .25, .25, z + .4);
      spot.userData.accent = true; spot.target.userData.accent = true;
      group.add(spot, spot.target);
    }
  }
  trim(room.width * .88, .12, .14, 0, room.height - .09, 1.1, amber);
}

function addWayfindingArrows(group, room) {
  const shape = new THREE.Shape();
  shape.moveTo(-.14, -.27); shape.lineTo(-.14, .02); shape.lineTo(-.28, .02);
  shape.lineTo(0, .42); shape.lineTo(.28, .02); shape.lineTo(.14, .02); shape.lineTo(.14, -.27); shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshStandardMaterial({ color: '#321522', roughness: .96, side: THREE.DoubleSide });
  for (let z = 1.35; z < 3.8; z += .85) for (let x = -room.width * .38; x <= room.width * .38; x += room.width * .19) {
    const arrow = new THREE.Mesh(geometry, material);
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(x, .012, z); group.add(arrow);
  }
}
