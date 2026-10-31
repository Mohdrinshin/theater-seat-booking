import {
  createHall, getDesigns, getHalls, getRoomThemes, ownerLogin, ownerRegister,
  publishHall, saveHall, saveLayout,
} from '../api.js';
import { createTheater } from '../theater/scene.js';
import { SeatManager } from '../theater/seats.js';
import { ROOM_THEMES } from '../designs/registry.js';
import { computeRoomLayout } from '../designs/rooms/layout.js';

const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROWS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');

function finishForRow(theme, rowIndex, baseFinish) {
  const zones = theme?.seatZones;
  if (!zones) return { ...baseFinish };
  const fraction = rowIndex / Math.max(1, theme.layout.rows - 1);
  return { ...baseFinish, uph: fraction >= zones.middleStart && fraction <= zones.middleEnd ? theme.palette.seatMid : theme.palette.seatFront };
}

export function createBuilder(root, onExit) {
  const state = {
    token: localStorage.getItem('theater-owner-token') || '',
    register: true, designs: [], themes: ROOM_THEMES, halls: [], hall: null, sections: [], seats: [],
    designId: null, sectionIndex: 0, message: '', error: '', placing: false,
    preview3d: false, preview: null, colorOverrides: {}, editSeatKey: null,
    roomTheme: 'multiplex', themeOptions: { accent: true, accentColor: '#ffb35a', accentLevel: .35, shadows: true, haze: false, dust: false, quality: 'high' }, seatOptions: { recline: false, centerArm: true },
    layout: { pitch: 1.15, riser: .28 },
    form: { name: 'New auditorium', room_width: 24, room_depth: 30, room_height: 12,
      screen: { width: 16, height: 7, curve: 0, x: 0, y: 4.2, z: 0, aspect: 16 / 7 } },
  };

  function takeHall(hall) {
    state.hall = hall;
    state.roomTheme = hall?.room_theme || 'multiplex';
    state.themeOptions = { ...state.themeOptions, ...(hall?.theme_options || {}) };
    state.editSeatKey = null;
    state.sectionIndex = 0;
    state.colorOverrides = {};
    state.sections = hall?.sections?.length ? hall.sections.map((s) => ({ ...s })) : [
      { name: 'Classic', base_price: 745.76, color: '#b71927' },
      { name: 'Prime', base_price: 889.82, color: '#8c1520' },
    ];
    state.seats = (hall?.seats || []).map((s) => ({ ...s, sectionIndex: state.sections.findIndex((section) => section.id === s.section_id) }));
    const hallRows = [...new Map(state.seats.map((seat) => [seat.row_label, seat])).values()].sort((a, b) => a.z - b.z);
    const themeLayout = ROOM_THEMES.find((theme) => theme.key === state.roomTheme)?.layout;
    state.layout = {
      pitch: hallRows.length > 1 ? hallRows[1].z - hallRows[0].z : (themeLayout?.pitch || 1.15),
      riser: hallRows.length > 1 ? hallRows[1].y - hallRows[0].y : (themeLayout?.riser || .28),
    };
    state.form = hall
      ? { name: hall.name, room_width: hall.room_width, room_depth: hall.room_depth,
          room_height: hall.room_height, screen: { ...hall.screen } }
      : { name: 'New auditorium', room_width: 24, room_depth: 30, room_height: 12,
          screen: { width: 16, height: 7, curve: 0, x: 0, y: 4.2, z: 0, aspect: 16 / 7 } };
  }

  async function loadHalls() {
    state.halls = await getHalls(state.token);
    if (!state.hall && state.halls.length) takeHall(state.halls[0]);
    draw();
  }

  function chooseTheme(key) {
    const theme = ROOM_THEMES.find((entry) => entry.key === key);
    if (!theme) return;
    state.roomTheme = key;
    state.seatOptions = { recline: key === 'vip', centerArm: true };
    state.colorOverrides = {};
    const design = state.designs.find((entry) => entry.key === theme.defaultSeat);
    if (design) state.designId = design.id;
    const room = computeRoomLayout(theme);
    const layout = theme.layout;
    state.layout = { pitch: room.pitch, riser: layout.riser };
    const rows = [...new Map(state.seats.map((seat) => [seat.row_label, seat])).values()].sort((a, b) => a.z - b.z);
    const rowOrder = new Map(rows.map((seat, index) => [seat.row_label, index]));
    if (design) state.seats.forEach((seat) => {
      const row = rowOrder.get(seat.row_label) || 0;
      seat.design_id = design.id;
      seat.colors = finishForRow(theme, row, theme.defaultFinish);
      seat.design_options = { recline: theme.defaultSeat === 'vip', centerArm: true };
      seat.z = Number((layout.front + row * room.pitch).toFixed(3));
      seat.y = Number((row * layout.riser).toFixed(3));
    });
    state.form.room_width = Number(room.width.toFixed(2));
    state.form.room_depth = Number(room.depth.toFixed(2));
    state.form.room_height = Number(room.height.toFixed(2));
    const screenBottom = key === 'crimson-premiere' ? layout.stage + 1.8 : layout.stage + .45;
    const screenHeight = Math.min(room.screenHeight, room.height - screenBottom - .5);
    const screenWidth = Math.min(room.screenWidth, screenHeight * layout.aspect);
    state.form.screen = { width: Number(screenWidth.toFixed(2)), height: Number(screenHeight.toFixed(2)), curve: 0,
      x: 0, y: Number((screenBottom + screenHeight / 2).toFixed(2)), z: 0, aspect: layout.aspect };
    state.message = `${theme.name} theme selected`;
    draw();
  }

  function buttonSeatMarkup(seat) {
    const design = state.designs.find((d) => d.id === seat.design_id);
    const width = design?.width || 0.55;
    const depth = seat.design_options?.recline ? (design?.depth_open || design?.depth || 0.6) : (design?.depth_closed || design?.depth || 0.6);
    const left = (50 + (seat.x / state.form.room_width) * 100).toFixed(3);
    const top = ((seat.z / state.form.room_depth) * 100).toFixed(3);
    const w = Math.max(1.6, (width / state.form.room_width) * 100).toFixed(3);
    const h = Math.max(1.4, (depth / state.form.room_depth) * 100).toFixed(3);
    const key = seat.id ?? seat.label;
    return `<button class="builder-seat ${String(state.editSeatKey) === String(key) ? 'editing' : ''}" data-seat="${escapeHtml(key)}" title="${escapeHtml(seat.label)} · ${escapeHtml(design?.name || '')}"
      style="left:${left}%;top:${top}%;width:${w}%;height:${h}%;background:${escapeHtml(seat.colors?.uph || seat.colors?.cushion || design?.default_colors?.uph || '#a21a28')};transform:translate(-50%,-50%) rotate(${seat.rotation_y || 0}deg)">${escapeHtml(seat.seat_number)}</button>`;
  }

  function draw() {
    if (state.preview) {
      state.preview.seats.dispose();
      state.preview.theater.dispose();
      state.preview = null;
    }
    if (!state.token) {
      root.innerHTML = `<div class="builder-auth"><button class="builder-back" data-action="exit">← Theater</button>
        <div class="builder-auth-card"><span class="studio-kicker">PVR · HALL BUILDER</span><h1>${state.register ? 'Create owner account' : 'Owner sign in'}</h1>
        <p>Manage auditorium dimensions, seat designs, sections, and pricing.</p><form id="auth-form"><label>Email<input type="email" name="email" required autocomplete="email"></label>
        <label>Password<input type="password" name="password" minlength="8" required autocomplete="${state.register ? 'new-password' : 'current-password'}"></label>
        <button class="gold-button">${state.register ? 'Create account' : 'Sign in'}</button></form>
        <button class="text-button" data-action="auth-switch">${state.register ? 'I already have an account' : 'Create an owner account'}</button>
        ${state.error ? `<p class="builder-error">${escapeHtml(state.error)}</p>` : ''}</div></div>`;
      bind();
      return;
    }
    const form = state.form;
    const selectedDesign = state.designs.find((d) => d.id === Number(state.designId));
    const editingSeat = state.seats.find((seat) => String(seat.id ?? seat.label) === String(state.editSeatKey));
    root.innerHTML = `<header class="builder-header"><div><span class="studio-kicker">PVR · HALL BUILDER</span><strong>Auditorium studio</strong></div>
      <div class="builder-header-actions"><span class="save-message">${escapeHtml(state.message)}</span><button data-action="logout" class="text-button">Sign out</button><button data-action="exit" class="outline-button">Exit studio</button></div></header>
      <div class="builder-layout"><aside class="builder-tools">
        <label class="field-label">Hall<select id="hall-select"><option value="">New hall…</option>${state.halls.map((h) => `<option value="${h.id}" ${state.hall?.id === h.id ? 'selected' : ''}>${escapeHtml(h.name)} · ${escapeHtml(h.status)}</option>`).join('')}</select></label>
        <div class="config-step"><b>1 · Room theme</b><span>Choose the architecture and default seat</span></div>
        <div class="theme-list">${ROOM_THEMES.map((theme, i) => `<button class="theme-choice ${state.roomTheme === theme.key ? 'selected' : ''}" data-theme="${theme.key}" aria-label="Choose ${escapeHtml(theme.name)}"><img src="/designs/RV-0${i + 1}-${theme.key}-interior.svg" alt=""><span><b>${escapeHtml(theme.name)}</b><small>${escapeHtml(theme.style)}</small></span></button>`).join('')}</div>
        <label class="field-label">Hall name<input data-field="name" value="${escapeHtml(form.name)}"></label>
        <div class="field-pair"><label class="field-label">Room width · m<input type="number" min="4" step="0.5" data-field="room_width" value="${form.room_width}"></label><label class="field-label">Room depth · m<input type="number" min="4" step="0.5" data-field="room_depth" value="${form.room_depth}"></label></div>
        <div class="field-pair"><label class="field-label">Room height · m<input type="number" min="3" step="0.5" data-field="room_height" value="${form.room_height}"></label><label class="field-label">Screen curve<input type="number" min="0" max="180" step="5" data-screen="curve" value="${form.screen.curve || 0}"></label></div>
        <div class="field-pair"><label class="field-label">Screen width · m<input type="number" min="2" step="0.5" data-screen="width" value="${form.screen.width}"></label><label class="field-label">Screen height · m<input type="number" min="1" step="0.5" data-screen="height" value="${form.screen.height}"></label></div>
        <div class="field-pair"><label class="field-label">Screen X · m<input type="number" step="0.5" data-screen="x" value="${form.screen.x || 0}"></label><label class="field-label">Screen Y · m<input type="number" step="0.5" data-screen="y" value="${form.screen.y}"></label></div>
        <label class="field-label">Screen Z · m<input type="number" step="0.5" data-screen="z" value="${form.screen.z || 0}"></label>
        <div class="config-step"><b>2 · Seat design</b><span>Applied to newly generated or placed seats</span></div>
        <div class="design-list">${state.designs.map((d) => `<button class="design-choice ${Number(state.designId) === d.id ? 'selected' : ''}" data-design="${d.id}"><img class="seat-thumb" src="/designs/S-0${['classic','recliner','couple','vip','modern','pod'].indexOf(d.key) + 1}-${d.key}.svg" alt=""><span><b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.tier)} · ${d.width.toFixed(2)} × ${d.depth_closed.toFixed(2)} m · ${d.capacity} seat${d.capacity === 1 ? '' : 's'} · ×${d.price_multiplier.toFixed(1)}</small></span></button>`).join('')}</div>
        <div class="color-slots"><label class="field-label">Upholstery<input type="color" data-color="uph" value="${escapeHtml(state.colorOverrides?.uph || selectedDesign?.default_colors?.uph || '#5c1520')}"></label><label class="field-label">Frame<input type="color" data-color="frame" value="${escapeHtml(state.colorOverrides?.frame || selectedDesign?.default_colors?.frame || '#1b1b1d')}"></label><label class="field-label">Metal<select data-metal><option value="steel" ${(state.colorOverrides?.metal || selectedDesign?.default_colors?.metal) === 'steel' ? 'selected' : ''}>Steel</option><option value="chrome" ${(state.colorOverrides?.metal || selectedDesign?.default_colors?.metal) === 'chrome' ? 'selected' : ''}>Black chrome</option><option value="brass" ${(state.colorOverrides?.metal || selectedDesign?.default_colors?.metal) === 'brass' ? 'selected' : ''}>Brass</option></select></label></div>
        ${selectedDesign?.options?.length ? `<div class="option-toggles">${selectedDesign.options.includes('recline') ? `<label><input type="checkbox" data-option="recline" ${state.seatOptions.recline ? 'checked' : ''}> Recline / leg rest open</label>` : ''}${selectedDesign.options.includes('centerArm') ? `<label><input type="checkbox" data-option="centerArm" ${state.seatOptions.centerArm ? 'checked' : ''}> Centre armrest down</label>` : ''}</div>` : ''}
        <div class="field-pair"><label class="field-label">Apply finish to<select data-finish-scope><option value="all">All seats</option><option value="selected">Selected seat</option><option value="row">This row</option><option value="section">Section</option></select></label><button class="outline-button" data-action="apply-finish">Apply finish</button></div>
        <div class="config-step"><b>3 · Layout</b><span>Mixed designs, row pitch and riser</span></div>
        <div class="field-pair"><label class="field-label">Row pitch · m<input type="number" min="0.8" step="0.05" data-layout="pitch" value="${state.layout.pitch}"></label><label class="field-label">Riser · m<input type="number" min="0" max="0.6" step="0.05" data-layout="riser" value="${state.layout.riser}"></label></div>
        <div class="config-step"><b>4 · Numbering and sections</b><span>Automatic row labels, seat numbers, and price sections</span></div>
        <div class="config-step"><b>5 · Lighting and quality</b><span>Room ambience and rendering detail</span></div>
        <div class="option-toggles"><label><input type="checkbox" data-theme-option="accent" ${state.themeOptions.accent ? 'checked' : ''}> Accent and aisle lights</label><label><input type="checkbox" data-theme-option="shadows" ${state.themeOptions.shadows ? 'checked' : ''}> Soft shadows</label><label><input type="checkbox" data-theme-option="haze" ${state.themeOptions.haze ? 'checked' : ''}> Projector haze</label><label><input type="checkbox" data-theme-option="dust" ${state.themeOptions.dust ? 'checked' : ''}> Dust</label></div>
        <div class="field-pair"><label class="field-label">Accent color<input type="color" data-theme-option="accentColor" value="${escapeHtml(state.themeOptions.accentColor || '#ffb35a')}"></label><label class="field-label">Quality<select data-theme-option="quality"><option ${state.themeOptions.quality === 'low' ? 'selected' : ''}>low</option><option ${state.themeOptions.quality === 'medium' ? 'selected' : ''}>medium</option><option ${state.themeOptions.quality === 'high' ? 'selected' : ''}>high</option></select></label></div>
        <div class="field-pair"><label class="field-label">Row label<input id="row-label" maxlength="8" value="${escapeHtml(nextRow())}"></label><label class="field-label">Section<select id="section-select">${state.sections.map((s, i) => `<option value="${i}" ${state.sectionIndex === i ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}</select></label></div>
        <label class="field-label">Seats in generated row<input id="row-count" type="number" min="1" max="40" value="12"></label>
        <button class="outline-button full-width" data-action="add-row">Generate row</button>
        <button class="outline-button full-width ${state.placing ? 'placing' : ''}" data-action="place">${state.placing ? 'Click or drag room to place · Done' : 'Place individual seat'}</button>
        ${editingSeat ? `<div class="section-card seat-edit-card"><div class="section-head"><b>Edit ${escapeHtml(editingSeat.label)}</b><button data-action="close-seat-edit" aria-label="Close seat editor">×</button></div>
          <div class="field-pair"><label class="field-label">Row<input data-edit-row value="${escapeHtml(editingSeat.row_label)}"></label><label class="field-label">First seat #<input type="number" min="1" data-edit-number value="${editingSeat.seat_number}"></label></div>
          <label class="field-label">Seat design<select data-edit-design>${state.designs.map((design) => `<option value="${design.id}" ${design.id === editingSeat.design_id ? 'selected' : ''}>${escapeHtml(design.name)}</option>`).join('')}</select></label>
          <label class="field-label">Seat label<input data-edit-label value="${escapeHtml(editingSeat.label)}"></label>
          <label class="field-label">Section<select data-edit-section>${state.sections.map((section, i) => `<option value="${i}" ${(editingSeat.sectionIndex ?? state.sections.findIndex((s) => s.id === editingSeat.section_id)) === i ? 'selected' : ''}>${escapeHtml(section.name)}</option>`).join('')}</select></label>
          <button class="remove-seat-button" data-action="remove-seat">Remove seat</button></div>` : ''}
        <div class="section-card"><div class="section-head"><b>Sections and base prices</b><button data-action="add-section" aria-label="Add section">+</button></div>${state.sections.map((s, i) => `<div class="section-row"><input data-section-name="${i}" value="${escapeHtml(s.name)}" aria-label="Section name"><input data-section-price="${i}" type="number" min="0" step="0.01" value="${s.base_price}" aria-label="Base price"><input data-section-color="${i}" type="color" value="${escapeHtml(s.color)}" aria-label="Section color"></div>`).join('')}</div>
        <div class="builder-actions"><button class="gold-button" data-action="save">Save draft</button><button class="publish-button" data-action="publish" ${state.hall?.status === 'published' ? 'disabled' : ''}>${state.hall?.status === 'published' ? 'Published' : 'Publish hall'}</button></div>
        ${state.error ? `<p class="builder-error">${escapeHtml(state.error)}</p>` : ''}
      </aside><main class="builder-workspace"><div class="workspace-title"><div><b>${escapeHtml(form.name || 'Untitled hall')}</b><span>${form.room_width} m × ${form.room_depth} m · ${state.seats.length} seats · ${minSightlineClearance() === null ? 'C-value —' : `C-value ${Math.round(minSightlineClearance() * 1000)} mm`}</span></div><div class="workspace-actions"><button class="outline-button" data-action="toggle-preview">${state.preview3d ? '2D plan' : '3D preview'}</button><span class="draft-pill">${state.hall?.status || 'unsaved draft'}</span></div></div>
        <div class="floor-wrap">${state.preview3d
          ? `<div class="builder-preview-stage" id="builder-preview"></div><div class="preview-actions"><button class="outline-button" data-action="preview-orbit">Overview</button><button class="outline-button" data-action="preview-seat" ${state.seats.length ? '' : 'disabled'}>Seat view</button><button class="outline-button" data-action="preview-screen">From screen</button><button class="outline-button" data-action="preview-aisle">Aisle</button><button class="outline-button" data-action="preview-fit">Fit</button><button class="outline-button" data-action="preview-reset">Reset</button></div>`
          : `<div class="editor-screen" style="width:${Math.min(80, (form.screen.width / form.room_width) * 100)}%">SCREEN · ${form.screen.width} × ${form.screen.height} m</div>
          <div class="editor-floor ${state.placing ? 'placing-mode' : ''}" id="editor-floor" style="aspect-ratio:${form.room_width}/${form.room_depth}">${state.seats.map(buttonSeatMarkup).join('')}
          ${state.seats.length === 0 ? '<div class="floor-hint">Generate rows or click to place seats</div>' : ''}</div>`}</div>
        <div class="config-step preview-step"><b>6 · Preview and publish</b><span>Review seating and publish the room when ready</span></div>
        <div class="editor-footer"><span>${state.preview3d ? 'Drag to orbit · scroll to zoom' : 'Select a seat to edit its row, number, label, or section'}</span><span>${state.placing && !state.preview3d ? 'Click or drag across the room to place seats' : 'Screen at the top · room coordinates in metres'}</span></div>
      </main></div>`;
    bind();
    if (state.preview3d) {
      const theater = createTheater(root.querySelector('#builder-preview'), {
        room: { width: Number(form.room_width), depth: Number(form.room_depth), height: Number(form.room_height) },
        screen: form.screen, theme: state.roomTheme, themeOptions: state.themeOptions, seats: state.seats,
      });
      const manager = new SeatManager(theater.scene);
      manager.build(state.seats.map((seat) => ({ ...seat, status: 'available', design: state.designs.find((d) => d.id === seat.design_id)?.key })));
      state.preview = { theater, seats: manager };
    }
  }

  function nextRow() {
    const used = new Set(state.seats.map((s) => s.row_label));
    return ROWS.find((r) => !used.has(r)) || 'A';
  }

  function updateSeatLabel(seat) {
    const design = state.designs.find((item) => item.id === seat.design_id);
    const end = seat.seat_number + (design?.capacity || 1) - 1;
    seat.label = end === seat.seat_number ? `${seat.row_label}${seat.seat_number}` : `${seat.row_label}${seat.seat_number}-${end}`;
    state.editSeatKey = seat.id ?? seat.label;
  }

  function minSightlineClearance() {
    const rows = [...new Map(state.seats.map((seat) => [seat.row_label, seat])).values()].sort((a, b) => a.z - b.z);
    if (rows.length < 2) return null;
    const screenBottom = state.form.screen.y - state.form.screen.height / 2;
    let minimum = Infinity;
    for (let i = 1; i < rows.length; i += 1) {
      const front = rows[i - 1], back = rows[i];
      const eyeFront = (front.y || 0) + 1.12, eyeBack = (back.y || 0) + 1.12;
      const depth = back.z - state.form.screen.z;
      if (depth <= 0) return null;
      const sightlineAtFront = screenBottom + (eyeBack - screenBottom) * (front.z - state.form.screen.z) / depth;
      minimum = Math.min(minimum, sightlineAtFront - eyeFront);
    }
    return Number.isFinite(minimum) ? minimum : null;
  }

  function hallPayload() {
    return { ...state.form, name: state.form.name.trim(), screen: { ...state.form.screen }, room_theme: state.roomTheme, theme_options: { ...state.themeOptions } };
  }

  async function save(publish = false) {
    state.error = '';
    state.message = 'Saving…'; draw();
    try {
      if (!state.hall) {
        state.hall = await createHall(state.token, hallPayload());
        state.halls.push(state.hall);
      } else state.hall = await saveHall(state.token, state.hall.id, hallPayload());
      const sections = state.sections.map((s) => ({ ...(s.id ? { id: s.id } : {}), name: s.name, base_price: Number(s.base_price), color: s.color }));
      const layoutSeats = state.seats.map((s) => ({ ...s, section_id: state.sections[s.sectionIndex ?? 0]?.id || (s.sectionIndex ?? 0) + 1 }));
      state.hall = await saveLayout(state.token, state.hall.id, { sections, seats: layoutSeats });
      takeHall(state.hall);
      if (publish) {
        await publishHall(state.token, state.hall.id);
        state.hall.status = 'published';
      }
      state.halls = await getHalls(state.token);
      state.message = publish ? 'Hall published' : 'Draft saved';
      state.error = '';
    } catch (error) {
      state.message = '';
      state.error = error.message === 'A published hall with future shows only allows a rename'
        ? 'This published hall has a future show, so its layout and theme cannot be changed. To create a new theater, choose “New hall…” from the Hall menu first.'
        : error.message;
    }
    draw();
  }

  function bind() {
    root.querySelector('#auth-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        const result = state.register ? await ownerRegister(form.get('email'), form.get('password')) : await ownerLogin(form.get('email'), form.get('password'));
        state.token = result.access_token;
        localStorage.setItem('theater-owner-token', state.token);
        state.error = '';
        state.designs = await getDesigns();
        await loadHalls();
      } catch (error) { state.error = error.message; draw(); }
    });
    root.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => {
      const action = button.dataset.action;
      if (action === 'exit') return onExit();
      if (action === 'auth-switch') { state.register = !state.register; state.error = ''; draw(); }
      if (action === 'logout') { localStorage.removeItem('theater-owner-token'); state.token = ''; draw(); }
      if (action === 'add-row') addRow();
      if (action === 'place') { state.placing = !state.placing; draw(); }
      if (action === 'close-seat-edit') { state.editSeatKey = null; draw(); }
      if (action === 'remove-seat') {
        state.seats = state.seats.filter((seat) => String(seat.id ?? seat.label) !== String(state.editSeatKey));
        state.editSeatKey = null;
        draw();
      }
      if (action === 'apply-finish') {
        const scope = root.querySelector('[data-finish-scope]')?.value || 'all';
        const edited = state.seats.find((seat) => String(seat.id ?? seat.label) === String(state.editSeatKey));
        const targets = scope === 'selected' && edited ? [edited]
          : scope === 'row' ? state.seats.filter((seat) => seat.row_label === (edited?.row_label || root.querySelector('#row-label')?.value))
            : scope === 'section' ? state.seats.filter((seat) => (seat.sectionIndex ?? 0) === state.sectionIndex) : state.seats;
        for (const seat of targets) seat.colors = { ...(seat.colors || {}), ...(state.colorOverrides || {}) };
        draw();
      }
      if (action === 'toggle-preview') { state.preview3d = !state.preview3d; draw(); }
      if (action === 'preview-orbit') state.preview?.theater.orbitView();
      if (action === 'preview-seat' && state.seats.length) state.preview?.theater.seatView(state.seats[0]);
      if (action === 'preview-screen') state.preview?.theater.fromScreenView();
      if (action === 'preview-aisle') state.preview?.theater.aisleView();
      if (action === 'preview-fit') state.preview?.theater.fitView();
      if (action === 'preview-reset') state.preview?.theater.resetView();
      if (action === 'add-section') { state.sections.push({ name: `Section ${state.sections.length + 1}`, base_price: 0, color: '#8c1520' }); draw(); }
      if (action === 'save') await save(false);
      if (action === 'publish') await save(true);
    }));
    root.querySelector('#hall-select')?.addEventListener('change', (event) => {
      const hall = state.halls.find((h) => h.id === Number(event.target.value));
      takeHall(hall || null); draw();
    });
    root.querySelectorAll('[data-design]').forEach((button) => button.addEventListener('click', () => {
      state.designId = Number(button.dataset.design);
      const designKey = state.designs.find((design) => design.id === state.designId)?.key;
      state.seatOptions = { recline: designKey === 'vip', centerArm: true };
      draw();
    }));
    root.querySelectorAll('[data-theme]').forEach((button) => button.addEventListener('click', () => chooseTheme(button.dataset.theme)));
    root.querySelectorAll('[data-field]').forEach((input) => input.addEventListener('change', () => {
      const key = input.dataset.field;
      state.form[key] = key === 'name' ? input.value : Number(input.value);
      draw();
    }));
    root.querySelectorAll('[data-layout]').forEach((input) => input.addEventListener('change', () => {
      state.layout[input.dataset.layout] = Math.max(0, Number(input.value) || 0);
    }));
    root.querySelectorAll('[data-screen]').forEach((input) => input.addEventListener('change', () => {
      state.form.screen[input.dataset.screen] = Number(input.value);
      state.form.screen.aspect = state.form.screen.width / state.form.screen.height;
      draw();
    }));
    root.querySelectorAll('[data-color]').forEach((input) => input.addEventListener('change', () => {
      state.colorOverrides = { ...(state.colorOverrides || {}), [input.dataset.color]: input.value };
    }));
    root.querySelector('[data-metal]')?.addEventListener('change', (event) => {
      state.colorOverrides = { ...(state.colorOverrides || {}), metal: event.target.value };
    });
    root.querySelectorAll('[data-option]').forEach((input) => input.addEventListener('change', () => {
      state.seatOptions[input.dataset.option] = input.checked;
    }));
    root.querySelectorAll('[data-theme-option]').forEach((input) => input.addEventListener('change', () => {
      state.themeOptions[input.dataset.themeOption] = input.type === 'checkbox' ? input.checked : input.value;
    }));
    root.querySelector('#section-select')?.addEventListener('change', (event) => { state.sectionIndex = Number(event.target.value); });
    root.querySelectorAll('[data-section-name]').forEach((input) => input.addEventListener('change', () => { state.sections[Number(input.dataset.sectionName)].name = input.value; }));
    root.querySelectorAll('[data-section-price]').forEach((input) => input.addEventListener('change', () => { state.sections[Number(input.dataset.sectionPrice)].base_price = Number(input.value); }));
    root.querySelectorAll('[data-section-color]').forEach((input) => input.addEventListener('change', () => { state.sections[Number(input.dataset.sectionColor)].color = input.value; }));
    root.querySelectorAll('.builder-seat').forEach((seatButton) => seatButton.addEventListener('click', (event) => {
      event.stopPropagation();
      state.editSeatKey = seatButton.dataset.seat;
      draw();
    }));
    const editSeat = () => state.seats.find((seat) => String(seat.id ?? seat.label) === String(state.editSeatKey));
    root.querySelector('[data-edit-row]')?.addEventListener('change', (event) => {
      const seat = editSeat(); if (!seat) return;
      seat.row_label = event.target.value.trim().toUpperCase();
      updateSeatLabel(seat);
      draw();
    });
    root.querySelector('[data-edit-number]')?.addEventListener('change', (event) => {
      const seat = editSeat(); if (!seat) return;
      seat.seat_number = Math.max(1, Number(event.target.value) || 1);
      updateSeatLabel(seat);
      draw();
    });
    root.querySelector('[data-edit-label]')?.addEventListener('change', (event) => {
      const seat = editSeat(); if (!seat) return;
      seat.label = event.target.value.trim() || `${seat.row_label}${seat.seat_number}`;
      state.editSeatKey = seat.id ?? seat.label;
      draw();
    });
    root.querySelector('[data-edit-section]')?.addEventListener('change', (event) => {
      const seat = editSeat(); if (!seat) return;
      seat.sectionIndex = Number(event.target.value);
      draw();
    });
    root.querySelector('[data-edit-design]')?.addEventListener('change', (event) => {
      const seat = editSeat(); if (!seat) return;
      const design = state.designs.find((item) => item.id === Number(event.target.value));
      if (!design) return;
      seat.design_id = design.id;
      seat.colors = { ...design.default_colors };
      seat.design_options = { recline: design.key === 'vip', centerArm: true };
      updateSeatLabel(seat);
      draw();
    });
    let placementPath = null;
    const floor = root.querySelector('#editor-floor');
    const placeAt = (event) => {
      const bounds = floor.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * state.form.room_width;
      const z = ((event.clientY - bounds.top) / bounds.height) * state.form.room_depth;
      const row = root.querySelector('#row-label').value.trim().toUpperCase() || 'A';
      const design = state.designs.find((d) => d.id === Number(state.designId));
      if (!design) return false;
      const theme = ROOM_THEMES.find((entry) => entry.key === state.roomTheme);
      const rowIndex = [...new Set(state.seats.map((seat) => seat.row_label))].indexOf(row);
      const colorIndex = rowIndex < 0 ? new Set(state.seats.map((seat) => seat.row_label)).size : rowIndex;
      const minStep = Math.max(0.35, design.width + 0.06);
      if (placementPath && Math.hypot(x - placementPath.x, z - placementPath.z) < minStep) return false;
      const number = Math.max(0, ...state.seats.filter((s) => s.row_label === row).map((s) => {
        const item = state.designs.find((d) => d.id === s.design_id);
        return s.seat_number + (item?.capacity || 1) - 1;
      })) + 1;
      const label = design.capacity > 1 ? `${row}${number}-${number + design.capacity - 1}` : `${row}${number}`;
      state.seats.push({ row_label: row, seat_number: number, label, x, y: 0, z,
        rotation_y: 0, design_id: design.id, sectionIndex: state.sectionIndex,
        colors: { ...finishForRow(theme, colorIndex, design.default_colors), ...(state.colorOverrides || {}) }, design_options: { ...state.seatOptions }, is_active: true });
      placementPath = { x, z };
      return true;
    };
    floor?.addEventListener('pointerdown', (event) => {
      if (!state.placing || event.target.closest('.builder-seat')) return;
      placementPath = null;
      placeAt(event);
      floor.setPointerCapture(event.pointerId);
    });
    floor?.addEventListener('pointermove', (event) => {
      if (state.placing && event.buttons === 1 && placementPath) placeAt(event);
    });
    floor?.addEventListener('pointerup', () => {
      if (!placementPath) return;
      placementPath = null;
      draw();
    });
    floor?.addEventListener('pointercancel', () => { placementPath = null; draw(); });
  }

  function addRow() {
    const row = root.querySelector('#row-label').value.trim().toUpperCase() || nextRow();
    const count = Math.max(1, Math.min(40, Number(root.querySelector('#row-count').value) || 12));
    const design = state.designs.find((d) => d.id === Number(state.designId));
    if (!design) { state.error = 'Choose a seat design first.'; draw(); return; }
    const step = design.width + 0.06;
    const theme = ROOM_THEMES.find((entry) => entry.key === state.roomTheme);
    const blockGap = count > 4 ? (state.roomTheme === 'crimson-premiere' ? theme.layout.aisle : 0.75) : 0;
    const blocks = Math.ceil((count * design.capacity) / 4);
    const totalWidth = count * step + Math.max(0, blocks - 1) * blockGap;
    const existingRows = [...new Set(state.seats.map((s) => s.row_label))];
    const rowDepth = existingRows.length;
    const depth = state.seatOptions.recline ? design.depth_open : design.depth_closed;
    const pitch = Math.max(state.layout.pitch, depth + 0.5);
    for (let number = 1; number <= count; number += 1) {
      const seatNumber = (number - 1) * design.capacity + 1;
      const block = Math.floor((seatNumber - 1) / 4);
      const offset = (number - 1) * step + block * blockGap;
      const label = design.capacity > 1 ? `${row}${seatNumber}-${seatNumber + design.capacity - 1}` : `${row}${seatNumber}`;
      state.seats.push({ row_label: row, seat_number: seatNumber, label,
        x: -totalWidth / 2 + offset + design.width / 2, y: rowDepth * state.layout.riser,
        z: Math.min(state.form.room_depth - depth / 2, Math.max(depth / 2, 4 + rowDepth * pitch)),
        rotation_y: 0, design_id: design.id, sectionIndex: state.sectionIndex,
        colors: { ...finishForRow(theme, rowDepth, design.default_colors), ...(state.colorOverrides || {}) }, design_options: { ...state.seatOptions }, is_active: true });
    }
    state.error = ''; draw();
  }

  async function init() {
    draw();
    try {
      const [designs, themes] = await Promise.all([getDesigns(), getRoomThemes()]);
      state.designs = designs;
      state.themes = ROOM_THEMES.filter((theme) => themes.some((entry) => entry.key === theme.key));
      state.designId = state.designs[0]?.id || null;
      if (state.token) await loadHalls(); else draw();
    } catch (error) { state.error = error.message; draw(); }
  }
  init();
  return { destroy() { if (state.preview) { state.preview.seats.dispose(); state.preview.theater.dispose(); } root.innerHTML = ''; } };
}
