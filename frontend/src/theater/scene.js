import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SCREEN, seatPosition } from './layout.js';

export function createTheater(container, options = {}) {
  const room = { width: 24, depth: 30, height: 12, ...options.room };
  const screenConfig = { ...SCREEN, ...options.screen };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070a);
  scene.fog = new THREE.Fog(0x07070a, 25, 60);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, Math.max(100, room.depth * 3));
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // --- room -------------------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x15151b, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.01, room.depth / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 1 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, room.height, room.depth), wallMat);
    wall.position.set(side * (room.width / 2), room.height / 2, room.depth / 2);
    scene.add(wall);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(room.width, room.height, 0.3), wallMat);
  back.position.set(0, room.height / 2, room.depth);
  scene.add(back);

  // --- screen -----------------------------------------------------------
  const posterCanvas = document.createElement('canvas');
  posterCanvas.width = 1024;
  posterCanvas.height = 448;
  const ctx = posterCanvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 1024, 448);
  gradient.addColorStop(0, '#11121b');
  gradient.addColorStop(0.55, '#25202b');
  gradient.addColorStop(1, '#090a10');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 448);
  ctx.fillStyle = 'rgba(198, 40, 54, 0.24)';
  ctx.beginPath(); ctx.arc(770, 245, 250, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b9a77b';
  ctx.font = '600 25px system-ui, sans-serif';
  ctx.fillText('NOW SHOWING', 70, 150);
  ctx.fillStyle = '#f2e8d0';
  ctx.font = '700 52px system-ui, sans-serif';
  ctx.fillText('YOUR MOVIE', 70, 220);
  ctx.fillStyle = 'rgba(242, 232, 208, 0.65)';
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('The show will begin shortly', 70, 270);
  const posterTexture = new THREE.CanvasTexture(posterCanvas);
  const curveRadians = (screenConfig.curve || 0) * Math.PI / 180;
  const screenGeometry = curveRadians > 0.02
    ? new THREE.CylinderGeometry(
      screenConfig.width / curveRadians, screenConfig.width / curveRadians, screenConfig.height,
      64, 1, true, -curveRadians / 2, curveRadians,
    )
    : new THREE.PlaneGeometry(screenConfig.width, screenConfig.height);
  const screen = new THREE.Mesh(
    screenGeometry,
    new THREE.MeshBasicMaterial({ map: posterTexture, color: 0x45434a, toneMapped: false })
  );
  screen.position.set(screenConfig.x || 0, screenConfig.y, curveRadians > 0.02 ? screenConfig.z - screenConfig.width / curveRadians : screenConfig.z);
  scene.add(screen);

  // --- lights -----------------------------------------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.PointLight(0xaaccff, 40, 40);      // screen glow
  key.position.set(screenConfig.x || 0, screenConfig.y, screenConfig.z + 2);
  scene.add(key);
  const top = new THREE.DirectionalLight(0xffffff, 0.6);
  top.position.set(0, room.height, room.depth * 0.48);
  top.castShadow = true;
  scene.add(top);

  // --- camera modes -----------------------------------------------------
  const orbitHome = { pos: new THREE.Vector3(0, room.height * 0.72, room.depth * 0.78), target: new THREE.Vector3(0, room.height * 0.18, room.depth * 0.3) };
  function orbitView() {
    controls.enabled = true;
    controls.minDistance = 3;
    controls.maxDistance = Math.max(40, room.depth * 1.5);
    camera.position.copy(orbitHome.pos);
    controls.target.copy(orbitHome.target);
    camera.fov = 55; camera.updateProjectionMatrix();
    controls.update();
  }
  function seatView(seatOrRow, number) {
    const p = typeof seatOrRow === 'object'
      ? (Number.isFinite(seatOrRow.x) && Number.isFinite(seatOrRow.z) ? seatOrRow : seatPosition(seatOrRow.row, seatOrRow.number))
      : seatPosition(seatOrRow, number);
    camera.position.set(p.x, p.y + 1.25, p.z);     // eye height
    controls.target.set(screenConfig.x || 0, screenConfig.y, screenConfig.z);    // look at screen
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

  function dispose() {
    renderer.setAnimationLoop(null);
    controls.dispose();
    removeEventListener('resize', resize);
    scene.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => { material.map?.dispose(); material.dispose(); });
      else if (object.material) { object.material.map?.dispose(); object.material.dispose(); }
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { scene, camera, renderer, controls, orbitView, seatView, dispose };
}
