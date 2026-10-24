const GST = 0.18;
const fmt = (n) => '₹' + n.toFixed(2);

export function renderPanel(el, { show, seats, onBook, busy, error, onRetry }) {
  if (error) {
    el.innerHTML = `<div class="error-state"><h2>Theater unavailable</h2><p>${error}</p><button id="retry">Retry connection</button></div>`;
    el.querySelector('#retry').onclick = onRetry;
    return;
  }
  if (!show) {
    el.innerHTML = '<div class="loading-state">Connecting to theater…</div>';
    return;
  }
  const base = seats.reduce((a, s) => a + s.price, 0);
  const total = base * (1 + GST);
  el.innerHTML = `
    <h2>${show.movie}</h2>
    <div class="sub">${show.cinema}<br>${new Date(show.starts_at).toLocaleString()}</div>
    ${seats.length === 0 ? '<p class="sub">Click available seats in the 3D hall.</p>' : ''}
    ${seats.map((s) => `<div class="row"><span>${s.row}${s.number} · ${s.section}</span><span>${fmt(s.price)}</span></div>`).join('')}
    <div class="total"><span>Total (+18% GST)</span><span>${fmt(total)}</span></div>
    <button id="book" ${seats.length === 0 || busy ? 'disabled' : ''}>${busy ? 'Booking…' : 'Book seats'}</button>
  `;
  el.querySelector('#book').onclick = onBook;
}
