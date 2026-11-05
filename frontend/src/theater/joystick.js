import * as THREE from 'three';
import './joystick.css';

const STORAGE_KEY = 'theater-joystick-visible';

/**
 * Touch and keyboard locomotion for the booking theater camera.
 * The stick handles translation; OrbitControls remains responsible for orbiting.
 */
export class TheaterJoystick {
  constructor(container, { camera, controls, room, size, speed = 5.5, deadzone = 0.1, damping = 11 } = {}) {
    this.container = container;
    this.camera = camera;
    this.controls = controls;
    this.room = room;
    this.speed = speed;
    this.deadzone = deadzone;
    this.damping = damping;
    this.size = size;
    this.pointerId = null;
    this.pointerVector = { x: 0, y: 0 };
    this.keyboard = new Set();
    this.smoothInput = { x: 0, y: 0 };
    this.canvasPointers = new Map();
    this.lookPointer = null;
    this.previousRotateEnabled = true;
    this.destroyed = false;

    this.root = document.createElement('div');
    this.root.className = 'theater-joystick';
    this.root.innerHTML = `
      <button class="theater-joystick-toggle" type="button" aria-label="Show movement joystick" aria-pressed="false" title="Movement joystick">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 9.1h9.6a4.2 4.2 0 0 1 4.1 4.7l-.2 1.2a2.4 2.4 0 0 1-3.9 1.4l-1.7-1.3H8.9l-1.7 1.3a2.4 2.4 0 0 1-3.9-1.4l-.2-1.2a4.2 4.2 0 0 1 4.1-4.7Z"/><path d="M8 11.4v3.2M6.4 13h3.2M15.4 12.2h.1M17.7 14.2h.1"/></svg>
      </button>
      <div class="theater-joystick-pad" role="application" aria-label="Move through the theater" tabindex="0">
        <span class="theater-joystick-ring" aria-hidden="true"></span>
        <span class="theater-joystick-knob" aria-hidden="true"></span>
      </div>`;
    this.container.append(this.root);
    this.toggle = this.root.querySelector('.theater-joystick-toggle');
    this.pad = this.root.querySelector('.theater-joystick-pad');
    this.knob = this.root.querySelector('.theater-joystick-knob');
    if (size) this.root.style.setProperty('--theater-stick-size', `${size}px`);

    this.enabled = this.readInitialState();
    this.applyEnabledState(false);

    this.onToggle = () => this.setEnabled(!this.enabled);
    this.onPointerDown = (event) => this.pointerDown(event);
    this.onPointerMove = (event) => this.pointerMove(event);
    this.onPointerUp = (event) => this.pointerEnd(event);
    this.onKeyDown = (event) => this.keyDown(event);
    this.onKeyUp = (event) => this.keyUp(event);
    this.onBlur = () => this.keyboard.clear();
    this.onCanvasDown = (event) => this.trackCanvasPointer(event);
    this.onCanvasMove = (event) => this.rotateFromCanvasPointer(event);
    this.onCanvasEnd = (event) => this.endCanvasPointer(event);

    this.toggle.addEventListener('click', this.onToggle);
    this.pad.addEventListener('pointerdown', this.onPointerDown);
    this.pad.addEventListener('pointermove', this.onPointerMove);
    this.pad.addEventListener('pointerup', this.onPointerUp);
    this.pad.addEventListener('pointercancel', this.onPointerUp);
    this.pad.addEventListener('lostpointercapture', this.onPointerUp);
    this.pad.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    // If a second touch is on the canvas while the stick is held, OrbitControls
    // rotation is temporarily disabled and this pointer supplies the look input.
    const canvas = controls.domElement;
    canvas.addEventListener('pointerdown', this.onCanvasDown);
    canvas.addEventListener('pointermove', this.onCanvasMove);
    canvas.addEventListener('pointerup', this.onCanvasEnd);
    canvas.addEventListener('pointercancel', this.onCanvasEnd);
  }

