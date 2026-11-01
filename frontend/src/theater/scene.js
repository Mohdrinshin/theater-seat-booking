import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SCREEN, seatPosition } from './layout.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createTheaterRenderer } from '../designs/render/renderer.js';
import { buildRoom, createCarpetTexture } from '../designs/rooms/buildRoom.js';
import { ROOM_THEME_BY_KEY } from '../designs/registry.js';
import { getMaterialLibrary } from '../designs/materials/library.js';
import { createScreenTexture } from '../designs/fx/screenTexture.js';
import { applyFX, createOptionalDust } from '../designs/fx/applyFX.js';

const FINISH_SHADER = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv; float rand(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);} void main(){float d=distance(vUv,vec2(.5));float vig=smoothstep(.86,.24,d);float aberration=smoothstep(.3,.82,d)*.0007;vec2 shift=(vUv-.5)*aberration;vec4 c=texture2D(tDiffuse,vUv);c.r=texture2D(tDiffuse,vUv+shift).r;c.b=texture2D(tDiffuse,vUv-shift).b;c.rgb*=mix(.84,1.0,vig);c.rgb+=(rand(vUv*vec2(950.,650.)+time)-.5)*.005;gl_FragColor=c;}'
};

const PBR_SETS = {
  leather_red: ['albedo', 'normal', 'roughness'], leather_grey: ['albedo', 'normal', 'roughness'],
  carpet_red: ['albedo', 'normal', 'roughness'], wall_fabric: ['albedo', 'normal', 'roughness'],
  ceiling_black: ['albedo', 'normal', 'roughness'], metal_brushed: ['albedo', 'normal', 'roughness', 'metalness'],
  velvet_curtain: ['albedo', 'normal', 'roughness'],
};
let sharedPBRPromise;
let sharedSeatPBRReady = false;
function loadPBRTextures(anisotropy) {
  if (!sharedPBRPromise) {
    const loader = new THREE.TextureLoader();
    sharedPBRPromise = Promise.all(Object.entries(PBR_SETS).map(async ([set, kinds]) => {
      const maps = {};
      await Promise.all(kinds.map(async (kind) => {
        const path = `/assets/textures/${set}_${kind}.jpg`;
        try {
          const texture = await loader.loadAsync(path);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = anisotropy;
          texture.colorSpace = kind === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          maps[kind] = texture;
        } catch { console.error(`Could not load PBR texture asset: ${path}`); }
      }));
      return [set, maps];
    })).then(Object.fromEntries);
  }
  return sharedPBRPromise;
}

