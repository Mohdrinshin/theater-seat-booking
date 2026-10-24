import { group, hard, soft, cushion, cupHolder, pivot } from './common.js';
export function buildPod() {
  const g = group();
  for (const s of [-1, 1]) {
    hard(g, 'shell', .074, 1.22, .92, s * .58, .61, .04, .04);
    soft(g, 'leather', .04, .55, .7, s * .525, .82, .05);
    soft(g, 'leather', .16, .42, .7, s * .42, .33, .02);
    soft(g, 'leather', .16, .12, .66, s * .42, .58, 0);
  }
  hard(g, 'plastic', 1.1, .12, .84, 0, .06, .04, .05);
  hard(g, 'led', 1, .01, .01, 0, .02, -.39, .004); cupHolder(g, .42, .646, -.2);
  pivot(g, 0, .45, -.03, .04, (p) => cushion(p, 'leather', .66, .17, .64, 0, 0, 0));
  pivot(g, 0, .5, .28, .18, (p) => { soft(p, 'leather', .68, .75, .2, 0, .4, 0); soft(p, 'leather', .5, .24, .18, 0, .88, -.04); });
  return g;
}
