import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const A = '/assets/';
const VIGNETTE_GRAIN = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.12 } },
  vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv; float rand(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);} void main(){float d=distance(vUv,vec2(.5));float edge=smoothstep(.28,.76,d);vec2 shift=(vUv-vec2(.5))*edge*.0011;vec4 c=texture2D(tDiffuse,vUv);c.r=texture2D(tDiffuse,vUv+shift).r;c.b=texture2D(tDiffuse,vUv-shift).b;float vig=smoothstep(.82,.18,d);float grain=(rand(vUv*vec2(1000.,700.)+time)-.5)*.006;c.rgb*=mix(.82,1.,vig);c.rgb+=grain;c.rgb*=1.0-amount*.035;gl_FragColor=c;}'
};

export class CinemaScene {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.manager = new THREE.LoadingManager();
    this.manager.onProgress = (url, loaded, total) => callbacks.progress?.(loaded / Math.max(total, 1), url);
    this.manager.onError = (url) => callbacks.assetError?.(url);
    this.loader = new THREE.TextureLoader(this.manager);
    this.seatHits = [];
    this.seats = [];
    this.keys = new Set();
    this.walking = false;
    this.sitting = false;
    this.isOrbit = false;
    this.clock = new THREE.Clock();
    this.pointerLocked = false;
    this.touchVector = new THREE.Vector2();
    this.initRenderer();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c070a);
    this.scene.fog = new THREE.FogExp2(0x160c11, 0.009);
    this.camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 140);
    this.camera.position.set(0, 6.6, 20.1);
    this.camera.lookAt(0, 2.7, -15);
    this.introCameraPosition = this.camera.position.clone();
    this.introLookTarget = new THREE.Vector3(0, 2.7, -15);
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.target.set(0, 3.1, -7.5);
    this.orbit.enableDamping = true;
    this.orbit.enabled = false;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.yaw = 0;
    this.pitch = -0.11;
    this.velocity = new THREE.Vector3();
    this.fpsClock = 0;
    this.weakGPU = this.isWeakGPU();
    this.ready = this.initialize();
  }

  async initialize() {
    await this.loadAssets();
    this.buildEnvironment(); this.buildRoom(); this.buildSeats(); this.buildScreen();
    this.buildLightsAndDust(); this.createPostProcessing(); this.bind(); this.animate();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.isWeakGPU(), powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.isWeakGPU() ? 1.2 : 1.7));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  isWeakGPU() {
    const gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    return innerWidth < 700 || /intel.*(hd|uhd)|mali|adreno 5|swiftshader/i.test(name);
  }

  async loadAssets() {
    const specs = [
      ['leather_red', 2.4, 2.4], ['leather_grey', 2.4, 2.4], ['carpet_red', 2.4, 2.4],
      ['wall_fabric', 4, 12], ['ceiling_black', 1.4, 1.4], ['metal_brushed', 1.2, 1.2],
    ];
    for (const [key, rx, ry] of specs) {
      const maps = {};
      for (const kind of ['albedo', 'normal', 'roughness', ...(key === 'metal_brushed' ? ['metalness'] : [])]) {
        try {
          const tex = await this.loader.loadAsync(`${A}textures/${key}_${kind}.jpg`);
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(rx, ry);
          tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          tex.colorSpace = kind === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          maps[kind] = tex;
        } catch (error) { this.callbacks.assetError?.(`${A}textures/${key}_${kind}.jpg`); }
      }
      this[key] = maps;
    }
    for (const [key, path] of [['arrow', 'textures/carpet_arrow_decal.png'], ['wallLine', 'textures/wall_line_decal.png']]) {
      try {
        const tex = await this.loader.loadAsync(A + path);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this[key] = tex;
      } catch { this.callbacks.assetError?.(A + path); }
    }
    try {
      const rgbe = new RGBELoader(this.manager);
      const hdr = await rgbe.loadAsync(`${A}hdri/cinema_dark.hdr`);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.environment = pmrem.fromEquirectangular(hdr).texture;
      this.scene.environment = this.environment;
      this.scene.environmentIntensity = 0.22;
      hdr.dispose(); pmrem.dispose();
    } catch { this.callbacks.assetError?.(`${A}hdri/cinema_dark.hdr`); }
    try { this.logo = await new THREE.TextureLoader(this.manager).loadAsync(`${A}logo/logo.svg`); this.logo.colorSpace = THREE.SRGBColorSpace; }
    catch { this.callbacks.assetError?.(`${A}logo/logo.svg`); }
    this.callbacks.assetsReady?.();
  }

  material(maps, options = {}) {
    const config = { map: maps?.albedo, normalMap: maps?.normal, roughnessMap: maps?.roughness,
      roughness: 0.84, metalness: 0.02, envMapIntensity: 0.4, ...options };
    if (maps?.metalness) config.metalnessMap = maps.metalness;
    return new THREE.MeshPhysicalMaterial(config);
  }

  box(name, dims, pos, mat, radius = 0) {
    const geo = radius ? new RoundedBoxGeometry(...dims, 3, radius) : new THREE.BoxGeometry(...dims);
    const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh); return mesh;
  }

  buildEnvironment() {
    RectAreaLightUniformsLib.init();
    const amb = new THREE.AmbientLight(0xb47c73, 0.7); this.scene.add(amb);
    this.scene.add(new THREE.HemisphereLight(0x9b7784, 0x26110f, 0.7));
  }

  buildRoom() {
    const floorCarpet = this.makeFloorCarpetMaterial(16, 26);
    const aisleCarpet = this.makeFloorCarpetMaterial(1.2, 21);
    this.mats = {
      carpet: this.material(this.carpet_red, { roughness: 0.98, roughnessMap: this.carpet_red?.roughness, emissive: 0x1b0107, emissiveIntensity: .38 }),
      floorCarpet,
      aisleCarpet,
      wall: this.material(this.wall_fabric, { color: 0x8c3343, roughness: 0.94, emissive: 0x3d0713, emissiveIntensity: .64 }),
      ceiling: this.material(this.ceiling_black, { color: 0x242022, roughness: 0.98 }),
      metal: this.material(this.metal_brushed, { metalness: 0.74, roughness: 0.32 }),
      black: new THREE.MeshStandardMaterial({ color: 0x100d0e, roughness: 0.74 }),
      brass: new THREE.MeshStandardMaterial({ color: 0x9c6949, metalness: 0.68, roughness: 0.4 }),
    };
    this.box('cinema carpet', [24, .38, 39], [0, -.19, 1], this.mats.floorCarpet);
    this.box('left upholstered wall', [.5, 10.7, 39], [-12.2, 5.15, 1], this.mats.wall);
    this.box('right upholstered wall', [.5, 10.7, 39], [12.2, 5.15, 1], this.mats.wall);
    this.box('rear wall', [24, 10.7, .5], [0, 5.15, 20.5], this.mats.black);
    this.box('black acoustic ceiling', [24, .5, 39], [0, 10.75, 1], this.mats.ceiling);
    this.addAcousticPanels();
    this.box('stage apron', [23, .45, 2.2], [0, .22, -15.2], this.mats.black);
    // Rows sit on ten broad, progressively raised carpeted platforms.
    for (let row = 0; row < 10; row++) {
      const z = -5.35 + row * 1.8;
      const h = 0.3 + row * 0.3;
      this.box(`row platform ${row + 1}`, [22.4, h, 1.83], [0, h / 2, z], this.mats.carpet, 0.05);
      this.box(`step nosing ${row + 1}`, [22.2, .045, .075], [0, h + .03, z - .88], this.mats.metal, .02);
      const ledMat = new THREE.MeshBasicMaterial({ color: 0xffa04c, toneMapped: false });
      this.box(`amber step LED ${row + 1}`, [22.0, .028, .042], [0, h + .06, z - .89], ledMat, .014);
      const glow = new THREE.PointLight(0xff8c37, 0.5, 2.8, 2); glow.position.set(0, h + .16, z - .94); this.scene.add(glow);
    }
    this.addAislesAndDecals();
    this.addWallLines();
    this.addCeilingDetails();
    this.addProjectorWindow();
    this.addExit();
  }

  makeFloorCarpetMaterial(repeatX, repeatY) {
    const maps = {};
    this.carpetTextureClones ||= [];
    for (const [name, source] of Object.entries(this.carpet_red || {})) {
      const map = source.clone();
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeatX, repeatY);
      map.needsUpdate = true;
      maps[name] = map;
      this.carpetTextureClones.push(map);
    }
    const material = this.material(maps, {
      roughness: .95, metalness: 0, clearcoat: 0, clearcoatRoughness: 1,
      normalScale: new THREE.Vector2(.58, .58),
    });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCinemaCarpetWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCinemaCarpetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCinemaCarpetWorld;')
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'float carpetX = vCinemaCarpetWorld.x;',
          'float carpetZ = vCinemaCarpetWorld.z;',
          'float broadMottle = sin(carpetX * .24 + sin(carpetZ * .11)) * cos(carpetZ * .19 - sin(carpetX * .13));',
          'float wallFade = smoothstep(8.0, 11.8, abs(carpetX));',
          'float rowPhase = abs(fract((carpetZ + 4.3) / 1.8) - .5);',
          'float seatPatch = (1.0 - smoothstep(.08, .29, rowPhase)) * smoothstep(1.2, 2.3, abs(carpetX));',
          'float spotD1 = min(length(vec2(carpetX - 7.2, carpetZ + 8.0)), length(vec2(carpetX + 7.2, carpetZ + 8.0)));',
          'float spotD2 = min(length(vec2(carpetX - 7.2, carpetZ - 2.0)), length(vec2(carpetX + 7.2, carpetZ - 2.0)));',
          'float spotD3 = min(length(vec2(carpetX - 7.2, carpetZ - 12.0)), length(vec2(carpetX + 7.2, carpetZ - 12.0)));',
          'float spotPool = exp(-min(spotD1, min(spotD2, spotD3)) * min(spotD1, min(spotD2, spotD3)) * .024);',
          'float screenDelta = carpetZ + 12.0;',
          'float screenPool = exp(-screenDelta * screenDelta * .0324) * exp(-carpetX * carpetX * .009);',
          'float aislePool = exp(-carpetX * carpetX * .16) * .12;',
          'float lightFalloff = clamp(.12 + spotPool * .58 + screenPool * .24 + aislePool, .08, .96);',
          'float carpetMottle = .9 + broadMottle * .07 - wallFade * .16 - seatPatch * .1;',
          'diffuseColor.rgb *= carpetMottle * lightFalloff;',
        ].join('\n'));
    };
    material.customProgramCacheKey = () => `cinema-floor-carpet-${repeatX}-${repeatY}-v1`;
    return material;
  }

  addAislesAndDecals() {
    // Central staircase has its own open riser run; aisles remain visible on each side.
    this.box('center aisle carpet', [1.8, .12, 31], [0, .02, 2.0], this.mats.aisleCarpet);
    for (let i = 0; i < 14; i++) {
      const z = -11.2 + i * 1.75;
      this.box(`central stair tread ${i}`, [1.78, .12, .74], [0, .15 + i * .21, z], this.mats.black, .025);
      this.box(`stair metal nosing ${i}`, [1.8, .045, .075], [0, .23 + i * .21, z - .34], this.mats.metal, .02);
      const led = new THREE.Mesh(new THREE.BoxGeometry(1.75, .025, .034), new THREE.MeshBasicMaterial({ color: 0xffa64f, toneMapped: false }));
      led.position.set(0, .26 + i * .21, z - .36); this.scene.add(led);
    }
    const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 128;
    const glowContext = glowCanvas.getContext('2d');
    const glowGradient = glowContext.createRadialGradient(64, 64, 3, 64, 64, 63);
    glowGradient.addColorStop(0, 'rgba(255,176,91,0.48)');
    glowGradient.addColorStop(.32, 'rgba(255,126,54,0.24)');
    glowGradient.addColorStop(1, 'rgba(255,92,32,0)');
    glowContext.fillStyle = glowGradient; glowContext.fillRect(0, 0, 128, 128);
    this.aisleGlowTexture = new THREE.CanvasTexture(glowCanvas);
    this.aisleGlowTexture.colorSpace = THREE.SRGBColorSpace;
    const glowMaterial = new THREE.MeshBasicMaterial({ map: this.aisleGlowTexture, transparent: true, opacity: .58, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const glowGeometry = new THREE.PlaneGeometry(1.48, .56);
    for (let i = 0; i < 14; i++) {
      const z = -11.2 + i * 1.75;
      const decal = new THREE.Mesh(glowGeometry, glowMaterial);
      decal.rotation.x = -Math.PI / 2; decal.position.set(0, .218 + i * .21, z - .36); decal.renderOrder = 2; this.scene.add(decal);
    }
    if (this.arrow) {
      for (const x of [-11.58, 11.58]) for (let z = -13; z < 18; z += 4.1) {
        const m = new THREE.MeshBasicMaterial({ map: this.arrow, transparent: true, opacity: .32, depthWrite: false, side: THREE.DoubleSide });
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(.58, .58), m); decal.rotation.x = -Math.PI / 2; decal.position.set(x, .014, z); this.scene.add(decal);
      }
      for (let step = 1; step < 14; step += 2) for (const side of [-1, 1]) {
        const z = -11.2 + step * 1.75, y = .22 + step * .21;
        const m = new THREE.MeshBasicMaterial({ map: this.arrow, transparent: true, opacity: .32, depthWrite: false, side: THREE.DoubleSide });
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(.42, .42), m); decal.rotation.x = -Math.PI / 2; decal.position.set(side * .63, y, z); this.scene.add(decal);
      }
    }
  }

  addWallLines() {
    const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xffe7d9, emissive: 0xc89a87, emissiveIntensity: .9, roughness: .58, toneMapped: false });
    const recessMaterial = new THREE.MeshStandardMaterial({ color: 0x27191d, roughness: .82 });
    for (const side of [-1, 1]) {
      const addLine = (start, end) => {
        const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), delta = b.clone().sub(a);
        // Dark shallow channel under a narrow luminous insert keeps the line recessed into the fabric.
        const channel = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, delta.length(), 8), recessMaterial);
        channel.position.copy(a.clone().add(b).multiplyScalar(.5)); channel.position.x = side * 11.908;
        channel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()); this.scene.add(channel);
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, delta.length(), 8), lineMaterial);
        mesh.position.copy(a.add(b).multiplyScalar(.5)); mesh.position.x = side * 11.884; mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); this.scene.add(mesh);
      };
      for (let i = 0; i < 3; i++) {
        const z = -11 + i * 10.5;
        addLine([side * 11.884, 1.35, z], [side * 11.884, 8.75, z + 4.8]);
        addLine([side * 11.884, 8.75, z + 4.8], [side * 11.884, 3.15, z + 7.5]);
      }
    }
  }

  addAcousticPanels() {
    const gap = new THREE.MeshStandardMaterial({ color: 0x211317, roughness: .9 });
    const panelWidth = 3.72;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        const z = -16.55 + i * 3.9;
        // Thin fabric-faced panels sit just proud of the structural wall, with shadowed reveals between them.
        this.box('vertical acoustic wall panel', [.045, 10.25, panelWidth], [side * 11.925, 5.18, z], this.mats.wall);
        if (i < 9) this.box('dark acoustic panel reveal', [.052, 10.25, .075], [side * 11.89, 5.18, z + 1.91], gap);
      }
      // Concealed coves wash broad areas of fabric instead of drawing a narrow laser line.
      for (const z of [-8, 8]) {
        for (const y of [1.15, 9.5]) {
          const wash = new THREE.PointLight(0xb34e59, .72, 10, 2);
          wash.position.set(side * 11.2, y, z); this.scene.add(wash);
        }
      }
    }
    this.addWallSpeakers();
  }

  addWallSpeakers() {
    const grilleCanvas = document.createElement('canvas'); grilleCanvas.width = grilleCanvas.height = 128;
    const ctx = grilleCanvas.getContext('2d'); ctx.fillStyle = '#171416'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 5; y < 128; y += 9) for (let x = 5; x < 128; x += 9) {
      ctx.fillStyle = ((x + y) % 18) ? '#393335' : '#090809'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
    const grille = new THREE.CanvasTexture(grilleCanvas); grille.colorSpace = THREE.SRGBColorSpace; grille.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.grilleTexture = grille;
    const shell = new THREE.MeshStandardMaterial({ color: 0x171416, metalness: .18, roughness: .76 });
    const mesh = new THREE.MeshStandardMaterial({ map: grille, color: 0x8c7f80, metalness: .12, roughness: .9 });
    for (const side of [-1, 1]) for (const z of [-7, 7]) {
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(.2, 1.08, .72), shell);
      cabinet.position.set(side * 11.8, 6.35, z); this.scene.add(cabinet);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(.65, .96), mesh);
      face.position.set(side * 11.69, 6.35, z); face.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; this.scene.add(face);
    }
  }

  addProjectorWindow() {
    this.box('projector window bezel', [1.7, .92, .18], [0, 8.63, 20.17], this.mats.brass, .07);
    const glass = new THREE.MeshStandardMaterial({ color: 0x171a1a, emissive: 0x634627, emissiveIntensity: .48, roughness: .28, metalness: .24 });
    this.box('projector room glass', [1.42, .66, .08], [0, 8.63, 20.05], glass, .04);
    for (const x of [-.49, -.16, .16, .49]) {
      const lens = new THREE.Mesh(new THREE.CircleGeometry(.045, 16), new THREE.MeshBasicMaterial({ color: 0xffca80, toneMapped: false }));
      lens.position.set(x, 8.63, 19.99); this.scene.add(lens);
    }
  }

  addCeilingDetails() {
    for (let layer = 0; layer < 3; layer++) {
      const x = 10.9 - layer * 1.9, y = 10.4 - layer * .2;
      for (const sign of [-1, 1]) {
        this.box('recessed ceiling trim', [x, .09, 38 - layer * 3.2], [sign * (12 - x / 2), y, .5], this.mats.black);
        const strip = new THREE.MeshStandardMaterial({
          color: layer === 1 ? 0x30221e : 0x292025,
          emissive: layer === 1 ? 0x75452f : 0x432d37,
          emissiveIntensity: .34,
          roughness: .62,
        });
        this.box('warm ceiling cove reveal', [.11, .045, 35 - layer * 3.2], [sign * (12 - x), y - .08, .5], strip);
      }
      // Close each recessed tier at both ends so the ceiling reads as nested coffers, not isolated rays.
      for (const zSign of [-1, 1]) {
        const rail = new THREE.MeshStandardMaterial({ color: 0x29221f, emissive: 0x55372c, emissiveIntensity: .24, roughness: .7 });
        this.box('stepped ceiling cross trim', [23 - layer * 3.8, .07, .12], [0, 10.35 - layer * .2, .5 + zSign * (18.5 - layer * 1.6)], rail);
      }
    }
    for (const z of [-8, 2, 12]) for (const x of [-7.2, 7.2]) {
      const fixture = new THREE.Group(); fixture.position.set(x, 10.38, z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.13, .2, .08, 12), this.mats.brass); fixture.add(base);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd09a, toneMapped: false })); bulb.position.y = -.08; fixture.add(bulb);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(.105, 20), new THREE.MeshBasicMaterial({ color: 0xffd09a, toneMapped: false }));
      disc.rotation.x = Math.PI / 2; disc.position.y = -.125; fixture.add(disc);
      this.scene.add(fixture);
      const spot = new THREE.SpotLight(0xffc68c, 24, 22, Math.PI / 6, .8, 1.25);
      spot.position.set(x, 10.28, z); spot.target.position.set(x * .45, 1, z - 1.3); this.scene.add(spot, spot.target);
      spot.castShadow = true;
      spot.shadow.mapSize.set(this.weakGPU ? 256 : 512, this.weakGPU ? 256 : 512);
      spot.shadow.radius = 2;
    }
    for (const [x, z] of [[-10.7, -6], [10.7, -6], [-10.7, 9], [10.7, 9]]) {
      const bounce = new THREE.PointLight(0x9b4146, .85, 12, 2);
      bounce.position.set(x, 1.7, z); this.scene.add(bounce);
    }
  }

  addExit() {
    this.box('exit door frame', [2.5, 3.4, .22], [0, 1.8, 20.18], this.mats.brass);
    this.box('exit door', [2.2, 3.15, .12], [0, 1.7, 20.02], new THREE.MeshStandardMaterial({ color: 0x18221c, emissive: 0x14281c, emissiveIntensity: .22, roughness: .75 }));
    const signMat = new THREE.MeshBasicMaterial({ color: 0x65ff9b, toneMapped: false });
    this.box('EXIT sign', [1.1, .27, .05], [0, 3.65, 19.9], signMat);
    const label = this.makeText('EXIT', '#092014', 256, 64);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(.92, .19), new THREE.MeshBasicMaterial({ map: label, transparent: true })); sign.position.set(0, 3.65, 19.85); this.scene.add(sign);
    const light = new THREE.PointLight(0x47ff87, 1.4, 6); light.position.set(0, 3.9, 19.2); this.scene.add(light);
  }

  makeText(text, color = '#ffffff', width = 512, height = 128) {
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.font = 'bold 54px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, width / 2, height / 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  buildSeats() {
    const red = this.material(this.leather_red, {
      clearcoat: .25, clearcoatRoughness: .42, roughness: .45, color: 0xffffff,
      emissive: 0x240309, emissiveIntensity: .34, sheen: .5,
      sheenColor: new THREE.Color(0x9b5744), sheenRoughness: .55, normalScale: new THREE.Vector2(.72, .72),
    });
    const grey = this.material(this.leather_grey, {
      clearcoat: .25, clearcoatRoughness: .42, roughness: .45, color: 0xd8d6d0,
      emissive: 0x514d45, emissiveIntensity: .54, sheen: .5,
      sheenColor: new THREE.Color(0xa58a74), sheenRoughness: .58, normalScale: new THREE.Vector2(.72, .72),
    });
    const frame = new THREE.MeshPhysicalMaterial({ color: 0x181416, metalness: .12, roughness: .45 });
    const cup = new THREE.MeshPhysicalMaterial({ color: 0x43302a, metalness: .6, roughness: .3 });
    const cupInterior = new THREE.MeshStandardMaterial({ color: 0x0a0809, roughness: .34, metalness: .12 });
    const seam = new THREE.MeshStandardMaterial({ color: 0x54212a, roughness: .65, metalness: .02 });
    const rows = [];
    for (let row = 0; row < 10; row++) {
      const z = -5.2 + row * 1.8;
      const y = .56 + row * .3;
      for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
        const x = side * (2.15 + i * .91);
        const label = `${String.fromCharCode(65 + row)}${i + 1}${side > 0 ? 'R' : 'L'}`;
        const hash = [...label].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 17);
        const tint = .94 + ((hash % 1000) / 1000) * .12;
        const backTilt = (((hash >>> 4) % 1000) / 1000) * THREE.MathUtils.degToRad(3);
        rows.push({ x, y, z, row, label, tint, backTilt, material: row < 4 ? red : grey });
      }
    }
    this.seats = rows;
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext('2d');
    const contactGradient = shadowContext.createRadialGradient(64, 64, 5, 64, 64, 62);
    contactGradient.addColorStop(0, 'rgba(4,2,4,0.32)'); contactGradient.addColorStop(.58, 'rgba(8,3,7,0.18)'); contactGradient.addColorStop(1, 'rgba(8,3,7,0)');
    shadowContext.fillStyle = contactGradient; shadowContext.fillRect(0, 0, 128, 128);
    this.contactShadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadowMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.25, 1.08),
      new THREE.MeshBasicMaterial({ map: this.contactShadowTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      rows.filter(seat => seat.row === 0).length,
    );
    shadowMesh.name = 'first-row contact shadows'; shadowMesh.renderOrder = 1;
    const shadowTransform = new THREE.Object3D();
    rows.filter(seat => seat.row === 0).forEach((seat, index) => {
      shadowTransform.position.set(seat.x, .306, seat.z);
      shadowTransform.rotation.set(-Math.PI / 2, 0, 0); shadowTransform.updateMatrix();
      shadowMesh.setMatrixAt(index, shadowTransform.matrix);
    });
    shadowMesh.instanceMatrix.needsUpdate = true; this.scene.add(shadowMesh);
    const geometries = {
      base: new RoundedBoxGeometry(.72, .35, .62, 4, .05),
      cushion: new RoundedBoxGeometry(.75, .24, .7, 4, .05),
      back: new RoundedBoxGeometry(.74, .98, .24, 4, .05),
      arm: new RoundedBoxGeometry(.17, .58, .72, 4, .05),
      foot: new RoundedBoxGeometry(.67, .12, .36, 4, .05),
      headrest: new THREE.SphereGeometry(1, 24, 16),
      seam: new RoundedBoxGeometry(.58, .014, .014, 3, .006),
      cup: new THREE.CylinderGeometry(.085, .073, .09, 24, 1, true),
      cupBottom: new THREE.CircleGeometry(.061, 20),
      cupRim: new THREE.TorusGeometry(.08, .012, 8, 20),
    };
    geometries.headrest.scale(.33, .21, .16);
    const partDefs = [
      ['base', geometries.base, frame, [0, .37, .02], [1, 1, 1]],
      ['cushion', geometries.cushion, null, [0, .56, -.04], [1, 1, 1]],
      ['back', geometries.back, null, [0, 1.17, .26], [1, 1, 1]],
      ['headrest', geometries.headrest, null, [0, 1.65, .31], [1, 1, 1]],
      ['seam', geometries.seam, seam, [0, 1.38, .39], [1, 1, 1]],
      ['armL', geometries.arm, null, [-.4, .73, .02], [1, 1, 1]],
      ['armR', geometries.arm, null, [.4, .73, .02], [1, 1, 1]],
      ['foot', geometries.foot, null, [0, .34, -.48], [1, 1, 1]],
      ['cupL', geometries.cup, cup, [-.4, .955, -.03], [1, 1, 1]],
      ['cupR', geometries.cup, cup, [.4, .955, -.03], [1, 1, 1]],
      ['cupBottomL', geometries.cupBottom, cupInterior, [-.4, .91, -.03], [1, 1, 1]],
      ['cupBottomR', geometries.cupBottom, cupInterior, [.4, .91, -.03], [1, 1, 1]],
      ['cupRimL', geometries.cupRim, cup, [-.4, 1.005, -.03], [1, 1, 1]],
      ['cupRimR', geometries.cupRim, cup, [.4, 1.005, -.03], [1, 1, 1]],
    ];
    for (const part of partDefs) {
      const [name, geometry, fixedMat, offset] = part;
      const redRows = rows.filter(s => s.row < 4), greyRows = rows.filter(s => s.row >= 4);
      const types = fixedMat ? [[rows, fixedMat]] : [[redRows, red], [greyRows, grey]];
      for (const [data, mat] of types) {
        const inst = new THREE.InstancedMesh(geometry, mat, data.length);
        inst.name = `seat ${name}`; inst.castShadow = !this.weakGPU; inst.receiveShadow = true; inst.userData.seatPart = true;
        const dummy = new THREE.Object3D();
        data.forEach((seat, idx) => {
          dummy.position.set(seat.x + offset[0], seat.y + offset[1], seat.z + offset[2]);
          const reclines = ['back', 'headrest', 'seam'].includes(name);
          dummy.rotation.set(name.startsWith('cupBottom') || name.startsWith('cupRim') ? -Math.PI / 2 : reclines ? seat.backTilt : 0, 0, 0);
          dummy.updateMatrix(); inst.setMatrixAt(idx, dummy.matrix);
          if (mat === red || mat === grey) inst.setColorAt(idx, new THREE.Color(seat.tint, seat.tint, seat.tint));
          if (name === 'cushion') this.seatHits.push({ mesh: inst, id: idx, data });
        });
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        this.scene.add(inst);
      }
    }
    this.addSeatNumbers(rows);
  }

  addSeatNumbers(seats) {
    const columns = 20, rowCount = 10, cellWidth = 128, cellHeight = 64;
    const canvas = document.createElement('canvas'); canvas.width = columns * cellWidth; canvas.height = rowCount * cellHeight;
    const context = canvas.getContext('2d');
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = '700 27px Arial, sans-serif';
    for (const seat of seats) {
      const column = (seat.label.endsWith('R') ? 10 : 0) + Number(seat.label.match(/\d+/)?.[0]) - 1;
      const centerX = column * cellWidth + cellWidth / 2, centerY = seat.row * cellHeight + cellHeight / 2;
      const number = seat.label;
      context.fillStyle = 'rgba(12, 6, 6, 0.85)'; context.fillText(number, centerX + 1.5, centerY + 2);
      context.fillStyle = '#f1d3a9'; context.fillText(number, centerX, centerY);
      context.fillStyle = 'rgba(255, 242, 220, 0.8)'; context.fillText(number, centerX - 1, centerY - 1);
    }
    this.seatNumberAtlas = new THREE.CanvasTexture(canvas);
    this.seatNumberAtlas.colorSpace = THREE.SRGBColorSpace;
    this.seatNumberAtlas.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const labelGeometry = new THREE.PlaneGeometry(.2, .07);
    const uvOffsets = new Float32Array(seats.length * 2);
    const labels = new THREE.InstancedMesh(labelGeometry, new THREE.MeshPhysicalMaterial({
      map: this.seatNumberAtlas, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      roughness: .38, metalness: .12, clearcoat: .25, clearcoatRoughness: .4,
    }), seats.length);
    labelGeometry.setAttribute('instanceUvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
    labels.material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 instanceUvOffset;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (mapTransform * vec3(uv * vec2(0.05, 0.1) + instanceUvOffset, 1.0)).xy;\n#endif');
    };
    labels.material.customProgramCacheKey = () => 'cinema-embossed-seat-numbers-v1';
    const dummy = new THREE.Object3D();
    seats.forEach((seat, index) => {
      const column = (seat.label.endsWith('R') ? 10 : 0) + Number(seat.label.match(/\d+/)?.[0]) - 1;
      uvOffsets[index * 2] = column / columns;
      uvOffsets[index * 2 + 1] = 1 - (seat.row + 1) / rowCount;
      dummy.position.set(seat.x, seat.y + 1.65, seat.z + .478);
      dummy.rotation.set(seat.backTilt, 0, 0); dummy.updateMatrix(); labels.setMatrixAt(index, dummy.matrix);
    });
    labels.instanceMatrix.needsUpdate = true;
    labelGeometry.attributes.instanceUvOffset.needsUpdate = true;
    labels.name = 'embossed seat numbers'; labels.castShadow = false; labels.receiveShadow = false; this.scene.add(labels);
  }

  buildScreen() {
    const makeCurvedPanel = (width, height, depth, segments) => {
      const vertices = [], uvs = [], indices = [];
      for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix <= segments; ix++) {
        const u = ix / segments, x = (u - .5) * width;
        vertices.push(x, (iy - .5) * height, depth * (x / (width / 2)) ** 2);
        uvs.push(u, iy);
      }
      for (let ix = 0; ix < segments; ix++) {
        const a = ix, b = ix + 1, c = segments + 1 + ix, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
    };
    const screenGeometry = makeCurvedPanel(13.5, 7.6, .72, 48);
    this.screen = new THREE.Mesh(screenGeometry, new THREE.MeshBasicMaterial({ color: 0x0a0809, side: THREE.DoubleSide }));
    this.screen.position.set(0, 5.3, -17.1); this.scene.add(this.screen);
    this.video = document.createElement('video'); this.video.src = `${A}video/screen_loop.mp4`; this.video.loop = true; this.video.muted = true; this.video.playsInline = true; this.video.crossOrigin = 'anonymous';
    this.video.preload = 'auto';
    this.video.addEventListener('error', () => this.callbacks.assetError?.(`${A}video/screen_loop.mp4`));
    this.videoTexture = new THREE.VideoTexture(this.video); this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.screenMesh = new THREE.Mesh(makeCurvedPanel(13.48, 7.59, .72, 48), new THREE.MeshBasicMaterial({ map: this.videoTexture, side: THREE.DoubleSide, toneMapped: false }));
    this.screenMesh.position.copy(this.screen.position).add(new THREE.Vector3(0, 0, .015)); this.scene.add(this.screenMesh);
    const idle = new THREE.Mesh(new THREE.PlaneGeometry(3.55, 1.22), new THREE.MeshBasicMaterial({ map: this.logo, transparent: true, toneMapped: false }));
    idle.position.set(0, 5.3, -16.9); this.scene.add(idle); this.idleLogo = idle;
    this.screenMesh.visible = true;
    this.idleLogo.visible = false;
    this.video.play().catch(() => this.callbacks.toast?.('Screen playback will start after interaction'));
    const screenBounce = new THREE.RectAreaLight(0x87628c, 4.5, 12.5, 6.8);
    screenBounce.position.set(0, 5.2, -13.7); screenBounce.lookAt(0, 2.4, -5.5); this.scene.add(screenBounce);
    this.screenLight = new THREE.PointLight(0xffc1a1, 8, 24, 2); this.screenLight.position.set(0, 4.5, -14.3); this.scene.add(this.screenLight);
    this.screenGlow = new THREE.PointLight(0xf06a60, 2.5, 14, 2); this.screenGlow.position.set(0, 2.8, -10.6); this.scene.add(this.screenGlow);
  }

  buildLightsAndDust() {
    const hazeMaterial = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xf4b886) }, strength: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 color; uniform float strength; varying vec2 vUv; void main(){float edge=1.0-smoothstep(.08,.98,abs(vUv.x-.5)*2.0);float ends=smoothstep(0.0,.14,vUv.y)*(1.0-smoothstep(.78,1.0,vUv.y));float cloud=0.72+0.28*sin(vUv.y*17.0+vUv.x*8.0);float alpha=edge*ends*cloud*strength;gl_FragColor=vec4(color,alpha);}',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const from = new THREE.Vector3(0, 8.62, 19.75), to = new THREE.Vector3(0, 5.1, -16.1);
    const beamLength = from.distanceTo(to), beam = new THREE.Mesh(new THREE.CylinderGeometry(3.8, .08, beamLength, 32, 1, true), hazeMaterial);
    beam.position.copy(from).add(to).multiplyScalar(.5); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    hazeMaterial.uniforms.strength.value = this.weakGPU ? .012 : .019; this.scene.add(beam); this.projectorHaze = beam;
    if (!this.weakGPU) {
      const spotHazeMaterial = hazeMaterial.clone(); spotHazeMaterial.uniforms.strength.value = .004;
      for (const z of [-8, 2, 12]) for (const x of [-7.2, 7.2]) {
        const start = new THREE.Vector3(x, 10.1, z), end = new THREE.Vector3(x * .45, 1.4, z - 1.3);
        const volume = new THREE.Mesh(new THREE.CylinderGeometry(1.25, .08, start.distanceTo(end), 20, 1, true), spotHazeMaterial);
        volume.position.copy(start).add(end).multiplyScalar(.5); volume.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
        this.scene.add(volume);
      }
    }
  }

  createPostProcessing() {
    if (this.weakGPU) return;
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bokeh = new BokehPass(this.scene, this.camera, { focus: 6, aperture: .000012, maxblur: .003 });
      this.composer.addPass(bokeh);
      if (innerWidth > 900) {
        const ssao = new SSAOPass(this.scene, this.camera, Math.ceil(innerWidth * .65), Math.ceil(innerHeight * .65));
        ssao.kernelRadius = 14; ssao.minDistance = .004; ssao.maxDistance = .22; this.composer.addPass(ssao);
      }
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .2, .48, .8));
      const grade = new ShaderPass(VIGNETTE_GRAIN); this.composer.addPass(grade); this.grade = grade;
      this.composer.addPass(new OutputPass());
    } catch (error) { this.composer?.dispose?.(); this.composer = null; }
  }

  bind() {
    this.onResize = () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.weakGPU ? 1.1 : 1.7)); this.renderer.setSize(innerWidth, innerHeight); this.composer?.setSize(innerWidth, innerHeight); };
    addEventListener('resize', this.onResize);
    this.onKey = e => { if (e.code === 'Escape' && this.sitting) this.stand(); this.keys.add(e.code); };
    this.onKeyUp = e => this.keys.delete(e.code);
    addEventListener('keydown', this.onKey); addEventListener('keyup', this.onKeyUp);
    this.onMouseMove = e => {
      if (this.pointerLocked && this.walking && !this.sitting) { this.yaw -= e.movementX * .0022; this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * .0018, -1.05, .7); }
    };
    document.addEventListener('mousemove', this.onMouseMove);
    this.onLockChange = () => { this.pointerLocked = document.pointerLockElement === this.canvas; };
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.onClick = e => { if (!this.walking || this.isOrbit) { this.pick(e); return; } if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.(); this.pick(e); };
    this.canvas.addEventListener('click', this.onClick);
    this.orbit.addEventListener('change', () => {});
    this.onContext = e => e.preventDefault(); this.canvas.addEventListener('contextmenu', this.onContext);
  }

  pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.screen, false)[0];
    if (hit && hit.distance < 35) { this.toggleVideo(); return; }
    const seatHit = this.raycaster.intersectObjects(this.seatHits.map(x => x.mesh), false)[0];
    if (!seatHit || seatHit.instanceId == null) return;
    const entry = this.seatHits.find(x => x.mesh === seatHit.object);
    const seat = entry?.data[seatHit.instanceId];
    if (seat) this.sit(seat);
  }

  sit(seat) {
    this.sitting = true; this.pointerLocked && document.exitPointerLock?.();
    this.camera.position.set(seat.x, seat.y + 1.25, seat.z + .58);
    this.yaw = 0; this.pitch = -.09; this.syncRotation();
    this.callbacks.toast?.(`You’re seated · ${seat.label}`);
  }

  stand() {
    this.sitting = false; this.camera.position.y += .15;
    this.callbacks.toast?.('You’re back on your feet');
  }

  toggleVideo() {
    if (this.video.paused) { this.video.play().then(() => { this.screenMesh.visible = true; this.idleLogo.visible = false; }).catch(() => this.callbacks.toast?.('Screen playback is unavailable')); }
    else { this.video.pause(); this.screenMesh.visible = false; this.idleLogo.visible = true; }
  }

  setMode(mode) {
    this.isOrbit = mode === 'orbit'; this.orbit.enabled = this.isOrbit; this.walking = !this.isOrbit;
    if (this.isOrbit && this.pointerLocked) document.exitPointerLock?.();
  }

  syncRotation() {
    this.euler.set(this.pitch, this.yaw, 0); this.camera.quaternion.setFromEuler(this.euler);
  }

  update(dt, t) {
    this.orbit.update();
    if (!this.walking && !this.isOrbit) {
      this.camera.position.copy(this.introCameraPosition);
      this.camera.position.x += Math.sin(t * .22) * .045;
      this.camera.position.y += Math.sin(t * .17) * .018;
      this.camera.lookAt(this.introLookTarget.x + Math.sin(t * .18) * .025, this.introLookTarget.y, this.introLookTarget.z);
    }
    if (this.walking && !this.sitting) {
      const f = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - this.touchVector.y;
      const s = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) + this.touchVector.x;
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const move = forward.multiplyScalar(f).add(right.multiplyScalar(s));
      if (move.lengthSq() > 1) move.normalize();
      const speed = this.keys.has('ShiftLeft') ? 4 : 2.2;
      const next = this.camera.position.clone().addScaledVector(move, speed * dt);
      next.x = THREE.MathUtils.clamp(next.x, -10.7, 10.7); next.z = THREE.MathUtils.clamp(next.z, -14.2, 19.2);
      for (const seat of this.seats) {
        const dx = next.x - seat.x, dz = next.z - seat.z;
        if (Math.abs(dx) < .65 && Math.abs(dz) < .68) {
          const len = Math.hypot(dx, dz) || .001, push = .68 - len;
          next.x += dx / len * push; next.z += dz / len * push;
        }
      }
      // Keep the player inside the carpeted aisles and clear of the screen and rear door.
      const floor = next.z < -5 ? 0.1 : Math.min(4.25, Math.floor((next.z + 5.2) / 1.8) * .3 + .3);
      this.camera.position.x = next.x; this.camera.position.z = next.z;
      this.camera.position.y = floor + 1.68 + (move.lengthSq() > 0 ? Math.sin(t * 9) * .035 : 0);
      this.syncRotation();
    }
    if (this.grade) this.grade.uniforms.time.value = t;
    this.screenLight.intensity = 14.5 + Math.sin(t * 1.2) * .35;
  }

  animate() {
    this.raf = requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), .05), t = this.clock.elapsedTime;
    this.update(dt, t);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf); removeEventListener('resize', this.onResize); removeEventListener('keydown', this.onKey); removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove); document.removeEventListener('pointerlockchange', this.onLockChange);
    this.canvas.removeEventListener('click', this.onClick); this.canvas.removeEventListener('contextmenu', this.onContext);
    this.orbit.dispose(); this.video.pause(); this.video.removeAttribute('src'); this.video.load();
    this.scene.traverse(object => { object.geometry?.dispose?.(); if (Array.isArray(object.material)) object.material.forEach(m => m.dispose()); else object.material?.dispose?.(); });
    for (const key of ['leather_red','leather_grey','carpet_red','wall_fabric','ceiling_black','metal_brushed']) for (const texture of Object.values(this[key] || {})) texture.dispose();
    for (const texture of this.carpetTextureClones || []) texture.dispose();
    this.aisleGlowTexture?.dispose(); this.contactShadowTexture?.dispose(); this.seatNumberAtlas?.dispose(); this.grilleTexture?.dispose();
    this.arrow?.dispose(); this.wallLine?.dispose(); this.logo?.dispose(); this.videoTexture?.dispose(); this.environment?.dispose(); this.composer?.dispose?.(); this.renderer.dispose();
  }
}
