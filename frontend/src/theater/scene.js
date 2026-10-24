import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SCREEN, seatPosition } from './layout.js';

export function createTheater(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070a);
  scene.fog = new THREE.Fog(0x07070a, 25, 60);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // --- room -------------------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x15151b, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.01, 12);
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 1 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 12, 30), wallMat);
    wall.position.set(side * 12, 6, 12);
    scene.add(wall);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 0.3), wallMat);
  back.position.set(0, 6, 27);
  scene.add(back);

  // --- screen -----------------------------------------------------------
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN.width, SCREEN.height),
    new THREE.MeshBasicMaterial({ color: 0xdfe9ff })   // TODO: swap for a VideoTexture/poster
  );
  screen.position.set(0, SCREEN.y, SCREEN.z);
  scene.add(screen);

  // --- lights -----------------------------------------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.PointLight(0xaaccff, 40, 40);      // screen glow
  key.position.set(0, SCREEN.y, 2);
  scene.add(key);
  const top = new THREE.DirectionalLight(0xffffff, 0.6);
  top.position.set(0, 12, 14);
  top.castShadow = true;
  scene.add(top);

  // --- camera modes -----------------------------------------------------
  const orbitHome = { pos: new THREE.Vector3(0, 9, 22), target: new THREE.Vector3(0, 2, 8) };
  function orbitView() {
    controls.enabled = true;
    controls.minDistance = 3;
    controls.maxDistance = 40;
    camera.position.copy(orbitHome.pos);
    controls.target.copy(orbitHome.target);
    camera.fov = 55; camera.updateProjectionMatrix();
    controls.update();
  }
  function seatView(row, number) {
    const p = seatPosition(row, number);
    camera.position.set(p.x, p.y + 1.25, p.z);     // eye height
    controls.target.set(0, SCREEN.y, SCREEN.z);    // look at screen
    controls.minDistance = 0.01;
    camera.fov = 70; camera.updateProjectionMatrix();
    controls.update();
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();
  orbitView();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return { scene, camera, renderer, controls, orbitView, seatView };
}
