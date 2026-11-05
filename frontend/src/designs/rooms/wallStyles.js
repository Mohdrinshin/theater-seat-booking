import * as THREE from 'three';
import { THEATER_LIGHTING } from '../lighting.js';

function instanced(scene, geometry, material, positions, scale = [1, 1, 1]) {
  if (!positions.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  const temp = new THREE.Object3D();
  positions.forEach((p, i) => { temp.position.set(p[0], p[1], p[2]); temp.scale.set(...scale); temp.updateMatrix(); mesh.setMatrixAt(i, temp.matrix); });
  mesh.receiveShadow = mesh.castShadow = true; scene.add(mesh);
}

export function addWallStyle(scene, room, theme, pbr = null, ownedTextures = []) {
  const positions = [], size = room.depth;
  const wallMaps = {};
  for (const [key, source] of Object.entries(pbr?.wall_fabric || {})) {
    const texture = source.clone(); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1, 1); texture.needsUpdate = true;
    wallMaps[key] = texture; ownedTextures.push(texture);
  }
  const wall = new THREE.MeshPhysicalMaterial({
    color: theme.palette.wall, roughness: .92, sheen: .35, sheenRoughness: .8,
    ...(wallMaps.albedo ? { map: wallMaps.albedo } : {}),
    ...(wallMaps.normal ? { normalMap: wallMaps.normal } : {}),
    ...(wallMaps.roughness ? { roughnessMap: wallMaps.roughness } : {}),
    ...(wallMaps.metalness ? { metalnessMap: wallMaps.metalness } : {}),
  });
  const style = theme.style;
  if (style === 'crimson-premiere') {
    for (const side of [-1, 1]) {
      const panelPositions = [];
      for (let z = 1; z < size - 1; z += 1.65) panelPositions.push([side * (room.width / 2 - .06), room.height * .52, z]);
      instanced(scene, new THREE.BoxGeometry(.08, room.height * .92, 1.48), wall, panelPositions);

      const trim = new THREE.MeshStandardMaterial({ color: '#f4e8db', emissive: theme.palette.light, emissiveIntensity: THEATER_LIGHTING.accents.wallLineEmissive, roughness: .35, toneMapped: false });
      const lamp = new THREE.MeshStandardMaterial({ color: theme.palette.amber, emissive: theme.palette.amber, emissiveIntensity: THEATER_LIGHTING.accents.wallMarkerEmissive, roughness: .3, toneMapped: false });
      const railX = side * (room.width / 2 - .15);
      const span = 3.4;
      for (let z = 1.2; z < size - 1; z += span) {
        const y0 = .5, y1 = room.height - .55;
        for (const lean of [-1, 1]) {
          const z1 = Math.min(size - .35, z + span * .88);
          const start = new THREE.Vector3(railX, y0, lean < 0 ? z : z + .45);
          const end = new THREE.Vector3(railX, y1, lean < 0 ? z1 : z1 - .45);
          const delta = end.clone().sub(start);
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, delta.length(), 8), trim);
          bar.position.copy(start).add(end).multiplyScalar(.5);
          bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
          bar.userData.accent = true; scene.add(bar);
        }
        const sconceConfig = THEATER_LIGHTING.accents.wallSconce;
        const sconce = new THREE.PointLight(theme.palette.light, sconceConfig.intensity, sconceConfig.distance, sconceConfig.decay);
        sconce.position.set(railX - side * .45, room.height * .62, z + span * .45);
        sconce.userData.accent = true; scene.add(sconce);
        const marker = new THREE.Mesh(new THREE.BoxGeometry(.07, .22, .09), lamp);
        marker.position.set(railX - side * .4, .24, z + span * .45);
        marker.userData.accent = true; scene.add(marker);
      }
    }
    const backAccent = new THREE.Mesh(new THREE.BoxGeometry(room.width * .68, .045, .045),
      new THREE.MeshStandardMaterial({ color: theme.palette.light, emissive: theme.palette.light, emissiveIntensity: THEATER_LIGHTING.accents.exitAccentEmissive, toneMapped: false }));
    backAccent.position.set(0, room.height * .68, room.depth - .18); backAccent.userData.accent = true; scene.add(backAccent);
    return;
  }
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
