import { group, hard, soft, cushion, pivot } from './common.js';
export function buildModern() {
  const g = group();
  for (const s of [-1, 1]) {
    hard(g, 'frame', .03, .62, .05, s * .25, .31, .1, .01);
    hard(g, 'metal', .07, .012, .32, s * .25, .006, .02, .005);
    hard(g, 'wood', .05, .028, .36, s * .25, .635, -.01, .01);
  }
  pivot(g, 0, .43, -.03, .05, (p) => { cushion(p, 'fabric', .44, .085, .44, 0, 0, 0); hard(p, 'plastic', .43, .03, .42, 0, -.055, 0); });
  pivot(g, 0, .48, .2, .2, (p) => { soft(p, 'plastic', .47, .62, .035, 0, .33, .045, { bend: -.05 }); soft(p, 'fabric', .44, .58, .06, 0, .33, 0); });
  return g;
}
