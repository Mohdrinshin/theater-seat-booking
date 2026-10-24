import * as THREE from 'three';

export function applyFX(scene, settings = {}) {
  scene.traverse((object) => {
    if (object.userData.accent) object.visible = settings.accent !== false;
    if (object.userData.fx === 'haze') object.visible = Boolean(settings.haze);
    if (object.userData.fx === 'dust') object.visible = Boolean(settings.dust);
  });
}

export function createOptionalHaze(width, depth) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width * .8, depth * .7), new THREE.MeshStandardMaterial({
    color: '#b9c3d2', transparent: true, opacity: .035, roughness: 1, depthWrite: false,
  }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, .04, depth * .18); mesh.userData.fx = 'haze'; mesh.visible = false;
  return mesh;
}

export function createOptionalDust(width, depth) {
  const positions = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i += 1) {
    positions[i * 3] = ((i * 7919) % 1000) / 1000 * width - width / 2;
    positions[i * 3 + 1] = .4 + ((i * 3571) % 500) / 500 * 2;
    positions[i * 3 + 2] = ((i * 2377) % 1000) / 1000 * depth;
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#eadbb6', size: .012, transparent: true, opacity: .18 }));
  points.userData.fx = 'dust'; points.visible = false;
  return points;
}
