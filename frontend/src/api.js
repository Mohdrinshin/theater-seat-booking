const json = async (res) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
};

export const getShows = () => fetch('/api/shows').then(json);
export const getHealth = () => fetch('/api/health').then(json);
export const getSeats = (showId) => fetch(`/api/shows/${showId}/seats`).then(json);
export const holdSeats = (showId, seatIds) =>
  fetch(`/api/shows/${showId}/hold`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat_ids: seatIds }),
  }).then(json);
export const bookSeats = (showId, seatIds, holdToken) =>
  fetch(`/api/shows/${showId}/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat_ids: seatIds, ...(holdToken ? { hold_token: holdToken } : {}) }),
  }).then(json);
export const createCheckout = (showId, seatIds) =>
  fetch(`/api/shows/${showId}/checkout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat_ids: seatIds }),
  }).then(json);
export const verifyPayment = (payment) =>
  fetch('/api/payments/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payment),
  }).then(json);
export const getPaymentStatus = (attemptId) => fetch(`/api/payments/${attemptId}`).then(json);
export const cancelCheckout = (attemptId) =>
  fetch(`/api/payments/${attemptId}/cancel`, { method: 'POST' }).then(json);

const ownerJson = (path, token, options = {}) => fetch(path, {
  ...options,
  headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers },
}).then(json);

export const ownerRegister = (email, password) => fetch('/api/auth/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, role: 'owner' }),
}).then(json);
export const ownerLogin = (email, password) => fetch('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
}).then(json);
export const getDesigns = () => fetch('/api/seat-designs').then(json);
export const getHalls = (token) => ownerJson('/api/halls', token);
export const createHall = (token, hall) => ownerJson('/api/halls', token, { method: 'POST', body: JSON.stringify(hall) });
export const saveHall = (token, id, hall) => ownerJson(`/api/halls/${id}`, token, { method: 'PUT', body: JSON.stringify(hall) });
export const saveLayout = (token, id, layout) => ownerJson(`/api/halls/${id}/layout`, token, { method: 'PUT', body: JSON.stringify(layout) });
export const publishHall = (token, id) => ownerJson(`/api/halls/${id}/publish`, token, { method: 'POST' });
