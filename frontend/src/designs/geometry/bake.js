import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();

export function bakeSeat(design, options = {}) {
  const cacheKey = `${design.key}:${JSON.stringify(options)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const root = design.build(options);
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.userData.mat) return;
    const key = mesh.userData.mat;
    let geometry = mesh.geometry.clone();
    // Normalize index layouts first; BufferGeometryUtils requires every part in
    // a material bucket to use either indexed or non-indexed attributes.
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometry.applyMatrix4(mesh.matrixWorld);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(geometry);
  });
  const baked = [...buckets].map(([matKey, geometries]) => {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error(`Could not bake ${design.key} seat geometry for ${matKey}`);
    geometries.forEach((geometry) => geometry.dispose());
    return { matKey, geometry: merged };
  });
  root.traverse((mesh) => mesh.geometry?.dispose());
  cache.set(cacheKey, baked);
  return baked;
}
