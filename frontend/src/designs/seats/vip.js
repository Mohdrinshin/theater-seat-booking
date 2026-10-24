import { group, hard, soft, cushion, cupHolder, pivot } from './common.js';
export function buildVip({ recline = true } = {}) {
  const g = group(); hard(g, 'plastic', .9, .1, .84, 0, .05, .06, .05);
  hard(g, 'led', .84, .01, .01, 0, .02, -.37, .004);
  for (const s of [-1, 1]) {
    soft(g, 'leather', .22, .5, .9, s * .39, .36, .05);
    soft(g, 'leather', .22, .09, .86, s * .39, .66, .05);
    hard(g, 'wood', .12, .012, .34, s * .39, .71, .2, .006);
    cupHolder(g, s * .39, .71, -.2);
  }
  pivot(g, 0, .44, -.02, .04, (p) => cushion(p, 'leather', .58, .18, .64, 0, 0, 0));
  pivot(g, 0, .5, .38, recline ? .5 : .28, (p) => {
    soft(p, 'leather', .86, .98, .2, 0, .5, .1, { bend: -.1 });
    for (const x of [-.21, -.07, .07, .21]) soft(p, 'leather', .14, .6, .14, x, .34, -.04, { bulge: .45 });
    soft(p, 'leather', .56, .24, .2, 0, .82, -.05);
  });
  pivot(g, 0, .42, -.34, recline ? 1.35 : .1, (p) => soft(p, 'leather', .58, .4, .12, 0, -.2, 0));
  return g;
}
