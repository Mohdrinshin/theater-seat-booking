import * as THREE from 'three';

export function createScreenTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, '#111522'); background.addColorStop(.5, '#26243a'); background.addColorStop(1, '#27151d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(canvas.width * .5, canvas.height * .46, 30, canvas.width * .5, canvas.height * .46, canvas.width * .66);
  glow.addColorStop(0, 'rgba(84, 54, 104, 0.2)'); glow.addColorStop(1, 'rgba(5, 6, 12, 0.55)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f7f3f4'; ctx.font = '700 78px Arial, Helvetica, sans-serif';
  ctx.fillText('YOUR TRAILER HERE', canvas.width / 2, canvas.height / 2 - 32);
  ctx.fillStyle = '#c9c3d0'; ctx.font = '400 30px Arial, Helvetica, sans-serif';
  ctx.fillText('The feature will begin shortly', canvas.width / 2, canvas.height / 2 + 46);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