function applySeatPBR(textures, anisotropy) {
  if (sharedSeatPBRReady) return;
  const library = getMaterialLibrary();
  const bind = (material, source, repeat = 2.4) => {
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) material[key]?.dispose?.();
    const clone = (texture) => {
      if (!texture) return null;
      const map = texture.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeat, repeat); map.anisotropy = anisotropy; map.needsUpdate = true; return map;
    };
    material.map = clone(source.albedo); material.normalMap = clone(source.normal);
    material.roughnessMap = clone(source.roughness); material.metalnessMap = clone(source.metalness);
    material.needsUpdate = true;
  };
  bind(library.leather, textures.leather_grey);
  library.leather.roughness = .48; library.leather.clearcoat = .24; library.leather.clearcoatRoughness = .42; library.leather.envMapIntensity = .4;
  bind(library.fabric, textures.wall_fabric);
  library.fabric.roughness = .9; library.fabric.sheen = .55; library.fabric.sheenRoughness = .55; library.fabric.envMapIntensity = .35;
  bind(library.metal, textures.metal_brushed, 1.4);
  library.metal.roughness = .34; library.metal.metalness = .86; library.metal.envMapIntensity = .5;
  sharedSeatPBRReady = true;
}

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
  scene.environmentIntensity = quality === 'low' ? 0.18 : 0.22;
  let disposed = false;
  let environmentTexture = null;
  new RGBELoader().loadAsync('/assets/hdri/cinema_dark.hdr').then((hdr) => {
    if (disposed) { hdr.dispose(); return; }
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    environmentTexture = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = environmentTexture;
    hdr.dispose();
  }).catch(() => console.error('Could not load PBR environment asset: /assets/hdri/cinema_dark.hdr'));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - .02;

  // --- room -------------------------------------------------------------
  const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x15151b, roughness: 0.98, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.01, room.depth / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const shellGeometries = [];

  const wallMat = new THREE.MeshPhysicalMaterial({ color: 0x1c1c24, roughness: 0.95, sheen: .35, sheenRoughness: .8 });
  const ceilingMat = new THREE.MeshPhysicalMaterial({ color: 0x151316, roughness: .95 });
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
  posterTexture.minFilter = THREE.LinearMipmapLinearFilter;
  posterTexture.magFilter = THREE.LinearFilter;
  posterTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  posterTexture.generateMipmaps = true;
  posterTexture.needsUpdate = true;
  const screenVideo = document.createElement('video');
  screenVideo.src = '/assets/video/screen_loop.mp4';
  screenVideo.crossOrigin = 'anonymous';
  screenVideo.loop = true;
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  screenVideo.preload = 'auto';
  const screenVideoTexture = new THREE.VideoTexture(screenVideo);
  screenVideoTexture.colorSpace = THREE.SRGBColorSpace;
  screenVideoTexture.minFilter = THREE.LinearFilter;
  screenVideoTexture.magFilter = THREE.LinearFilter;
  screenVideoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const fitScreenVideo = () => {
    const screenAspect = screenConfig.width / screenConfig.height;
    const videoAspect = screenVideo.videoWidth && screenVideo.videoHeight
      ? screenVideo.videoWidth / screenVideo.videoHeight
      : 16 / 9;
    if (screenAspect > videoAspect) {
      const visibleHeight = videoAspect / screenAspect;
      screenVideoTexture.repeat.set(1, visibleHeight);
      screenVideoTexture.offset.set(0, (1 - visibleHeight) / 2);
    } else {
      const visibleWidth = screenAspect / videoAspect;
      screenVideoTexture.repeat.set(visibleWidth, 1);
      screenVideoTexture.offset.set((1 - visibleWidth) / 2, 0);
    }
    screenVideoTexture.needsUpdate = true;
  };
  screenVideo.addEventListener('loadedmetadata', fitScreenVideo);
  screenVideo.addEventListener('error', () => console.error('Could not load screen video asset: /assets/video/screen_loop.mp4'));
  const curveRadians = (screenConfig.curve || 0) * Math.PI / 180;
  const screenGeometry = curveRadians > 0.02
    ? new THREE.CylinderGeometry(
      screenConfig.width / curveRadians, screenConfig.width / curveRadians, screenConfig.height,
      64, 1, true, -curveRadians / 2, curveRadians,
    )
    : new THREE.PlaneGeometry(screenConfig.width, screenConfig.height);
  const screen = new THREE.Mesh(
    screenGeometry,
    new THREE.MeshBasicMaterial({ map: posterTexture, color: 0xffffff, toneMapped: false })
  );
  screen.position.set(screenConfig.x || 0, screenConfig.y, curveRadians > 0.02 ? screenConfig.z - screenConfig.width / curveRadians : screenConfig.z);
  scene.add(screen);
  const showScreenVideo = () => {
    screen.material.map = screenVideoTexture;
    screen.material.needsUpdate = true;
  };
  screenVideo.addEventListener('playing', showScreenVideo);
  const startScreenVideo = () => screenVideo.play().catch(() => {});
  renderer.domElement.addEventListener('pointerdown', startScreenVideo, { once: true });
  startScreenVideo();

  // --- lights -----------------------------------------------------------
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.AmbientLight(0xb47c73, quality === 'low' ? 0.2 : 0.28));
  scene.add(new THREE.HemisphereLight(0x9b7784, 0x26110f, quality === 'low' ? 0.28 : 0.4));
  const screenBounce = new THREE.RectAreaLight(0x87628c, 4.5, screenConfig.width * .8, screenConfig.height * .8);
  screenBounce.position.set(screenConfig.x || 0, screenConfig.y, screenConfig.z + 0.24);
  screenBounce.lookAt(0, Math.max(.5, screenConfig.y * .55), room.depth * .45);
  scene.add(screenBounce);
  const screenFill = new THREE.PointLight(0xffc1a1, quality === 'low' ? 8 : 14.5, room.depth * .8, 2);
  screenFill.position.set(screenConfig.x || 0, screenConfig.y * .85, screenConfig.z + 2.8);
  scene.add(screenFill);
  const screenLowerFill = new THREE.PointLight(0xf06a60, 2.5, room.depth * .47, 2);
  screenLowerFill.position.set(screenConfig.x || 0, 2.8, screenConfig.z + 6.5);
  scene.add(screenLowerFill);
  const key = quality === 'low'
    ? new THREE.SpotLight(0xffc5a5, 1.2, room.depth * 1.3, Math.PI / 3, .8, 1.2)
    : new THREE.RectAreaLight(0xffc5a5, 1.2, screenConfig.width, screenConfig.height);
  key.position.set(screenConfig.x || 0, screenConfig.y, screenConfig.z + 0.2);
  if (key.isSpotLight) {
    key.target.position.set(0, Math.max(.5, screenConfig.y * .55), room.depth * .35);
    scene.add(key, key.target);
  } else {
    key.lookAt(0, screenConfig.y, room.depth); scene.add(key);
  }
  const top = new THREE.DirectionalLight(0xffe5d1, 0.04);
  top.position.set(0, room.height, room.depth * 0.48);
  top.castShadow = true;
  top.shadow.mapSize.set(quality === 'medium' ? 1024 : 2048, quality === 'medium' ? 1024 : 2048);
  top.shadow.camera.left = -room.width; top.shadow.camera.right = room.width;
  top.shadow.camera.top = room.height; top.shadow.camera.bottom = -2;
  top.shadow.bias = -0.00015;
  scene.add(top);

  const washGroup = new THREE.Group(); washGroup.name = 'cinema wall wash lighting'; scene.add(washGroup);
  const washSpots = [];
  if (quality !== 'low') {
    for (const z of [room.depth * .24, room.depth * .57, room.depth * .82]) for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight(0xffc68c, 26, room.depth * .72, Math.PI / 6, .88, 1.25);
      spot.position.set(side * room.width * .36, room.height - .35, z);
      spot.target.position.set(side * room.width * .28, .45, z + room.depth * .08);
      spot.castShadow = quality === 'high';
      spot.shadow.mapSize.set(quality === 'high' ? 768 : 384, quality === 'high' ? 768 : 384);
      spot.shadow.bias = -0.0002;
      washGroup.add(spot, spot.target); washSpots.push(spot);
    }
  }
  const bounceGroup = new THREE.Group(); bounceGroup.name = 'soft crimson bounce lights'; scene.add(bounceGroup);
  for (const side of [-1, 1]) for (const z of [room.depth * .25, room.depth * .72]) {
    const bounce = new THREE.PointLight(0x9b4146, 1.05, room.width * .55, 2);
    bounce.position.set(side * room.width * .43, 1.5, z); bounceGroup.add(bounce);
  }
  const wallWashGroup = new THREE.Group(); wallWashGroup.name = 'warm wall wash lights'; scene.add(wallWashGroup);
  for (const side of [-1, 1]) for (const z of [room.depth * .2, room.depth * .5, room.depth * .8]) {
    const wash = new THREE.PointLight(0xffb18a, .9, room.width * .48, 2);
    wash.position.set(side * room.width * .42, room.height * .36, z);
    wallWashGroup.add(wash);
  }
  const floorPoolGroup = new THREE.Group(); floorPoolGroup.name = 'low amber floor light pools'; scene.add(floorPoolGroup);
  for (const z of [room.depth * .16, room.depth * .36, room.depth * .56, room.depth * .76, room.depth * .92]) {
    const pool = new THREE.PointLight(0xffa35c, .55, 5.8, 2);
    pool.position.set(0, .28, z);
    floorPoolGroup.add(pool);
  }
  const aisleGlowGroup = new THREE.Group(); aisleGlowGroup.name = 'amber aisle bounce lights'; scene.add(aisleGlowGroup);
  for (const z of [room.depth * .28, room.depth * .47, room.depth * .66, room.depth * .83]) {
    const glow = new THREE.PointLight(0xff9b47, .5, 4.2, 2); glow.position.set(0, .55, z); aisleGlowGroup.add(glow);
  }

  let themedRoom = null;
  let floorTexture = null;
  let pbrTextures = null;
  let currentThemeKey = options.theme || 'multiplex';
  let currentThemeOptions = options.themeOptions || {};
  let currentSeats = options.seats || [];
  const shellTextures = [];
  const assignMaps = (material, set, repeatX, repeatY, destination = shellTextures) => {
    const maps = {};
    for (const [key, source] of Object.entries(set || {})) {
      const map = source.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeatX, repeatY); map.needsUpdate = true; maps[key] = map; destination.push(map);
    }
    material.map = maps.albedo || null; material.normalMap = maps.normal || null;
    material.roughnessMap = maps.roughness || null; material.metalnessMap = maps.metalness || null;
    material.needsUpdate = true;
  };
  const projectorBeamGeometry = new THREE.CylinderGeometry(room.width * .24, .06, room.depth * .94, 28, 1, true);
  const projectorBeamMaterial = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xf4d3ae) }, strength: { value: .014 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 color; uniform float strength; varying vec2 vUv; void main(){float edge=1.0-smoothstep(.08,.98,abs(vUv.x-.5)*2.0);float ends=smoothstep(0.0,.14,vUv.y)*(1.0-smoothstep(.78,1.0,vUv.y));float alpha=edge*ends*strength;gl_FragColor=vec4(color,alpha);}',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  const projectorBeam = new THREE.Mesh(projectorBeamGeometry, projectorBeamMaterial);
  const beamStart = new THREE.Vector3(0, room.height * .76, room.depth - .35);
  const beamEnd = new THREE.Vector3(screenConfig.x || 0, screenConfig.y, screenConfig.z);
  projectorBeam.position.copy(beamStart).add(beamEnd).multiplyScalar(.5);
  projectorBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamEnd.clone().sub(beamStart).normalize());
  projectorBeam.userData.fx = 'haze'; projectorBeam.visible = false;
  const optionalDust = createOptionalDust(room.width, room.depth);
  scene.add(projectorBeam, optionalDust);
  function applyTheme(themeKey = 'multiplex', themeOptions = {}, seats = []) {
    currentThemeKey = themeKey; currentThemeOptions = themeOptions; currentSeats = seats;
    themedRoom?.dispose();
    const theme = ROOM_THEME_BY_KEY[themeKey] || ROOM_THEME_BY_KEY.multiplex;
    shellTextures.splice(0).forEach((texture) => texture.dispose());
    floorMat.color.set(theme.palette.carpet); wallMat.color.set(theme.palette.wall);
    ceilingMat.color.set(theme.palette.ceiling || theme.palette.wall);
    floorTexture?.dispose();
    floorTexture = !pbrTextures && theme.style === 'crimson-premiere' ? createCarpetTexture(room.width, room.depth) : null;
    floorMat.map = floorTexture;
    if (pbrTextures) {
      assignMaps(floorMat, pbrTextures.carpet_red, room.width / 1.5, room.depth / 1.5);
      assignMaps(wallMat, pbrTextures.wall_fabric, room.depth / 1.5, room.height / 1.5);
      assignMaps(ceilingMat, pbrTextures.ceiling_black, room.width / 2.2, room.depth / 2.2);
    }
    floorMat.needsUpdate = true;
    washGroup.visible = theme.style !== 'crimson-premiere';
    bounceGroup.visible = theme.style === 'crimson-premiere' || theme.style === 'immersive';
    wallWashGroup.visible = true;
    floorPoolGroup.visible = true;
    aisleGlowGroup.visible = theme.style === 'crimson-premiere';
    scene.environmentIntensity = (quality === 'low' ? 0.18 : 0.22) * (quality === 'medium' ? .9 : 1);
    if (themeOptions.shadows === false || quality === 'low') renderer.shadowMap.enabled = false;
    else renderer.shadowMap.enabled = true;
    themedRoom = buildRoom(scene, themeKey, room, { anchors: seats }, theme.defaultSeat, themeOptions.quality || quality, pbrTextures);
    applyFX(scene, themeOptions);
    return themedRoom;
  }
  applyTheme(options.theme || 'multiplex', options.themeOptions || {}, options.seats || []);

  loadPBRTextures(renderer.capabilities.getMaxAnisotropy()).then((loaded) => {
    if (disposed) return;
    pbrTextures = loaded;
    applySeatPBR(pbrTextures, renderer.capabilities.getMaxAnisotropy());
    applyTheme(currentThemeKey, currentThemeOptions, currentSeats);
  });

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

  let composer = null;
  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer?.setSize(w, h);
  }
  addEventListener('resize', resize);
  resize();
  orbitView();

  if (quality !== 'low') {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      if (quality === 'high') composer.addPass(new BokehPass(scene, camera, { focus: 15, aperture: .000012, maxblur: .0025 }));
      if (quality === 'high' && container.clientWidth > 900) {
        const ssao = new SSAOPass(scene, camera, Math.ceil(container.clientWidth * .65), Math.ceil(container.clientHeight * .65));
        ssao.kernelRadius = 11; ssao.minDistance = .004; ssao.maxDistance = .18; composer.addPass(ssao);
      }
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), .18, .45, .82));
      const finish = new ShaderPass(FINISH_SHADER); composer.addPass(finish);
      composer.addPass(new OutputPass());
    } catch (error) { composer?.dispose?.(); composer = null; console.warn('Cinema post-processing unavailable; rendering directly.', error); }
  }
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    controls.update();
    const bokeh = composer?.passes.find((pass) => pass instanceof BokehPass);
    if (bokeh) bokeh.uniforms.focus.value = Math.max(0.5, camera.position.distanceTo(screen.position));
    screenFill.intensity = (quality === 'low' ? 8 : 14.5) + Math.sin(clock.elapsedTime * 1.2) * .35;
    if (composer) {
      const finish = composer.passes.find((pass) => pass instanceof ShaderPass && pass.material?.uniforms?.time);
      if (finish) finish.uniforms.time.value = clock.elapsedTime;
      composer.render();
    } else renderer.render(scene, camera);
  });

  function dispose() {
    disposed = true;
    renderer.setAnimationLoop(null);
    controls.dispose();
    renderer.domElement.removeEventListener('pointerdown', startScreenVideo);
    screenVideo.pause();
    screenVideo.removeAttribute('src');
    screenVideo.load();
    screenVideoTexture.dispose();
    screenVideo.removeEventListener('loadedmetadata', fitScreenVideo);
    screenVideo.removeEventListener('playing', showScreenVideo);
    themedRoom?.dispose();
    removeEventListener('resize', resize);
    floor.geometry.dispose(); shellGeometries.forEach((geometry) => geometry.dispose()); floorTexture?.dispose(); floorMat.dispose(); wallMat.dispose(); ceilingMat.dispose();
    screen.geometry.dispose(); posterTexture.dispose(); screen.material.dispose();
    shellTextures.splice(0).forEach((texture) => texture.dispose());
    projectorBeam.geometry.dispose(); projectorBeam.material.dispose();
    optionalDust.geometry.dispose(); optionalDust.material.dispose();
    key.dispose(); screenBounce.dispose(); screenFill.dispose(); screenLowerFill.dispose(); top.dispose();
    composer?.dispose?.();
    renderer.dispose();
    pmrem.dispose();
    environmentTexture?.dispose?.();
    renderer.domElement.remove();
  }

  return { scene, camera, renderer, controls, orbitView, seatView, fromScreenView, aisleView, fitView, resetView, applyTheme, dispose };
}
