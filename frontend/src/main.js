import * as THREE from 'three';
import './style.css';
import { getHealth, getSeats, getShows, getShowHall, createCheckout, verifyPayment, getPaymentStatus, cancelCheckout } from './api.js';
import { createTheater } from './theater/scene.js';
import { SeatManager } from './theater/seats.js';
import { renderPanel } from './ui/panel.js';

let theater = null;
let seats = null;
const panel = document.getElementById('panel');
const btnOrbit = document.getElementById('btn-orbit');
const btnSeat = document.getElementById('btn-seat');
const btnBuilder = document.getElementById('btn-builder');
const builderRoot = document.getElementById('builder');
let builder = null;

let show = null;
let shows = [];
let selectedShowId = null;
let busy = false;
let loadError = '';
let paymentMessage = '';

async function load() {
  loadError = '';
  refreshUI();
  try {
    await getHealth();
    shows = await getShows();
    if (!shows.length) throw new Error('No shows are available yet.');
    let showSeats;
    if (selectedShowId !== null && shows.some((item) => item.id === selectedShowId)) {
      show = shows.find((item) => item.id === selectedShowId);
      showSeats = await getSeats(show.id);
    } else {
      const candidates = await Promise.all(shows.map(async (item) => ({ item, seats: await getSeats(item.id) })));
      const preferred = candidates.reduce((best, candidate) => candidate.seats.length > best.seats.length ? candidate : best);
      show = preferred.item;
      selectedShowId = show.id;
      showSeats = preferred.seats;
    }
    const hall = await getShowHall(show.id);
    if (seats) seats.dispose();
    if (theater) theater.dispose();
    theater = createTheater(document.getElementById('canvas-wrap'), {
      room: hall ? { width: hall.room_width, depth: hall.room_depth, height: hall.room_height } : undefined,
      screen: hall?.screen, theme: hall?.room_theme, themeOptions: hall?.theme_options, seats: showSeats,
    });
    seats = new SeatManager(theater.scene);
    seats.build(showSeats);
    bindSeatPicking();
  } catch (e) {
    show = null;
    if (seats) seats.build([]);
    loadError = 'The API at http://localhost:8000 is unavailable. Start PostgreSQL and the backend, then retry.';
    console.error('Unable to load theater data:', e);
  }
  refreshUI();
}

function refreshUI() {
  renderPanel(panel, { show, seats: seats?.selectedSeats() || [], busy, error: loadError,
    shows, paymentMessage, onBook: book, onRetry: load,
    onShowChange: (id) => { selectedShowId = id; load(); } });
  btnSeat.disabled = !seats || seats.selected.size === 0;
}

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.dataset.razorpayCheckout = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check your connection and retry.'));
    document.head.append(script);
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function confirmPayment(order, response) {
  try {
    let result = await verifyPayment({
      attempt_id: order.attempt_id,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature,
    });
    for (let retry = 0; result.status === 'pending' && retry < 8; retry += 1) {
      await delay(1000);
      result = await getPaymentStatus(order.attempt_id);
    }
    if (result.status === 'paid') {
      paymentMessage = 'Payment captured. Your seats are confirmed.';
      await load();
      alert('Payment successful — your seats are booked.');
    } else if (result.status === 'refunded') {
      paymentMessage = 'The seats could not be confirmed. Razorpay refund has been initiated.';
      await load();
      alert('Payment was captured after the seat hold expired. A refund has been initiated.');
    } else if (result.status === 'refund_required') {
      paymentMessage = 'Payment captured. The cinema is processing a refund because the seat hold expired.';
      await load();
      alert('Payment was captured after the seat hold expired. Please contact the cinema for your refund.');
    } else {
      paymentMessage = 'Payment confirmation is still processing. Your seats remain held briefly.';
      await load();
      alert('Payment is still processing. Your booking will update when Razorpay confirms it.');
    }
  } catch (error) {
    paymentMessage = 'Payment confirmation is still processing. Check again in a moment.';
    await load();
    alert(error.message || 'Payment confirmation is still processing. Please check again shortly.');
  } finally {
    busy = false;
    refreshUI();
  }
}

async function book() {
  if (!show) return;
  busy = true; paymentMessage = ''; refreshUI();
  let order = null;
  let checkoutReturned = false;
  try {
    await loadRazorpay();
    const selected = seats.selectedSeats();
    const ids = selected.map((seat) => seat.id);
    order = await createCheckout(show.id, ids);
    const checkout = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: 'PVR Cinema',
      description: `${order.movie} · ${order.seats.join(', ')}`,
      order_id: order.order_id,
      theme: { color: '#c6a14a' },
      handler: (response) => {
        checkoutReturned = true;
        confirmPayment(order, response);
      },
      modal: {
        ondismiss: async () => {
          if (!checkoutReturned && order) {
            try { await cancelCheckout(order.attempt_id); } catch { /* the server hold still expires automatically */ }
            busy = false;
            refreshUI();
          }
        },
      },
    });
    checkout.on('payment.failed', (event) => {
      paymentMessage = event.error?.description || 'Payment failed. You can retry in the Razorpay window.';
      refreshUI();
    });
    checkout.open();
  } catch (e) {
    if (order) {
      try { await cancelCheckout(order.attempt_id); } catch { /* the server hold still expires automatically */ }
    }
    paymentMessage = e.message || 'Could not start payment.';
    alert(paymentMessage);
    busy = false; refreshUI();
  }
}

// --- click-to-select (ignore drags used for orbiting) ---------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
function bindSeatPicking() {
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
}

// --- camera buttons --------------------------------------------------------
btnOrbit.onclick = () => { theater?.orbitView(); btnOrbit.classList.add('active'); btnSeat.classList.remove('active'); };
btnSeat.onclick = () => {
  const first = seats?.selectedSeats()[0];
  if (!first) return;
  theater?.seatView(first);
  btnSeat.classList.add('active'); btnOrbit.classList.remove('active');
};
btnOrbit.classList.add('active');

btnBuilder.onclick = async () => {
  const { createBuilder } = await import('./ui/builder.js');
  document.getElementById('app').hidden = true;
  builderRoot.hidden = false;
  builder = createBuilder(builderRoot, () => {
    builder?.destroy();
    builder = null;
    builderRoot.hidden = true;
    document.getElementById('app').hidden = false;
  });
};

load();
