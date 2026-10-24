import * as THREE from 'three';
import { group, hard, soft, cushion, cupHolder, pivot } from './common.js';
export function buildCouple({ centerArm = true } = {}) {
  const g = group(); hard(g, 'plastic', 1.2, .1, .74, 0, .05, .05, .05);
  for (const s of [-1, 1]) { soft(g, 'leather', .16, .5, .8, s * .6, .36, .05); soft(g, 'leather', .18, .08, .78, s * .6, .64, .05); }
  hard(g, 'plastic', .08, .18, .4, 0, .52, .05);
  const arm = new THREE.Group(); arm.position.set(0, .62, 0); arm.rotation.z = centerArm ? 0 : Math.PI / 2; g.add(arm);
  soft(arm, 'leather', .1, .09, .56, 0, 0, 0); cupHolder(arm, 0, .046, -.2);
  pivot(g, 0, .44, -.02, .04, (p) => { for (const s of [-1, 1]) cushion(p, 'leather', .48, .16, .6, s * .29, 0, 0); });
  pivot(g, 0, .5, .33, .25, (p) => { soft(p, 'leather', 1.24, .8, .12, 0, .42, .07); for (const s of [-1, 1]) { soft(p, 'leather', .48, .42, .17, s * .29, .27, -.04); soft(p, 'leather', .4, .2, .15, s * .29, .66, -.04); } });
  return g;
}
