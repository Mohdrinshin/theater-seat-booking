import * as THREE from 'three';

export function weld(width, depth, radius = 0.006, y = 0) {
  const points = [];
  for (let i = 0; i <= 80; i += 1) {
    const a = (i / 80) * Math.PI * 2;
    const superellipse = (n) => Math.sign(n) * Math.pow(Math.abs(n), 0.55);
    points.push(new THREE.Vector3(superellipse(Math.cos(a)) * width / 2, y, superellipse(Math.sin(a)) * depth / 2));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, radius, 6, true);
}
