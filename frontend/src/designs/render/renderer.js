import * as THREE from 'three';
import { THEATER_LIGHTING } from '../lighting.js';

export function getTheaterDeviceProfile() {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches || false;
  const mobile = coarsePointer || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const cores = navigator.hardwareConcurrency || 8;
  const memory = navigator.deviceMemory || 8;
  const initialQuality = cores <= 2 || memory <= 2 ? 'low' : mobile || cores <= 4 || memory <= 4 ? 'medium' : 'high';
  return { mobile, cores, memory, initialQuality };
}

export function pixelRatioForQuality(quality, profile) {
  const limits = profile.mobile
    ? { low: 1, medium: 1.1, high: 1.25 }
    : { low: 1, medium: 1.25, high: 1.5 };
  return Math.min(window.devicePixelRatio || 1, limits[quality] || limits.medium);
}

export function createTheaterRenderer(quality = 'high') {
  const profile = getTheaterDeviceProfile();
  const renderer = new THREE.WebGLRenderer({ antialias: !profile.mobile, powerPreference: 'high-performance' });
  renderer.theaterDeviceProfile = profile;
  renderer.setPixelRatio(pixelRatioForQuality(quality, profile));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = THEATER_LIGHTING.render.exposure;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}
