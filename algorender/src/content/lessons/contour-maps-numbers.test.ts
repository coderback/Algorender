// B4 of the math and ML path, "Contour maps": every number the lesson quotes
// is measured here from the code that draws it (the contour-maps visualiser
// and the height-table exercise), and must appear in the lesson exactly as
// written. The embedded visualisers are checked too: each preset exists, each
// starting step is a real frame, and the prediction challenge asks at least its
// goal. The lesson embeds one exercise, which practises its own visualiser.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contourMaps, contourWalk, height, heightTable, sliceShape, sliceSlopes, SURFACES, xSliceAt, ySliceAt, type ContourInput } from '@/algorithms/calculus/contour-maps';
import { getExercise } from '@/content/exercises';
import { hill } from '@/content/exercises/calculus';
import { fmt, fmtVec } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Vec } from '@/viz/plot/types';

const source = readFileSync(fileURLToPath(new URL('./contour-maps.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
/** LaTeX writes a minus as -, prose as −. */
const tex = (s: string) => s.replace(/−/g, '-');
const H3 = (v: number) => fmt(v, 3);

const inputOf = (preset: string) => {
  const ex = contourMaps.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`contour-maps has no example ${preset}`);
  return ex.make({ seed: 0, size: 0 }) as ContourInput;
};
const framesOf = (preset: string) => traceOf(contourMaps, inputOf(preset)).frames as { state: PlotState; checkpoint?: { question: string } }[];

describe('contour-maps embeds', () => {
  it('embeds real presets, at frames that exist, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? would always match empty.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /goal=\{(\d+)\}/.exec(m[0])?.[1];
      return {
        tag: m[1],
        slug: m[2],
        preset: m[3],
        step: m[4] === undefined ? null : Number(m[4]),
        goal: goal === undefined ? null : Number(goal),
      };
    });
    expect(found.map((e) => `${e.tag}:${e.preset}`)).toEqual(['Explore:table', 'PredictChallenge:walk', 'Explore:slices', 'Explore:saddle']);
    for (const e of found) {
      expect(e.slug).toBe('contour-maps');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
    expect(found.find((e) => e.tag === 'PredictChallenge')?.goal).toBe(5);
    // The walk opens with the question the lesson builds towards.
    expect(framesOf('walk')[0].checkpoint?.question).toBe('Walking along the contour line through P, will the height go up, go down or stay the same?');
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['height-table']);
    expect(getExercise('height-table')?.visualiser).toBe('contour-maps');
  });
});

