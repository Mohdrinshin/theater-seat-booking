import * as THREE from 'three';

function canvasTexture(draw, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function createTextures() {
  const weave = canvasTexture((ctx, n) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = '#b0b0b0'; ctx.lineWidth = 1;
    for (let p = 0; p < n; p += 6) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, n); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(n, p); ctx.stroke();
      ctx.strokeStyle = '#585858'; ctx.beginPath(); ctx.moveTo(p + 3, 0); ctx.lineTo(p + 3, n); ctx.stroke();
      ctx.strokeStyle = '#b0b0b0';
    }
  });
  const grain = canvasTexture((ctx, n) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, n, n);
    for (let y = 4; y < n; y += 9) for (let x = 4; x < n; x += 9) {
      ctx.fillStyle = (x + y) % 3 ? '#a0a0a0' : '#5f5f5f';
      ctx.beginPath(); ctx.ellipse(x, y, 2.1, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    }
  });
  weave.repeat.set(18, 18); grain.repeat.set(12, 12);
  return { weave, grain };
}
