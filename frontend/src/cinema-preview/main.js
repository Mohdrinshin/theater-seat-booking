import './style.css';
import { CinemaScene } from './scene.js';

const $ = id => document.getElementById(id);
const loading = $('loading');
const bar = $('load-progress');
const status = $('load-status');
const failed = new Set();
let audio;
let scene;

function showAssetError(path) {
  failed.add(path);
  const box = $('cinema-error');
  box.hidden = false;
  box.textContent = `Could not load asset: ${path}`;
  console.error(`[cinema asset missing] ${path}`);
}

scene = new CinemaScene($('cinema-canvas'), {
  progress: (fraction, path) => {
    bar.style.width = `${Math.round(fraction * 100)}%`;
    status.textContent = `Loading ${path.split('/').at(-1)}…`;
  },
  assetError: showAssetError,
  assetsReady: () => { status.textContent = 'Finishing the room…'; bar.style.width = '88%'; },
  toast: message => {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(el.timer); el.timer = setTimeout(() => el.classList.remove('show'), 2100);
  },
  modeChanged: mode => {
    document.querySelectorAll('.mode').forEach(item => item.classList.toggle('active', item.dataset.mode === mode));
    $('reticle').classList.toggle('visible', mode === 'walk');
    $('help-pill').classList.add('visible');
    $('help-pill').innerHTML = 'W A S D <span>move</span><i>·</i> drag <span>look</span><i>·</i> double-click <span>seat preview</span><b>ESC</b><span>stand</span>';
  },
});

audio = new Audio('/assets/audio/ambience.mp3');
audio.loop = true; audio.volume = .32;
audio.addEventListener('error', () => showAssetError('/assets/audio/ambience.mp3'));

async function start() {
await scene.ready;
bar.style.width = '100%';
status.textContent = 'Your auditorium is ready';
setTimeout(() => loading.classList.add('done'), 350);

$('enter-button').addEventListener('click', async () => {
  $('intro').style.opacity = '0'; $('intro').style.pointerEvents = 'none';
  $('controls').classList.add('visible'); $('reticle').classList.add('visible'); $('help-pill').classList.add('visible');
  $('enter-button').disabled = true;
  scene.setMode('walk');
  try { await audio.play(); } catch { /* browser will retry on a later user gesture */ }
  try { await scene.video.play(); scene.screenMesh.visible = true; scene.idleLogo.visible = false; }
  catch { /* video remains on the supplied idle logo until playback is allowed */ }
  setTimeout(() => { $('intro').hidden = true; }, 450);
});

document.querySelectorAll('.mode').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.mode').forEach(item => item.classList.toggle('active', item === button));
  scene.setMode(button.dataset.mode);
  $('reticle').classList.toggle('visible', button.dataset.mode === 'walk');
  const help = $('help-pill');
  help.classList.add('visible');
  help.innerHTML = button.dataset.mode === 'orbit'
    ? 'DRAG <span>rotate</span><i>·</i> RIGHT-DRAG <span>pan</span><i>·</i> SCROLL <span>zoom</span><i>·</i> WASD <span>move</span><i>·</i> Q/E <span>height</span>'
    : 'W A S D <span>move</span><i>·</i> drag <span>look</span><i>·</i> double-click <span>seat preview</span><b>ESC</b><span>stand</span>';
}));

$('back-row').addEventListener('click', () => {
  scene.setMode('orbit');
  document.querySelectorAll('.mode').forEach(item => item.classList.toggle('active', item.dataset.mode === 'orbit'));
  scene.camera.position.set(0, 6.8, 20.2);
  scene.orbit.target.set(0, 2.9, -15);
  scene.orbit.update();
  $('reticle').classList.remove('visible');
  $('help-pill').classList.add('visible');
  $('help-pill').innerHTML = 'DRAG <span>rotate</span><i>·</i> RIGHT-DRAG <span>pan</span><i>·</i> SCROLL <span>zoom</span><i>·</i> WASD <span>move</span><i>·</i> Q/E <span>height</span>';
});

$('audio-toggle').addEventListener('click', async () => {
  if (audio.paused) { try { await audio.play(); } catch {} }
  audio.muted = !audio.muted;
  $('audio-toggle').textContent = audio.muted ? '×' : '♫';
  $('audio-toggle').setAttribute('aria-label', audio.muted ? 'Unmute ambience' : 'Mute ambience');
});

// Touch movement pad for mobile; camera yaw is controlled by horizontal swipes.
const pad = $('touch-pad'); const stick = $('touch-stick'); let touchId = null;
pad.addEventListener('pointerdown', e => { touchId = e.pointerId; pad.setPointerCapture(touchId); moveStick(e); });
pad.addEventListener('pointermove', e => { if (e.pointerId === touchId) moveStick(e); });
const resetStick = () => { touchId = null; stick.style.transform = ''; scene.touchVector.set(0, 0); };
pad.addEventListener('pointerup', resetStick); pad.addEventListener('pointercancel', resetStick);
function moveStick(e) {
  const r = pad.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2); const dy = e.clientY - (r.top + r.height / 2);
  const len = Math.hypot(dx, dy), cap = 31, scale = len > cap ? cap / len : 1;
  stick.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
  scene.touchVector.set(dx * scale / cap, dy * scale / cap);
}
let touchLookX = null; let touchLookY = null;
document.addEventListener('touchstart', e => { if (e.touches[0] && e.touches[0].clientX > innerWidth * .45) { touchLookX = e.touches[0].clientX; touchLookY = e.touches[0].clientY; } }, { passive: true });
document.addEventListener('touchmove', e => {
  const touch = e.touches[0]; if (touch && touchLookX != null && scene.walking && !scene.sitting) {
    scene.yaw -= (touch.clientX - touchLookX) * .008; scene.pitch = Math.max(-1.05, Math.min(.7, scene.pitch - (touch.clientY - touchLookY) * .008)); touchLookX = touch.clientX; touchLookY = touch.clientY; scene.syncRotation();
  }
}, { passive: true });
document.addEventListener('touchend', () => { touchLookX = null; touchLookY = null; }, { passive: true });

window.addEventListener('pagehide', () => { audio.pause(); scene.dispose(); }, { once: true });
}
start();
