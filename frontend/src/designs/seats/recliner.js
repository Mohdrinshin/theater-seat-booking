import { group, hard, soft, cushion, cupHolder, pivot } from './common.js';
export function buildRecliner({ recline = false } = {}) {
  const g = group();
  hard(g, 'plastic', .74, .1, .78, 0, .05, .06, .045); hard(g, 'metal', .76, .018, .018, 0, .1, -.33, .006);
  for (const s of [-1, 1]) { soft(g, 'leather', .17, .5, .84, s * .37, .36, .06, { axis: 'x' }); soft(g, 'leather', .19, .08, .82, s * .37, .64, .04); }
  cupHolder(g, .37, .686, -.24); hard(g, 'plastic', .012, .07, .13, -.282, .48, -.18, .005);
  pivot(g, 0, .44, -.02, .04, (p) => cushion(p, 'leather', .56, .16, .6, 0, 0, 0));
  pivot(g, 0, .5, .34, recline ? .5 : .25, (p) => {
    soft(p, 'leather', .6, .82, .12, 0, .45, .07); soft(p, 'leather', .54, .36, .18, 0, .24, -.04);
    soft(p, 'leather', .54, .3, .16, 0, .56, -.03); soft(p, 'leather', .46, .2, .16, 0, .86, -.02);
  });
  pivot(g, 0, .42, -.31, recline ? 1.28 : .12, (p) => {
    soft(p, 'leather', .54, .34, .1, 0, -.17, 0);
    for (const s of [-1, 1]) hard(p, 'metal', .02, .3, .03, s * .2, -.17, .06, .008);
  });
  return g;
}
