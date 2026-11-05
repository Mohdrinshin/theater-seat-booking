import * as THREE from 'three';
import { createTextures } from './textures.js';
import { THEATER_LIGHTING } from '../lighting.js';

let shared;
export function getMaterialLibrary() {
  if (shared) return shared;
  const maps = createTextures();
  const seatEmissive = new THREE.Color(THEATER_LIGHTING.seats.emissiveColor);
  shared = {
    leather: new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: seatEmissive, emissiveIntensity: THEATER_LIGHTING.seats.emissiveIntensity, roughness: 0.5, sheen: 0.25, sheenRoughness: 0.5, clearcoat: 0.08, normalMap: maps.grain, normalScale: new THREE.Vector2(.45, .45) }),
    fabric: new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: seatEmissive, emissiveIntensity: THEATER_LIGHTING.seats.emissiveIntensity, roughness: .95, sheen: 1, sheenRoughness: .45, normalMap: maps.weave, normalScale: new THREE.Vector2(.7, .7) }),
    thread: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .8 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .45 }),
    shell: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .35, clearcoat: .6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: .32 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .55 }),
    led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: THEATER_LIGHTING.accents.ledEmissiveColor, emissiveIntensity: THEATER_LIGHTING.accents.stepEmissive, roughness: .5 }),
    recess: new THREE.MeshStandardMaterial({ color: 0x111113, roughness: .9 }),
  };
  return shared;
}

export function finishColor(slot, finish = {}) {
  const upholstery = finish.uph || finish.cushion || '#5c1520';
  if (slot === 'thread') return new THREE.Color(upholstery).lerp(new THREE.Color('#e8e0d0'), .35);
  if (slot === 'upholstery' || slot === 'leather' || slot === 'fabric') return new THREE.Color(upholstery);
  if (slot === 'frame' || slot === 'shell') return new THREE.Color(finish.frame || '#1b1b1d');
  if (slot === 'metal') return new THREE.Color(finish.metal?.startsWith?.('#') ? finish.metal : (({ steel: '#c9cbce', chrome: '#3a3b40', brass: '#c7a36b' })[finish.metal] || '#c9cbce'));
  if (slot === 'plastic') return new THREE.Color('#1c1c1e');
  if (slot === 'recess') return new THREE.Color('#111113');
  if (slot === 'led') return new THREE.Color(finish.accentColor || '#ffb35a');
  if (slot === 'wood') return new THREE.Color(finish.wood || '#5b3a24');
  if (slot === 'led') return new THREE.Color(finish.accentColor || '#ffb35a');
  return new THREE.Color(0xffffff);
}
