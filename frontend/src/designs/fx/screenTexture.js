import * as THREE from 'three';

export function createScreenTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 896;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const sky = ctx.createLinearGradient(0, 0, 0, 448);
  sky.addColorStop(0, '#111a30'); sky.addColorStop(.52, '#a96c62'); sky.addColorStop(.72, '#e6b583'); sky.addColorStop(1, '#170f18');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 448);
  ctx.fillStyle = 'rgba(21, 18, 24, 0.92)';
  ctx.beginPath(); ctx.moveTo(0, 330); ctx.quadraticCurveTo(240, 260, 450, 332); ctx.quadraticCurveTo(735, 385, 1024, 305); ctx.lineTo(1024, 448); ctx.lineTo(0, 448); ctx.closePath(); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