describe('contour-maps quotes', () => {
  const s = SURFACES.hill;

  it('names the hill and works three heights', () => {
    expect(s.formula).toBe('8 − x²/2 − y²');
    for (const [x, y] of [
      [0.3, -1.7],
      [2, 1],
      [-3, 2],
    ])
      expect(height('hill', x, y)).toBe(8 - (x * x) / 2 - y * y);
    expect(body).toContain('f(x, y) = 8 - x^2/2 - y^2');
    expect(height('hill', 0, 0)).toBe(8);
    expect(body).toContain('At the top, $f(0, 0) = 8$');
    expect(height('hill', 2, 0)).toBe(6);
    expect(body).toContain('$f(2, 0) = 8 - 2^2/2 - 0 = 6$');
    expect(height('hill', 0, 2)).toBe(4);
    expect(body).toContain('$f(0, 2) = 8 - 0 - 4 = 4$');
  });

  it('lays out the table: its grid, and two of its rows', () => {
    const { xs, ys } = s.grid;
    expect([xs[0], xs[xs.length - 1], ys[0], ys[ys.length - 1]]).toEqual([-3, 3, 2, -2]);
    expect(body).toContain('with $x$ from −3 to 3 and $y$ from 2 down to −2');
    expect(body).toContain(`${xs.length} columns, one for each $x$, and ${ys.length} rows, one for each $y$`);
    const rows = heightTable('hill');
    const row = (y: number) => rows[ys.indexOf(y)].map(H3).join(', ');
    expect(body).toContain(`the top row, $y = ${ys[0]}$: ${row(2)}`);
    expect(body).toContain(`the middle row, $y = 0$: ${row(0)}`);
  });

  it('joins the heights into contours, 1 apart, from 7 down to 1', () => {
    expect(s.levels).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(body).toContain('one height at a time, from 7 down to 1');
    expect(body).toContain('Do the same for 6, 5, 4 and on down to 1');
    expect(body).toContain('1 apart in height');
    const { xs, ys } = s.grid;
    const onLevel = (level: number) => ys.flatMap((y) => xs.filter((x) => height('hill', x, y) === level).map((x): Vec => [x, y]));
    expect(onLevel(7).map((p) => tex(fmtVec(p)))).toEqual(['(0, 1)', '(0, -1)']);
    expect(body).toContain('the grid points $(0, 1)$ and $(0, -1)$, whose heights are 7');
    expect(onLevel(3)).toEqual([]);
    expect([height('hill', -3, 0), height('hill', -3, 1)]).toEqual([3.5, 2.5]);
    expect(body).toContain('between $(-3, 0)$ at height 3.5 and $(-3, 1)$ at height 2.5');
    // The lake at height 8 shrinks to the top: 8 is reached only at (0, 0).
    for (const [x, y] of [
      [0.01, 0],
      [0, -0.01],
      [1, 1],
    ])
      expect(height('hill', x, y)).toBeLessThan(8);
    expect(body).toContain('a lake filled to height 7: seen from above, the shoreline is the contour $f = 7$. Raise the water to 8 and the shore shrinks to the single point at the top');
    // Every contour is a closed ring inside the map: f = 1 reaches x = ±√14 and y = ±√7.
    expect(Math.sqrt(2 * (8 - 1))).toBeLessThan(s.x.max);
    expect(Math.sqrt(8 - 1)).toBeLessThan(s.y.max);
  });

  it('walks along the contour through P = (1, 1), then steps across it', () => {
    const input = inputOf('walk');
    expect(input).toEqual({ story: 'walk', surface: 'hill', p: [1, 1] });
    expect(body).toContain('$P$ stands on the hill at $(1, 1)$');
    const level = height('hill', 1, 1);
    expect(level).toBe(6.5);
    expect(body).toContain('$f(1, 1) = 8 - 0.5 - 1 = 6.5$, between the contour lines for 6 and 7');
    expect(s.levels).toContain(6);
    expect(s.levels).toContain(7);
    const w = contourWalk('hill', [1, 1]);
    expect(w.closed).toBe(true);
    const frames = framesOf('walk');
    for (let k = 0; k < 3; k++) expect(readout(frames[3].state, `step${k}`)).toBe('6.5');
    expect(body).toContain('the height reads 6.5 after every step');
    // Across, along x and along y.
    const steps: [Vec, Vec, string][] = [
      [[0.5, 1], [1.5, 1], 'x'],
      [[1, 0.5], [1, 1.5], 'y'],
    ];
    const [[xl, xr], [yd, yu]] = steps;
    expect([height('hill', ...xl), height('hill', ...xr)]).toEqual([6.875, 5.875]);
    expect(readout(frames[5].state, 'x-change')).toBe('−1');
    expect(body).toContain('From $(0.5, 1)$ to $(1.5, 1)$, one unit along $x$ through $P$, the height falls from 6.875 to 5.875, a change of −1');
    expect([height('hill', ...yd), height('hill', ...yu)]).toEqual([7.25, 5.25]);
    expect(readout(frames[6].state, 'y-change')).toBe('−2');
    expect(body).toContain('From $(1, 0.5)$ to $(1, 1.5)$, one unit along $y$, it falls from 7.25 to 5.25, a change of −2');
    expect(sliceSlopes('hill', [1, 1])).toEqual([-1, -2]);
    expect(body).toContain('twice as steep along $y$');
    // The drawn gap between the contours 6 and 7 through P: along y = 1 they cross x = 0 and √2; along x = 1, y = √0.5 and √1.5.
    const gap = (g: (t: number) => number, lo: number, hi: number) => {
      const at = (level: number) => {
        let [a, b] = [lo, hi];
        for (let k = 0; k < 80; k++) {
          const m = (a + b) / 2;
          if ((g(m) - level) * (g(a) - level) <= 0) b = m;
          else a = m;
        }
        return (a + b) / 2;
      };
      return Math.abs(at(6) - at(7));
    };
    const gx = gap((x) => height('hill', x, 1), 0, 2);
    const gy = gap((y) => height('hill', 1, y), 0.5, 1.5);
    expect([fmt(gx, 2), fmt(gy, 2)]).toEqual(['1.41', '0.52']);
    expect(Math.abs(gy - 0.5)).toBeLessThan(0.05);
    expect(gx).toBeGreaterThan(2 * gy);
    expect(body).toContain('where the ground drops 2 per unit they come about half a unit apart; where it drops 1 per unit, more than twice that');
  });

  it('slices the hill through P = (2, 0) and measures each slope by rise over run', () => {
    expect(inputOf('slices')).toEqual({ story: 'slices', surface: 'hill', p: [2, 0] });
    expect(body).toContain('Here $P$ is at $(2, 0)$');
    expect(s.xSlice(0)).toBe('8 − x²/2');
    expect(body).toContain('$f(x, 0) = 8 - x^2/2$, an upside-down parabola');
    expect(sliceShape(sliceSlopes('hill', [2, 0])[0], s.bend[0])).toBe('Neither');
    const xs = xSliceAt('hill', 0);
    expect([H3(xs(1.9)), H3(xs(2.1))]).toEqual(['6.195', '5.795']);
    expect(xs(2.1) - xs(1.9)).toBeCloseTo(-0.4, 12);
    expect((xs(2.1) - xs(1.9)) / 0.2).toBeCloseTo(-2, 12);
    expect(sliceSlopes('hill', [2, 0])[0]).toBe(-2);
    expect(body).toContain('From $x = 1.9$ to $x = 2.1$ the height goes from 6.195 to 5.795: a rise of −0.4 over a run of 0.2, a rate of −2 per unit');
    // Further out the slice drops faster: 2.5 from x = 2 to 3.
    expect(xs(2) - xs(3)).toBe(2.5);
    expect(body).toContain('further out it drops faster (2.5 from $x = 2$ to 3)');
    // P sits on both slices at its own height.
    expect(height('hill', 2, 0)).toBe(6);
    expect(body).toContain('So $P$ appears twice, once on each curve, at the same height 6');
    expect(s.ySlice(2)).toBe('6 − y²');
    expect(body).toContain('$f(2, y) = 6 - y^2$');
    const ys = ySliceAt('hill', 2);
    expect([H3(ys(-0.1)), H3(ys(0.1))]).toEqual(['5.99', '5.99']);
    expect(ys(0.1) - ys(-0.1)).toBe(0);
    expect(sliceSlopes('hill', [2, 0])[1]).toBe(0);
    expect(sliceShape(0, s.bend[1])).toBe('Peak');
    expect(body).toContain('At $y = -0.1$ and at $y = 0.1$ the height is 5.99 both times');
  });

  it('slices the saddle through (0, 0): a valley one way, a hill the other', () => {
    const saddle = SURFACES.saddle;
    expect(inputOf('saddle')).toEqual({ story: 'slices', surface: 'saddle', p: [0, 0] });
    expect(saddle.formula).toBe('(x² − y²)/2');
    expect(body).toContain('$f(x, y) = (x^2 - y^2)/2$');
    expect([saddle.xSlice(0), saddle.ySlice(0)]).toEqual(['x²/2', '−y²/2']);
    expect(body).toContain('the x-slice through $(0, 0)$ is $x^2/2$, an upright parabola, a valley');
    expect(body).toContain('The y-slice is $-y^2/2$, a hill');
    const [sx, sy] = sliceSlopes('saddle', [0, 0]);
    expect([sx, sy].map((v) => v === 0)).toEqual([true, true]);
    expect([sliceShape(sx, saddle.bend[0]), sliceShape(sy, saddle.bend[1])]).toEqual(['Valley', 'Peak']);
    expect(body).toContain('Both slopes are 0');
    // The contour f = 0 crosses itself at P: both diagonals have height 0.
    for (const t of [-2, -0.5, 1.5]) expect([height('saddle', t, t), height('saddle', t, -t)]).toEqual([0, 0]);
    expect(body).toContain('the contour $f = 0$ crosses itself at $P$ in an X');
  });

  it('names the exercise’s own hill, with its top at (1, 2), height 9', () => {
    expect(body).toContain('$f(x, y) = 2 - x^2 - 2y^2 + xy + 7y$, whose top is at $(1, 2)$, height 9');
    for (const [x, y] of [
      [0, 0],
      [-1.5, 3],
      [2.5, -0.5],
    ])
      expect(hill(x, y)).toBe(2 - x * x - 2 * y * y + x * y + 7 * y);
    expect(hill(1, 2)).toBe(9);
    for (let dx = -1; dx <= 1; dx += 0.25) for (let dy = -1; dy <= 1; dy += 0.25) if (dx || dy) expect(hill(1 + dx, 2 + dy)).toBeLessThan(9);
  });

  it('checks the quiz’s numbers', () => {
    const g = (x: number, y: number) => 2 * x + y * y;
    expect([g(3, 1), g(1, 3), 2 * 3 + 2 * 1]).toEqual([7, 11, 8]);
    expect(body).toContain('2 × 3 + 1² = 6 + 1 = 7. The point (1, 3) would give 2 + 9 = 11');
    expect(16 / 4).toBe(4);
    expect(body).toContain('a quarter of the distance');
    // x² + 3y with y held at 2.
    const k = (x: number, y: number) => x * x + 3 * y;
    for (const x of [-2, 0.5, 3]) expect(k(x, 2)).toBe(x * x + 6);
    expect(k(1, 2)).toBe(7);
    expect(body).toContain("choices: ['1 + 3y', 'x² + 3y', 'x² + 6', '7']");
    // The probe's shifted saddle: g = (y − 1)² − (x + 2)² at (−2, 1).
    const g2 = (x: number, y: number) => (y - 1) ** 2 - (x + 2) ** 2;
    expect(g2(-2, 1)).toBe(0);
    for (const t of [-0.5, 0.25, 1]) {
      expect(g2(-2 + t, 1)).toBeLessThan(0);
      expect(g2(-2, 1 + t)).toBeGreaterThan(0);
    }
  });
});
