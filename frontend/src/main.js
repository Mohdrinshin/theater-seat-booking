import * as THREE from 'three';
import './style.css';
import { getHealth, getSeats, getShows, bookSeats } from './api.js';
import { createTheater } from './theater/scene.js';
import { SeatManager } from './theater/seats.js';
import { renderPanel } from './ui/panel.js';

const theater = createTheater(document.getElementById('canvas-wrap'));
const seats = new SeatManager(theater.scene);
const panel = document.getElementById('panel');
const btnOrbit = document.getElementById('btn-orbit');
const btnSeat = document.getElementById('btn-seat');

let show = null;
let busy = false;
let loadError = '';

async function load() {
  loadError = '';
  refreshUI();
  try {
    await getHealth();
    const shows = await getShows();
    if (!shows.length) throw new Error('No shows are available yet.');
    show = shows[0];
    seats.build(await getSeats(show.id));
  } catch (e) {
    show = null;
    seats.build([]);
    loadError = 'Cannot reach server, retry';
    console.error('Unable to load theater data:', e);
  }
  refreshUI();
}

function refreshUI() {
  renderPanel(panel, { show, seats: seats.selectedSeats(), busy, error: loadError, onBook: book, onRetry: load });
  btnSeat.disabled = seats.selected.size === 0;
}

async function book() {
  if (!show) return;
  busy = true; refreshUI();
  try {
    await bookSeats(show.id, [...seats.selected]);
    theater.orbitView();
    await load();
    alert('Booked!');
  } catch (e) {
    alert(e.message);
    await load();
  } finally {
    busy = false; refreshUI();
  }
}

// --- click-to-select (ignore drags used for orbiting) ---------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
const canvas = theater.renderer.domElement;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, theater.camera);
  const id = seats.pick(ray);
  if (id !== undefined) { seats.toggle(id); refreshUI(); }
});

// --- camera buttons --------------------------------------------------------
btnOrbit.onclick = () => { theater.orbitView(); btnOrbit.classList.add('active'); btnSeat.classList.remove('active'); };
btnSeat.onclick = () => {
  const first = seats.selectedSeats()[0];
  if (!first) return;
  theater.seatView(first.row, first.number);
  btnSeat.classList.add('active'); btnOrbit.classList.remove('active');
};
btnOrbit.classList.add('active');

load();
