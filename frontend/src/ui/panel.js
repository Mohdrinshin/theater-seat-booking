const GST = 0.18;
const fmt = (n) => '₹' + n.toFixed(2);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function renderPanel(el, { show, shows = [], seats, onBook, busy, error, paymentMessage, onRetry, onShowChange }) {
  if (error) {
    el.innerHTML = `<div class="error-state"><h2>Theater unavailable</h2><p>${escapeHtml(error)}</p><button id="retry">Retry connection</button></div>`;
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
    ${shows.length > 1 ? `<label class="show-picker">Show<select id="show-select">${shows.map((item) => `<option value="${item.id}" ${item.id === show.id ? 'selected' : ''}>${escapeHtml(item.movie)} · ${escapeHtml(item.cinema)} · ${escapeHtml(new Date(item.starts_at).toLocaleString())}</option>`).join('')}</select></label>` : ''}
    <h2>${show.movie}</h2>
    <div class="sub">${show.cinema}<br>${new Date(show.starts_at).toLocaleString()}</div>
    ${seats.length === 0 ? '<p class="sub">Click available seats in the 3D hall.</p>' : ''}
    ${seats.map((s) => `<div class="row"><span>${s.label || `${s.row}${s.number}`} · ${s.section}</span><span>${fmt(s.price)}</span></div>`).join('')}
    <div class="total"><span>Total (+18% GST)</span><span>${fmt(total)}</span></div>
    ${paymentMessage ? `<p class="payment-message" role="status">${escapeHtml(paymentMessage)}</p>` : ''}
    <button id="book" ${seats.length === 0 || busy ? 'disabled' : ''}>${busy ? 'Opening secure checkout…' : `Pay ${fmt(total)}`}</button>
  `;
  const showSelect = el.querySelector('#show-select');
  if (showSelect) showSelect.onchange = () => onShowChange?.(Number(showSelect.value));
  el.querySelector('#book').onclick = onBook;
}
