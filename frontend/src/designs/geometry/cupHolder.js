import * as THREE from 'three';
import { getMaterialLibrary } from '../materials/library.js';

export function cupHolder(group, x, y, z) {
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.006, 8, 24), getMaterialLibrary().metal);
  lip.rotation.x = Math.PI / 2;
  lip.position.set(x, y, z);
  lip.userData.mat = 'metal';
  group.add(lip);
  const recess = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.038, 0.006, 24), getMaterialLibrary().recess);
  recess.position.set(x, y - 0.004, z);
  recess.userData.mat = 'recess';
  group.add(recess);
}
