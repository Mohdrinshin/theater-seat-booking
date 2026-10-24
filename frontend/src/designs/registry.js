import { buildClassic } from './seats/classic.js';
import { buildRecliner } from './seats/recliner.js';
import { buildCouple } from './seats/couple.js';
import { buildVip } from './seats/vip.js';
import { buildModern } from './seats/modern.js';
import { buildPod } from './seats/pod.js';

export const SEAT_DESIGNS = [
  { key: 'classic', name: 'Classic Cinema Chair', tier: 'Standard', width: .6, depthClosed: .668, depthOpen: .668, seatHeight: .485, armHeight: .65, capacity: 1, priceMultiplier: 1, upholstery: 'fabric', defaultFinish: { uph: '#5c1520', frame: '#1b1b1d', metal: 'steel' }, options: [], build: buildClassic },
  { key: 'recliner', name: 'Premium Recliner', tier: 'Prime', width: .93, depthClosed: 1.079, depthOpen: 1.515, seatHeight: .52, armHeight: .68, capacity: 1, priceMultiplier: 1.6, upholstery: 'leather', defaultFinish: { uph: '#8a4a23', frame: '#3a3c40', metal: 'chrome' }, options: ['recline'], build: buildRecliner },
  { key: 'couple', name: 'Couple Loveseat', tier: 'Prime', width: 1.38, depthClosed: 1.009, depthOpen: 1.009, seatHeight: .52, armHeight: .68, capacity: 2, priceMultiplier: 2.4, upholstery: 'leather', defaultFinish: { uph: '#4a1418', frame: '#1b1b1d', metal: 'steel' }, options: ['centerArm'], build: buildCouple },
  { key: 'vip', name: 'VIP Luxury Recliner', tier: 'Luxe', width: 1, depthClosed: 1.285, depthOpen: 1.774, seatHeight: .53, armHeight: .705, capacity: 1, priceMultiplier: 2.2, upholstery: 'leather', defaultFinish: { uph: '#2d2d30', frame: '#1b1b1d', metal: 'brass' }, options: ['recline'], build: buildVip },
  { key: 'modern', name: 'Modern Fabric Seat', tier: 'Standard+', width: .57, depthClosed: .64, depthOpen: .64, seatHeight: .472, armHeight: .649, capacity: 1, priceMultiplier: 1.1, upholstery: 'fabric', defaultFinish: { uph: '#6f7d6a', frame: '#3a3c40', metal: 'steel', wood: '#a77c52' }, options: [], build: buildModern },
  { key: 'pod', name: 'Private Pod Suite', tier: 'Luxe', width: 1.234, depthClosed: .937, depthOpen: .937, seatHeight: .535, armHeight: .64, capacity: 1, priceMultiplier: 3, upholstery: 'leather', defaultFinish: { uph: '#d8cfc0', frame: '#4a3a2c', metal: 'brass' }, options: [], build: buildPod },
].map((design) => Object.freeze(design));

export const SEAT_DESIGN_BY_KEY = Object.fromEntries(SEAT_DESIGNS.map((item) => [item.key, item]));
export const ROOM_THEMES = [
  { key: 'multiplex', name: 'Classic Multiplex', defaultSeat: 'classic', style: 'panels', palette: { wall: '#1d1e23', feature: '#2b2e38', carpet: '#25272f' }, layout: { rows: 10, sec: [4, 10, 4], aisle: 1.2, side: 1.1, pitch: 1.2, riser: .38, front: 4.5, back: 2.2, minW: 14, height: 8, fill: .78, aspect: 2.39, stage: .6 }, lights: ['sconces', 'downlights', 'step-lights'], defaultFinish: SEAT_DESIGN_BY_KEY.classic.defaultFinish },
  { key: 'luxury', name: 'Premium Luxury Auditorium', defaultSeat: 'recliner', style: 'walnut', palette: { wall: '#3b2618', feature: '#5b3a24', carpet: '#3a2a20', curtain: '#cbb79a' }, layout: { rows: 7, sec: [3, 7, 3], aisle: 1.3, side: 1.2, pitch: 1.8, riser: .45, front: 4.5, back: 2, minW: 16, height: 7.5, fill: .8, aspect: 2.39, stage: .5 }, lights: ['cove', 'coffers', 'step-lights'], defaultFinish: SEAT_DESIGN_BY_KEY.recliner.defaultFinish },
  { key: 'largeformat', name: 'Large-Format Theatre', defaultSeat: 'classic', style: 'flutes', palette: { wall: '#0e0e10', feature: '#18181b', carpet: '#1a1b1f' }, layout: { rows: 11, sec: [4, 12, 4], aisle: 1.2, side: 1.2, pitch: 1.2, riser: .55, front: 5, back: 2, minW: 18, height: 12, fill: .95, aspect: 1.9, stage: .3 }, lights: ['acoustic-clouds', 'step-lights'], defaultFinish: { uph: '#2d2d30', frame: '#1b1b1d', metal: 'chrome' } },
  { key: 'immersive', name: 'Immersive Sound Cinema', defaultSeat: 'vip', style: 'hpanels', palette: { wall: '#141416', feature: '#1f2024', carpet: '#16171a' }, layout: { rows: 8, sec: [3, 8, 3], aisle: 1.3, side: 1.3, pitch: 2.3, riser: .45, front: 5, back: 2, minW: 18, height: 9, fill: .88, aspect: 2.39, stage: .4 }, lights: ['speaker-arrays', 'floor-led', 'step-lights'], defaultFinish: SEAT_DESIGN_BY_KEY.vip.defaultFinish },
  { key: 'vip', name: 'VIP Private Screening Room', defaultSeat: 'pod', style: 'wainscot', palette: { wall: '#cfc4b2', feature: '#5b3a24', carpet: '#1f3a3c', curtain: '#6a1420' }, layout: { rows: 3, sec: [4], aisle: 1.2, side: 1.3, pitch: 2, riser: .4, front: 3.5, back: 1.6, minW: 8.5, height: 4.5, fill: .78, aspect: 2.39, stage: .3 }, lights: ['brass-sconces', 'tray-cove', 'step-lights'], defaultFinish: SEAT_DESIGN_BY_KEY.pod.defaultFinish },
  { key: 'boutique', name: 'Modern Boutique Cinema', defaultSeat: 'modern', style: 'battens', palette: { wall: '#2a2b2e', feature: '#a77c52', carpet: '#2c2e30' }, layout: { rows: 8, sec: [3, 7, 3], aisle: 1.15, side: 1.1, pitch: 1.15, riser: .35, front: 4, back: 1.8, minW: 12, height: 6.5, fill: .8, aspect: 2.39, stage: .45 }, lights: ['linear-pendants', 'step-lights'], defaultFinish: SEAT_DESIGN_BY_KEY.modern.defaultFinish },
].map((theme) => Object.freeze(theme));
export const ROOM_THEME_BY_KEY = Object.fromEntries(ROOM_THEMES.map((theme) => [theme.key, theme]));
