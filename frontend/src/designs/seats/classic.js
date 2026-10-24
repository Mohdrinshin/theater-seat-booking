import { group, hard, soft, cushion, cupHolder, pivot } from './common.js';
export function buildClassic() {
  const g = group();
  for (const s of [-1, 1]) {
    hard(g, 'frame', .045, .6, .46, s * .255, .3, .03, .02);
    hard(g, 'metal', .09, .012, .3, s * .255, .006, .05, .005);
    soft(g, 'plastic', .085, .05, .44, s * .255, .625, 0);
  }
  cupHolder(g, .255, .656, -.17);
  pivot(g, 0, .43, -.02, .05, (p) => { cushion(p, 'fabric', .44, .11, .46, 0, 0, 0, { bulge: .3 }); hard(p, 'plastic', .42, .05, .42, 0, -.065, .01); });
  pivot(g, 0, .5, .22, .2, (p) => {
    hard(p, 'plastic', .47, .62, .05, 0, .33, .045, .04);
    for (let i = 0; i < 3; i += 1) soft(p, 'fabric', .43, .19, .08, 0, .13 + i * .2, 0, { bulge: .35 });
  });
  return g;
}
