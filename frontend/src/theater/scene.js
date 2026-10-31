import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SCREEN, seatPosition } from './layout.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createTheaterRenderer } from '../designs/render/renderer.js';
import { buildRoom, createCarpetTexture } from '../designs/rooms/buildRoom.js';
import { ROOM_THEME_BY_KEY } from '../designs/registry.js';
import { createScreenTexture } from '../designs/fx/screenTexture.js';
import { applyFX, createOptionalDust, createOptionalHaze } from '../designs/fx/applyFX.js';

export function createTheater(container, options = {}) {
  const room = { width: 24, depth: 30, height: 12, ...options.room };
  const screenConfig = { ...SCREEN, ...options.screen };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070a);
  scene.fog = new THREE.Fog(0x07070a, 25, 60);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, Math.max(100, room.depth * 3));
  const requestedQuality = options.themeOptions?.quality;
  const quality = requestedQuality || ((devicePixelRatio > 2 || (navigator.hardwareConcurrency || 8) <= 4) ? 'low' : 'high');
  const renderer = createTheaterRenderer(quality);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environmentScene, 0.04).texture;
  environmentScene.dispose();
  scene.environmentIntensity = quality === 'medium' ? 0.125 : 0.25;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - .02;

  // --- room -------------------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x15151b, roughness: 0.98 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.01, room.depth / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const shellGeometries = [];

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.95 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x09090d, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, room.height, room.depth), wallMat);
    shellGeometries.push(wall.geometry);
    wall.position.set(side * (room.width / 2), room.height / 2, room.depth / 2);
    scene.add(wall);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(room.width, room.height, 0.3), wallMat);
  shellGeometries.push(back.geometry);
  back.position.set(0, room.height / 2, room.depth);
  scene.add(back);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(room.width, .3, room.depth), ceilingMat);
  ceiling.position.set(0, room.height, room.depth / 2); shellGeometries.push(ceiling.geometry); scene.add(ceiling);
  const front = new THREE.Mesh(new THREE.BoxGeometry(room.width, room.height, .3), wallMat);
  front.position.set(0, room.height / 2, -.15); shellGeometries.push(front.geometry); scene.add(front);

  // --- screen -----------------------------------------------------------
  const posterTexture = createScreenTexture();
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
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.HemisphereLight(0xd9d4cc, 0x19181a, 0.18));
  const key = quality === 'low'
    ? new THREE.SpotLight(0xc8d5ff, 3, room.depth * 1.3, Math.PI / 3, .6, 1)
    : new THREE.RectAreaLight(0xc8d5ff, 3, screenConfig.width, screenConfig.height);
  key.position.set(screenConfig.x || 0, screenConfig.y, screenConfig.z + 0.2);
  key.lookAt(0, screenConfig.y, room.depth); scene.add(key);
  const top = new THREE.DirectionalLight(0xffffff, 0.55);
  top.position.set(0, room.height, room.depth * 0.48);
  top.castShadow = true;
  top.shadow.mapSize.set(quality === 'medium' ? 1024 : 2048, quality === 'medium' ? 1024 : 2048);
  top.shadow.camera.left = -room.width; top.shadow.camera.right = room.width;
  top.shadow.camera.top = room.height; top.shadow.camera.bottom = -2;
  top.shadow.bias = -0.00015;
  scene.add(top);

  let themedRoom = null;
  let floorTexture = null;
  const optionalHaze = createOptionalHaze(room.width, room.depth);
  const optionalDust = createOptionalDust(room.width, room.depth);
  scene.add(optionalHaze, optionalDust);
  function applyTheme(themeKey = 'multiplex', themeOptions = {}, seats = []) {
    themedRoom?.dispose();
    const theme = ROOM_THEME_BY_KEY[themeKey] || ROOM_THEME_BY_KEY.multiplex;
    floorMat.color.set(theme.palette.carpet); wallMat.color.set(theme.palette.wall);
    ceilingMat.color.set(theme.palette.ceiling || theme.palette.wall);
    floorTexture?.dispose();
    floorTexture = theme.style === 'crimson-premiere' ? createCarpetTexture(room.width, room.depth) : null;
    floorMat.map = floorTexture;
    floorMat.needsUpdate = true;
    scene.environmentIntensity = (themeKey === 'immersive' ? 0.22 : 0.28) * (quality === 'medium' ? .5 : 1);
    if (themeOptions.shadows === false || quality === 'low') renderer.shadowMap.enabled = false;
    else renderer.shadowMap.enabled = true;
    themedRoom = buildRoom(scene, themeKey, room, { anchors: seats }, theme.defaultSeat, themeOptions.quality || 'high');
    applyFX(scene, themeOptions);
    return themedRoom;
  }
  applyTheme(options.theme || 'multiplex', options.themeOptions || {}, options.seats || []);

  // --- camera modes -----------------------------------------------------
  const orbitHome = { pos: new THREE.Vector3(room.width * .28, room.height * 0.72, room.depth * 0.78), target: new THREE.Vector3(0, room.height * 0.18, room.depth * 0.3) };
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
    camera.position.set(p.x, p.y + 1.12, p.z);     // eye height
    controls.target.set(screenConfig.x || 0, screenConfig.y, screenConfig.z);    // look at screen
    controls.minDistance = 0.01;
    camera.fov = 70; camera.updateProjectionMatrix();
    controls.update();
  }

  function fromScreenView() {
    controls.enabled = true;
    camera.position.set(0, 1.55, Math.max(1.5, room.depth * .08));
    controls.target.set(0, Math.min(room.height * .45, screenConfig.y), room.depth * .72);
    camera.fov = 64; camera.updateProjectionMatrix(); controls.update();
  }
  function aisleView() {
    controls.enabled = true;
    camera.position.set(room.width * .28, Math.max(2.2, room.height * .35), room.depth * .86);
    controls.target.set(0, room.height * .24, room.depth * .15);
    camera.fov = 58; camera.updateProjectionMatrix(); controls.update();
  }
  function fitView() { orbitView(); }
  function resetView() { orbitView(); }

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
    themedRoom?.dispose();
    removeEventListener('resize', resize);
    floor.geometry.dispose(); shellGeometries.forEach((geometry) => geometry.dispose()); floorTexture?.dispose(); floorMat.dispose(); wallMat.dispose(); ceilingMat.dispose();
    screen.geometry.dispose(); posterTexture.dispose(); screen.material.dispose();
    optionalHaze.geometry.dispose(); optionalHaze.material.dispose();
    optionalDust.geometry.dispose(); optionalDust.material.dispose();
    key.dispose(); top.dispose();
    renderer.dispose();
    pmrem.dispose();
    scene.environment?.dispose?.();
    renderer.domElement.remove();
  }

  return { scene, camera, renderer, controls, orbitView, seatView, fromScreenView, aisleView, fitView, resetView, applyTheme, dispose };
}
