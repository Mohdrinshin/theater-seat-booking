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
import { createTheaterRenderer, getTheaterDeviceProfile, pixelRatioForQuality } from '../designs/render/renderer.js';
import { buildRoom, createCarpetTexture } from '../designs/rooms/buildRoom.js';
import { ROOM_THEME_BY_KEY } from '../designs/registry.js';
import { getMaterialLibrary } from '../designs/materials/library.js';
import { THEATER_LIGHTING } from '../designs/lighting.js';
import { createScreenTexture } from '../designs/fx/screenTexture.js';
import { applyFX, createOptionalDust } from '../designs/fx/applyFX.js';
import { TheaterJoystick } from './joystick.js';

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
  const deviceProfile = getTheaterDeviceProfile();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070a);
  scene.fog = new THREE.Fog(0x07070a, 25, 60);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  let qualityMode = options.qualityMode || 'auto';
  const requestedQuality = options.themeOptions?.quality;
  let quality = ['low', 'medium', 'high'].includes(qualityMode)
    ? qualityMode
    : requestedQuality || deviceProfile.initialQuality;
  const renderer = createTheaterRenderer(quality);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environmentIntensity = THEATER_LIGHTING.render.environment[quality] ?? THEATER_LIGHTING.render.environment.high;
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
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.75;
  controls.enableZoom = false; // handled below with a damped wheel/pinch target
  controls.minDistance = 3;
  controls.maxDistance = Math.max(40, room.depth * 1.5);
  controls.minPolarAngle = 0.04;
  controls.maxPolarAngle = Math.PI / 2 - .02;
  renderer.domElement.style.touchAction = 'none';
  const joystick = new TheaterJoystick(container, { ...options.joystick, camera, controls, room });

  let frameRequestId = 0;
  let sceneDirty = true;
  function invalidate() {
    sceneDirty = true;
    if (!disposed && !document.hidden && frameRequestId === 0) frameRequestId = requestAnimationFrame(renderFrame);
  }

  let zoomTargetDistance = 10;
  const zoomOffset = new THREE.Vector3();
  const activeTouches = new Map();
  let lastPinchDistance = 0;
  let panBeforePinch = true;
  const handleWheel = (event) => {
    if (event.defaultPrevented || !controls.enabled) return;
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? innerHeight : 1;
    const delta = THREE.MathUtils.clamp(event.deltaY * unit, -240, 240);
    const currentDistance = camera.position.distanceTo(controls.target);
    if (!Number.isFinite(zoomTargetDistance) || zoomTargetDistance < controls.minDistance || zoomTargetDistance > controls.maxDistance) {
      zoomTargetDistance = currentDistance;
    }
    zoomTargetDistance = THREE.MathUtils.clamp(
      zoomTargetDistance * Math.exp(delta * 0.0011 * controls.zoomSpeed),
      controls.minDistance,
      controls.maxDistance,
    );
    invalidate();
  };
  const touchDistance = () => {
    const points = [...activeTouches.values()];
    return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  const handlePointerDown = (event) => {
    if (event.pointerType !== 'touch') return;
    activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activeTouches.size === 2) {
      panBeforePinch = controls.enablePan;
      controls.enablePan = false;
      lastPinchDistance = touchDistance();
      zoomTargetDistance = camera.position.distanceTo(controls.target);
    }
  };
  const handlePointerMove = (event) => {
    if (!activeTouches.has(event.pointerId)) return;
    activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activeTouches.size < 2) return;
    const nextDistance = touchDistance();
    if (lastPinchDistance > 0 && nextDistance > 0) {
      zoomTargetDistance = THREE.MathUtils.clamp(
        zoomTargetDistance * (lastPinchDistance / nextDistance),
        controls.minDistance,
        controls.maxDistance,
      );
      invalidate();
    }
    lastPinchDistance = nextDistance;
  };
  const handlePointerEnd = (event) => {
    activeTouches.delete(event.pointerId);
    if (activeTouches.size < 2) {
      lastPinchDistance = 0;
      controls.enablePan = panBeforePinch;
    }
  };
  renderer.domElement.addEventListener('wheel', handleWheel, { capture: true, passive: false });
  renderer.domElement.addEventListener('pointerdown', handlePointerDown, { passive: true });
  renderer.domElement.addEventListener('pointermove', handlePointerMove, { passive: true });
  renderer.domElement.addEventListener('pointerup', handlePointerEnd, { passive: true });
  renderer.domElement.addEventListener('pointercancel', handlePointerEnd, { passive: true });

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
  posterTexture.wrapS = posterTexture.wrapT = THREE.ClampToEdgeWrapping;
  const cropTextureToScreen = (texture, sourceAspect) => {
    const screenAspect = screenConfig.width / screenConfig.height;
    if (screenAspect > sourceAspect) {
      const visibleHeight = sourceAspect / screenAspect;
      texture.repeat.set(1, visibleHeight);
      texture.offset.set(0, (1 - visibleHeight) / 2);
    } else {
      const visibleWidth = screenAspect / sourceAspect;
      texture.repeat.set(visibleWidth, 1);
      texture.offset.set((1 - visibleWidth) / 2, 0);
    }
    texture.needsUpdate = true;
  };
  cropTextureToScreen(posterTexture, 2);
  posterTexture.needsUpdate = true;
  const screenVideo = document.createElement('video');
  screenVideo.crossOrigin = 'anonymous';
  screenVideo.loop = true;
  screenVideo.muted = true;
  screenVideo.playsInline = true;
  screenVideo.preload = 'auto';
  const screenVideoTexture = new THREE.VideoTexture(screenVideo);
  screenVideoTexture.colorSpace = THREE.SRGBColorSpace;
  screenVideoTexture.minFilter = THREE.LinearFilter;
  screenVideoTexture.magFilter = THREE.LinearFilter;
  screenVideoTexture.generateMipmaps = false;
  screenVideoTexture.wrapS = screenVideoTexture.wrapT = THREE.ClampToEdgeWrapping;
  screenVideoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const fitScreenVideo = () => {
    const videoAspect = screenVideo.videoWidth && screenVideo.videoHeight
      ? screenVideo.videoWidth / screenVideo.videoHeight
      : 16 / 9;
    cropTextureToScreen(screenVideoTexture, videoAspect);
  };
  screenVideo.addEventListener('loadedmetadata', fitScreenVideo);
  const screenGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(screenConfig.width + 0.36, screenConfig.height + 0.36),
    new THREE.MeshBasicMaterial({ color: 0x75549d, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  screenGlow.position.set(screenConfig.x || 0, screenConfig.y, screenConfig.z + 0.003);
  scene.add(screenGlow);
  const screenBezel = new THREE.Mesh(
    new THREE.PlaneGeometry(screenConfig.width + 0.14, screenConfig.height + 0.14),
    new THREE.MeshBasicMaterial({ color: 0x050509, side: THREE.DoubleSide, toneMapped: false }),
  );
  screenBezel.position.set(screenConfig.x || 0, screenConfig.y, screenConfig.z + 0.01);
  scene.add(screenBezel);
  const screenGeometry = new THREE.PlaneGeometry(screenConfig.width, screenConfig.height);
  const screen = new THREE.Mesh(
    screenGeometry,
    new THREE.MeshBasicMaterial({ map: posterTexture, color: 0xffffff, side: THREE.DoubleSide, toneMapped: false })
  );
  screen.position.set(screenConfig.x || 0, screenConfig.y, screenConfig.z + 0.02);
  scene.add(screen);
  const showScreenVideo = () => {
    screen.material.map = screenVideoTexture;
    screen.material.needsUpdate = true;
  };
  const handleScreenVideoError = () => {
    screenVideo.pause();
    screen.material.map = posterTexture;
    screen.material.needsUpdate = true;
    console.error('Could not load screen video asset: /assets/video/screen_loop.mp4; using the cinema placeholder.');
  };
  screenVideo.addEventListener('playing', showScreenVideo);
  screenVideo.addEventListener('error', handleScreenVideoError);
  screenVideo.src = '/assets/video/screen_loop.mp4';
  const startScreenVideo = () => screenVideo.play().catch(() => {});
  renderer.domElement.addEventListener('pointerdown', startScreenVideo, { once: true });

  // --- lights -----------------------------------------------------------
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.AmbientLight(THEATER_LIGHTING.ambient.color, THEATER_LIGHTING.ambient.intensity));
  scene.add(new THREE.HemisphereLight(THEATER_LIGHTING.hemisphere.sky, THEATER_LIGHTING.hemisphere.ground, THEATER_LIGHTING.hemisphere.intensity));
  const screenBounce = new THREE.RectAreaLight(
    THEATER_LIGHTING.screenArea.color,
    THEATER_LIGHTING.screenArea.intensity,
    screenConfig.width * THEATER_LIGHTING.screenArea.widthScale,
    screenConfig.height * THEATER_LIGHTING.screenArea.heightScale,
  );
  screenBounce.position.set(screenConfig.x || 0, screenConfig.y, screenConfig.z + THEATER_LIGHTING.screenArea.surfaceOffset);
  screenBounce.lookAt(0, Math.max(THEATER_LIGHTING.screenKey.targetYFloor, screenConfig.y * THEATER_LIGHTING.screenArea.targetYScale), room.depth * THEATER_LIGHTING.screenArea.targetZScale);
  scene.add(screenBounce);
  const screenFill = new THREE.PointLight(
    THEATER_LIGHTING.screenFill.color,
    quality === 'low' ? THEATER_LIGHTING.screenFill.lowIntensity : THEATER_LIGHTING.screenFill.intensity,
    room.depth * THEATER_LIGHTING.screenFill.distanceScale,
    THEATER_LIGHTING.screenFill.decay,
  );
  screenFill.position.set(screenConfig.x || 0, screenConfig.y * THEATER_LIGHTING.screenFill.yScale, screenConfig.z + THEATER_LIGHTING.screenFill.zOffset);
  scene.add(screenFill);
  const screenLowerFill = new THREE.PointLight(THEATER_LIGHTING.screenLowerFill.color, THEATER_LIGHTING.screenLowerFill.intensity, room.depth * THEATER_LIGHTING.screenLowerFill.distanceScale, THEATER_LIGHTING.screenLowerFill.decay);
  screenLowerFill.position.set(screenConfig.x || 0, THEATER_LIGHTING.screenLowerFill.y, screenConfig.z + THEATER_LIGHTING.screenLowerFill.zOffset);
  scene.add(screenLowerFill);
  const key = quality === 'low'
    ? new THREE.SpotLight(THEATER_LIGHTING.screenKey.color, THEATER_LIGHTING.screenKey.intensity, room.depth * THEATER_LIGHTING.screenKey.distanceScale, THEATER_LIGHTING.screenKey.angle, THEATER_LIGHTING.screenKey.penumbra, THEATER_LIGHTING.screenKey.decay)
    : new THREE.RectAreaLight(THEATER_LIGHTING.screenKey.color, THEATER_LIGHTING.screenKey.intensity, screenConfig.width, screenConfig.height);
  key.position.set(screenConfig.x || 0, screenConfig.y, screenConfig.z + 0.2);
  if (key.isSpotLight) {
    key.target.position.set(0, Math.max(THEATER_LIGHTING.screenKey.targetYFloor, screenConfig.y * THEATER_LIGHTING.screenKey.targetYScale), room.depth * THEATER_LIGHTING.screenKey.targetZScale);
    scene.add(key, key.target);
  } else {
    key.lookAt(0, screenConfig.y, room.depth); scene.add(key);
  }
  const rim = new THREE.DirectionalLight(THEATER_LIGHTING.rim.color, THEATER_LIGHTING.rim.intensity);
  rim.position.set(THEATER_LIGHTING.rim.x, room.height * THEATER_LIGHTING.rim.yScale, room.depth * THEATER_LIGHTING.rim.zScale);
  rim.target.position.set(0, THEATER_LIGHTING.rim.targetY, room.depth * THEATER_LIGHTING.rim.targetZScale);
  rim.castShadow = quality === 'high' && !deviceProfile.mobile;
  rim.shadow.mapSize.set(1024, 1024);
  rim.shadow.camera.left = -room.width; rim.shadow.camera.right = room.width;
  rim.shadow.camera.top = room.height; rim.shadow.camera.bottom = -2;
  rim.shadow.bias = THEATER_LIGHTING.rim.shadowBias;
  scene.add(rim, rim.target);

  const seatSpot = new THREE.SpotLight(
    THEATER_LIGHTING.seatSpot.color,
    THEATER_LIGHTING.seatSpot.intensity,
    room.depth * THEATER_LIGHTING.seatSpot.distanceScale,
    THEATER_LIGHTING.seatSpot.angle,
    THEATER_LIGHTING.seatSpot.penumbra,
    THEATER_LIGHTING.seatSpot.decay,
  );
  seatSpot.position.set(0, room.height * THEATER_LIGHTING.seatSpot.yScale, room.depth * THEATER_LIGHTING.seatSpot.zScale);
  seatSpot.target.position.set(0, THEATER_LIGHTING.seatSpot.targetY, room.depth * THEATER_LIGHTING.seatSpot.targetZScale);
  seatSpot.castShadow = quality === 'high' && !deviceProfile.mobile;
  seatSpot.shadow.mapSize.set(1024, 1024);
  seatSpot.shadow.bias = THEATER_LIGHTING.seatSpot.shadowBias;
  scene.add(seatSpot, seatSpot.target);

  const washGroup = new THREE.Group(); washGroup.name = 'cinema wall wash lighting'; scene.add(washGroup);
  const washSpots = [];
  {
    for (const zFraction of [0.28]) for (const side of [-1, 1]) {
      const z = room.depth * zFraction;
      const spot = new THREE.SpotLight(THEATER_LIGHTING.ceilingSpot.color, THEATER_LIGHTING.ceilingSpot.intensity, room.depth * THEATER_LIGHTING.ceilingSpot.distanceScale, THEATER_LIGHTING.ceilingSpot.angle, THEATER_LIGHTING.ceilingSpot.penumbra, THEATER_LIGHTING.ceilingSpot.decay);
      spot.position.set(side * room.width * THEATER_LIGHTING.ceilingSpot.xScale, room.height - THEATER_LIGHTING.ceilingSpot.yOffset, z);
      spot.target.position.set(side * room.width * THEATER_LIGHTING.ceilingSpot.targetXScale, THEATER_LIGHTING.ceilingSpot.targetY, z + room.depth * THEATER_LIGHTING.ceilingSpot.targetZScale);
      spot.castShadow = false;
      washGroup.add(spot, spot.target); washSpots.push(spot);
    }
  }
  const wallWashGroup = new THREE.Group(); wallWashGroup.name = 'warm wall wash lights'; scene.add(wallWashGroup);
  for (const side of [-1, 1]) for (const zFraction of [0.25, 0.75]) {
    const wash = new THREE.PointLight(THEATER_LIGHTING.wallWash.color, THEATER_LIGHTING.wallWash.intensity, room.width * THEATER_LIGHTING.wallWash.distanceScale, THEATER_LIGHTING.wallWash.decay);
    wash.position.set(side * room.width * THEATER_LIGHTING.wallWash.sideScale, room.height * THEATER_LIGHTING.wallWash.yScale, room.depth * zFraction);
    wallWashGroup.add(wash);
  }
  const floorPoolGroup = new THREE.Group(); floorPoolGroup.name = 'low amber floor light pools'; scene.add(floorPoolGroup);
  for (const zFraction of [0.2, 0.55, 0.85]) {
    const pool = new THREE.PointLight(THEATER_LIGHTING.floorPool.color, THEATER_LIGHTING.floorPool.intensity, THEATER_LIGHTING.floorPool.distance, THEATER_LIGHTING.floorPool.decay);
    pool.position.set(0, THEATER_LIGHTING.floorPool.y, room.depth * zFraction);
    floorPoolGroup.add(pool);
  }

  let themedRoom = null;
  let floorTexture = null;
  let pbrTextures = null;
  let currentThemeKey = options.theme || 'multiplex';
  let currentThemeOptions = options.themeOptions || {};
  let currentSeats = options.seats || [];
  const shellTextures = [];
  const modeLightSources = [];
  let modeIntensity = THEATER_LIGHTING.view.orbit;
  let modeTransitionStart = modeIntensity;
  let modeTransitionTarget = modeIntensity;
  let modeTransitionElapsed = THEATER_LIGHTING.view.transitionSeconds;
  function refreshModeLightSources() {
    modeLightSources.length = 0;
    scene.traverse((object) => {
      if (!object.isLight) return;
      object.userData.theaterBaseIntensity = object === screenFill
        ? (quality === 'low' ? THEATER_LIGHTING.screenFill.lowIntensity : THEATER_LIGHTING.screenFill.intensity)
        : object.intensity;
      modeLightSources.push(object);
    });
  }
  function setLightingMode(mode) {
    modeTransitionStart = modeIntensity;
    modeTransitionTarget = mode === 'seat' ? THEATER_LIGHTING.view.seat : THEATER_LIGHTING.view.orbit;
    modeTransitionElapsed = 0;
  }
  function updateLightingMode(deltaSeconds, elapsedSeconds) {
    if (modeTransitionElapsed < THEATER_LIGHTING.view.transitionSeconds) {
      modeTransitionElapsed = Math.min(THEATER_LIGHTING.view.transitionSeconds, modeTransitionElapsed + deltaSeconds);
      const progress = modeTransitionElapsed / THEATER_LIGHTING.view.transitionSeconds;
      const smoothProgress = progress * progress * (3 - 2 * progress);
      modeIntensity = THREE.MathUtils.lerp(modeTransitionStart, modeTransitionTarget, smoothProgress);
    }
    const screenBase = (quality === 'low' ? THEATER_LIGHTING.screenFill.lowIntensity : THEATER_LIGHTING.screenFill.intensity)
      + Math.sin(elapsedSeconds * THEATER_LIGHTING.screenFill.pulseRate) * THEATER_LIGHTING.screenFill.pulseAmplitude;
    for (const light of modeLightSources) {
      const base = light === screenFill ? screenBase : light.userData.theaterBaseIntensity;
      light.intensity = base * modeIntensity;
    }
  }
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
    washGroup.visible = quality === 'high' && !deviceProfile.mobile && theme.style !== 'crimson-premiere';
    wallWashGroup.visible = quality !== 'low' && !deviceProfile.mobile && theme.style !== 'crimson-premiere';
    floorPoolGroup.visible = quality !== 'low' && !deviceProfile.mobile && theme.style !== 'crimson-premiere';
    scene.environmentIntensity = THEATER_LIGHTING.render.environment[quality] ?? THEATER_LIGHTING.render.environment.high;
    if (themeOptions.shadows === false || quality === 'low') renderer.shadowMap.enabled = false;
    else renderer.shadowMap.enabled = true;
    themedRoom = buildRoom(scene, themeKey, room, { anchors: seats }, theme.defaultSeat, themeOptions.quality || quality, pbrTextures);
    applyFX(scene, themeOptions);
    refreshModeLightSources();
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
    setLightingMode('orbit');
    controls.enabled = true;
    controls.minDistance = 3;
    controls.maxDistance = Math.max(40, room.depth * 1.5);
    camera.position.copy(orbitHome.pos);
    controls.target.copy(orbitHome.target);
    camera.fov = 55; camera.updateProjectionMatrix();
    controls.update();
  }
  function seatView(seatOrRow, number) {
    setLightingMode('seat');
    const p = typeof seatOrRow === 'object'
      ? (Number.isFinite(seatOrRow.x) && Number.isFinite(seatOrRow.z) ? seatOrRow : seatPosition(seatOrRow.row, seatOrRow.number))
      : seatPosition(seatOrRow, number);
    camera.position.set(p.x, p.y + 1.22, p.z + 1.2); // eye height, slight step back to frame the full screen
    controls.target.set(screenConfig.x || 0, screenConfig.y, screenConfig.z);    // look at screen
    controls.minDistance = 0.01;
    camera.fov = 80; camera.updateProjectionMatrix();
    controls.update();
  }

  function fromScreenView() {
    setLightingMode('orbit');
    controls.enabled = true;
    camera.position.set(0, 1.55, Math.max(1.5, room.depth * .08));
    controls.target.set(0, Math.min(room.height * .45, screenConfig.y), room.depth * .72);
    camera.fov = 64; camera.updateProjectionMatrix(); controls.update();
  }
  function aisleView() {
    setLightingMode('orbit');
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
      const samples = Math.min(4, renderer.capabilities.maxSamples || 4);
      composer.renderTarget1.samples = samples;
      composer.renderTarget2.samples = samples;
      composer.addPass(new RenderPass(scene, camera));
      if (quality === 'high') composer.addPass(new BokehPass(scene, camera, { focus: 15, aperture: .000012, maxblur: .0025 }));
      if (quality === 'high' && container.clientWidth > 900) {
        const ssao = new SSAOPass(scene, camera, Math.ceil(container.clientWidth), Math.ceil(container.clientHeight));
        ssao.kernelRadius = 11; ssao.minDistance = .004; ssao.maxDistance = .18; composer.addPass(ssao);
      }
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), THEATER_LIGHTING.bloom.intensity, THEATER_LIGHTING.bloom.radius, THEATER_LIGHTING.bloom.threshold));
      const finish = new ShaderPass(FINISH_SHADER); composer.addPass(finish);
      composer.addPass(new OutputPass());
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(container.clientWidth, container.clientHeight);
    } catch (error) { composer?.dispose?.(); composer = null; console.warn('Cinema post-processing unavailable; rendering directly.', error); }
  }
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    controls.update();
    const deltaSeconds = clock.getDelta();
    joystick.update(deltaSeconds);
    updateLightingMode(deltaSeconds, clock.elapsedTime);
    const bokeh = composer?.passes.find((pass) => pass instanceof BokehPass);
    if (bokeh) {
      camera.updateMatrixWorld();
      const screenDepth = screen.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
      bokeh.uniforms.focus.value = Math.max(0.5, -screenDepth);
    }
    if (composer) {
      const finish = composer.passes.find((pass) => pass instanceof ShaderPass && pass.material?.uniforms?.time);
      if (finish) finish.uniforms.time.value = clock.elapsedTime;
      composer.render();
    } else renderer.render(scene, camera);
  });

  function dispose() {
    disposed = true;
    renderer.setAnimationLoop(null);
    joystick.dispose();
    controls.dispose();
    renderer.domElement.removeEventListener('pointerdown', startScreenVideo);
    screenVideo.pause();
    screenVideo.removeAttribute('src');
    screenVideo.load();
    screenVideoTexture.dispose();
    screenVideo.removeEventListener('loadedmetadata', fitScreenVideo);
    screenVideo.removeEventListener('playing', showScreenVideo);
    screenVideo.removeEventListener('error', handleScreenVideoError);
    themedRoom?.dispose();
    removeEventListener('resize', resize);
    floor.geometry.dispose(); shellGeometries.forEach((geometry) => geometry.dispose()); floorTexture?.dispose(); floorMat.dispose(); wallMat.dispose(); ceilingMat.dispose();
    screen.geometry.dispose(); posterTexture.dispose(); screen.material.dispose();
    screenBezel.geometry.dispose(); screenBezel.material.dispose();
    screenGlow.geometry.dispose(); screenGlow.material.dispose();
    shellTextures.splice(0).forEach((texture) => texture.dispose());
    projectorBeam.geometry.dispose(); projectorBeam.material.dispose();
    optionalDust.geometry.dispose(); optionalDust.material.dispose();
    key.dispose(); screenBounce.dispose(); screenFill.dispose(); screenLowerFill.dispose(); rim.dispose(); seatSpot.dispose();
    composer?.dispose?.();
    renderer.dispose();
    pmrem.dispose();
    environmentTexture?.dispose?.();
    renderer.domElement.remove();
  }

  return { scene, camera, renderer, controls, orbitView, seatView, fromScreenView, aisleView, fitView, resetView, applyTheme, dispose };
}
