const json = async (res) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
};

export const getShows = () => fetch('/api/shows').then(json);
export const getSeats = (showId) => fetch(`/api/shows/${showId}/seats`).then(json);
export const bookSeats = (showId, seatIds) =>
  fetch(`/api/shows/${showId}/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat_ids: seatIds }),
  }).then(json);
