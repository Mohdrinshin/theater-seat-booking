import * as THREE from 'three';

function instanced(scene, geometry, material, positions, scale = [1, 1, 1]) {
  if (!positions.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  const temp = new THREE.Object3D();
  positions.forEach((p, i) => { temp.position.set(p[0], p[1], p[2]); temp.scale.set(...scale); temp.updateMatrix(); mesh.setMatrixAt(i, temp.matrix); });
  mesh.receiveShadow = mesh.castShadow = true; scene.add(mesh);
}

export function addWallStyle(scene, room, theme) {
  const positions = [], size = room.depth;
  const wall = new THREE.MeshStandardMaterial({ color: theme.palette.feature, roughness: .92 });
  const style = theme.style;
  if (style === 'panels' || style === 'walnut' || style === 'wainscot' || style === 'battens' || style === 'flutes') {
    const step = style === 'battens' ? .1 : style === 'flutes' ? .26 : style === 'panels' ? 1.35 : .92;
    for (const side of [-1, 1]) for (let z = .5; z < size - .5; z += step) positions.push([side * (room.width / 2 - .035), style === 'wainscot' ? .5 : 2.05, z]);
    const geo = style === 'battens' || style === 'flutes' ? new THREE.BoxGeometry(.05, style === 'flutes' ? room.height : 3, .05) : new THREE.BoxGeometry(.06, 1.5, style === 'walnut' ? .88 : 1.3);
    instanced(scene, geo, wall, positions);
  }
  if (style === 'hpanels') {
    const panels = [];
    for (const side of [-1, 1]) for (let y = 1; y < room.height - 1; y += .95) for (let z = 1; z < size - 1; z += 2.4) panels.push([side * (room.width / 2 - .04), y, z]);
    instanced(scene, new THREE.BoxGeometry(.05, .86, 2.25), wall, panels);
    const speakers = [];
    for (const side of [-1, 1]) for (let z = 2; z < size - 1; z += 3.2) speakers.push([side * (room.width / 2 - .16), 3.2, z]);
    instanced(scene, new THREE.BoxGeometry(.22, .42, .35), new THREE.MeshStandardMaterial({ color: '#070708', roughness: .5 }), speakers);
  }
}