  readInitialState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch { /* storage can be unavailable in private browsing */ }
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
  }

  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.releaseStick();
    try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* persistence is optional */ }
    this.applyEnabledState(true);
  }

  applyEnabledState(animate) {
    this.root.classList.toggle('is-visible', this.enabled);
    if (!animate) this.root.classList.add('skip-motion');
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    this.toggle.setAttribute('aria-label', `${this.enabled ? 'Hide' : 'Show'} movement joystick`);
    this.pad.setAttribute('aria-hidden', String(!this.enabled));
    this.pad.tabIndex = this.enabled ? 0 : -1;
    if (!animate) requestAnimationFrame(() => this.root.classList.remove('skip-motion'));
  }

  pointerDown(event) {
    if (!this.enabled || this.pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.pad.classList.add('is-active');
    this.previousRotateEnabled = this.controls.enableRotate;
    this.controls.enableRotate = false;
    this.lookPointer = this.canvasPointers.keys().next().value ?? null;
    try { this.pad.setPointerCapture(event.pointerId); } catch { /* pointer may already be canceled */ }
    this.updatePointerVector(event);
  }

  pointerMove(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.updatePointerVector(event);
  }

  updatePointerVector(event) {
    const rect = this.pad.getBoundingClientRect();
    const maxRadius = Math.max(1, rect.width * 0.5 - this.knob.offsetWidth * 0.5 - 5);
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > maxRadius ? maxRadius / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    this.knob.style.transform = `translate(${x}px, ${y}px)`;
    this.pointerVector.x = x / maxRadius;
    this.pointerVector.y = -y / maxRadius;
  }

  pointerEnd(event) {
    if (event.pointerId !== this.pointerId) return;
    this.releaseStick();
  }

  releaseStick() {
    if (this.pointerId === null) return;
    const activePointer = this.pointerId;
    this.pointerId = null;
    this.pointerVector.x = 0;
    this.pointerVector.y = 0;
    this.pad.classList.remove('is-active');
    this.knob.style.transform = '';
    if (this.controls) this.controls.enableRotate = this.previousRotateEnabled;
    this.lookPointer = null;
    this.canvasPointers.clear();
    try { if (this.pad.hasPointerCapture(activePointer)) this.pad.releasePointerCapture(activePointer); } catch { /* already released */ }
  }

  keyDown(event) {
    if (this.container.closest('[hidden]')) return;
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) return;
    this.keyboard.add(key);
    if (key.startsWith('arrow')) event.preventDefault();
  }

  keyUp(event) { this.keyboard.delete(event.key.toLowerCase()); }

  getTargetInput() {
    if (this.container.closest('[hidden]')) {
      this.keyboard.clear();
      return { x: 0, y: 0 };
    }
    let x = this.pointerVector.x;
    let y = this.pointerVector.y;
    if (this.keyboard.has('a') || this.keyboard.has('arrowleft')) x -= 1;
    if (this.keyboard.has('d') || this.keyboard.has('arrowright')) x += 1;
    if (this.keyboard.has('w') || this.keyboard.has('arrowup')) y += 1;
    if (this.keyboard.has('s') || this.keyboard.has('arrowdown')) y -= 1;
    const length = Math.hypot(x, y);
    if (length <= this.deadzone) return { x: 0, y: 0 };
    const magnitude = Math.min(1, (length - this.deadzone) / (1 - this.deadzone));
    return { x: (x / length) * magnitude, y: (y / length) * magnitude };
  }

  update(deltaSeconds) {
    if (this.destroyed) return;
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
    const target = this.getTargetInput();
    const alpha = 1 - Math.exp(-this.damping * dt);
    this.smoothInput.x += (target.x - this.smoothInput.x) * alpha;
    this.smoothInput.y += (target.y - this.smoothInput.y) * alpha;
    const magnitude = Math.hypot(this.smoothInput.x, this.smoothInput.y);
    if (magnitude < 0.001) return;

    const forward = this.camera.getWorldDirection(this._forward || (this._forward = new THREE.Vector3()));
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) return;
    forward.normalize();
    const right = this._right || (this._right = forward.clone());
    right.crossVectors(forward, this.camera.up).normalize();
    const moveX = (right.x * this.smoothInput.x + forward.x * this.smoothInput.y) * this.speed * dt;
    const moveZ = (right.z * this.smoothInput.x + forward.z * this.smoothInput.y) * this.speed * dt;

    const oldX = this.camera.position.x;
    const oldZ = this.camera.position.z;
    const nextX = THREEClamp(oldX + moveX, -this.room.width / 2 + 0.65, this.room.width / 2 - 0.65);
    const nextZ = THREEClamp(oldZ + moveZ, 0.8, this.room.depth - 0.65);
    const appliedX = nextX - oldX;
    const appliedZ = nextZ - oldZ;
    const nextY = THREEClamp(this.camera.position.y, 1.15, this.room.height - 0.35);
    this.camera.position.set(nextX, nextY, nextZ);
    this.controls.target.x += appliedX;
    this.controls.target.z += appliedZ;
  }

  trackCanvasPointer(event) {
    this.canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointerId !== null && this.lookPointer === null) this.lookPointer = event.pointerId;
  }

  rotateFromCanvasPointer(event) {
    const previous = this.canvasPointers.get(event.pointerId);
    if (!previous) return;
    this.canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointerId === null || event.pointerId !== this.lookPointer) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const radius = offset.length();
    if (!radius) return;
    const spherical = this._spherical || (this._spherical = new THREE.Spherical());
    spherical.setFromVector3(offset);
    spherical.theta -= dx * 0.0045;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.0045, 0.08, Math.PI / 2 - 0.025);
    offset.setFromSpherical(spherical);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
    this.camera.updateMatrixWorld();
  }

  endCanvasPointer(event) {
    this.canvasPointers.delete(event.pointerId);
    if (this.lookPointer === event.pointerId) this.lookPointer = this.canvasPointers.keys().next().value ?? null;
  }

  dispose() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.releaseStick();
    this.toggle.removeEventListener('click', this.onToggle);
    this.pad.removeEventListener('pointerdown', this.onPointerDown);
    this.pad.removeEventListener('pointermove', this.onPointerMove);
    this.pad.removeEventListener('pointerup', this.onPointerUp);
    this.pad.removeEventListener('pointercancel', this.onPointerUp);
    this.pad.removeEventListener('lostpointercapture', this.onPointerUp);
    this.pad.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    const canvas = this.controls.domElement;
    canvas.removeEventListener('pointerdown', this.onCanvasDown);
    canvas.removeEventListener('pointermove', this.onCanvasMove);
    canvas.removeEventListener('pointerup', this.onCanvasEnd);
    canvas.removeEventListener('pointercancel', this.onCanvasEnd);
    this.root.remove();
  }
}

const THREEClamp = (value, min, max) => THREE.MathUtils.clamp(value, min, max);

