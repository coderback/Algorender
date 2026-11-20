// B3 of the math and ML path, "What learning from examples means": every
// number the lesson quotes is measured here from the code that draws it, and
// must appear in the lesson exactly as written. The embedded visualisers are
// checked too: each preset exists, each starting step is a real frame, and the
// prediction challenge asks at least its goal.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bestLine, errors, lineOf, lineWins, loss, predict, REVISION, SPAN, splitStory, SPLIT, SPLIT_SEED, supervisedLearning } from '@/algorithms/ml/supervised-learning';
import { fmt } from '@/viz/plot/geometry';
import { traceOf } from '@/viz/plot/testing';
import type { PlotState } from '@/viz/plot/types';

const body = readFileSync(fileURLToPath(new URL('./supervised-learning.mdx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
/** LaTeX writes a minus as -, prose as −. */
const tex = (s: string) => s.replace(/−/g, '-');

const inputOf = (preset: string) => supervisedLearning.input.examples.find((e) => e.id === preset)!.make({ seed: 0, size: 0 });
const framesOf = (preset: string) => traceOf(supervisedLearning, inputOf(preset)).frames as { state: PlotState; checkpoint?: unknown }[];

function embeds() {
  return [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}(?:[^>]*?goal=\{(\d+)\})?[^>]*\/>/g)].map((m) => ({
    tag: m[1],
    slug: m[2],
    preset: m[3],
    step: m[4] === undefined ? null : Number(m[4]),
    goal: m[5] === undefined ? null : Number(m[5]),
  }));
}

describe('supervised-learning lesson', () => {
  it('embeds real presets, at frames that exist, with enough questions for its goal', () => {
    const found = embeds();
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found.filter((e) => e.tag === 'PredictChallenge')).toHaveLength(1);
    for (const e of found) {
      expect(e.slug).toBe('supervised-learning');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
    // The dragging section starts on the last frame, where both lines can be dragged.
    const drag = found.find((e) => e.tag === 'Explore' && e.step !== null)!;
    expect(drag.step).toBe(framesOf(drag.preset).length - 1);
    expect(body).toContain('<CodeExercise exercise="mean-squared-error" />');
  });
});

describe('supervised-learning quotes', () => {
  const input = inputOf('fit');
  if (input.story !== 'fit') throw new Error('fit is the fit story');
  const A = lineOf(input.line);
  const B = lineOf(input.other);
  const e = errors(A, input.points);

  it('lists the five examples', () => {
    expect(input.points).toBe(REVISION);
    expect(body).toContain(`Five students`);
    expect(REVISION).toHaveLength(5);
    const rows = REVISION.map((p) => `$(${fmt(p.x)}, ${fmt(p.y)})$`);
    expect(body).toContain(`${rows.slice(0, 4).join(', ')} and ${rows[4]}`);
  });

  it('works line A through: its guess, an error, the biggest miss, the squares and the loss', () => {
    expect(body).toContain(`call it line A: $\\hat{y} = ${fmt(A.w)}x + ${fmt(A.b)}$, so $w = ${fmt(A.w)}$ and $b = ${fmt(A.b)}$`);
    const p = input.points[1];
    const guess = predict(A, p.x);
    expect(body).toContain(`revised ${fmt(p.x)} hours it guesses $\\hat{y} = ${fmt(A.w)} \\times ${fmt(p.x)} + ${fmt(A.b)} = ${fmt(guess)}$, but the label is ${fmt(p.y)}`);
    expect(body).toContain(tex(`$e = ${fmt(guess)} - ${fmt(p.y)} = ${fmt(e[1])}$`));
    const sizes = e.map(Math.abs);
    const worst = sizes.indexOf(Math.max(...sizes));
    expect(body).toContain(`example ${worst + 1} is missed by the most, ${fmt(sizes[worst])}`);
    const sq = e.map((x) => fmt(x * x));
    expect(body).toContain(`The squares are ${sq.slice(0, 4).join(', ')} and ${sq[4]}`);
    const total = e.reduce((s, x) => s + x * x, 0);
    expect(body).toContain(`They add up to $${sq.join(' + ')} = ${fmt(total)}$`);
    expect(body).toContain(`\\text{MSE} = \\frac{${fmt(total)}}{5} = ${fmt(loss(A, input.points))}`);
    // "an error of 1.5 costs 2.25, nine times what an error of 0.5 costs": both errors occur in the example.
    expect(sizes).toContain(1.5);
    expect(sizes).toContain(0.5);
    expect(body).toContain(`an error of 1.5 costs ${fmt(1.5 ** 2)}, nine times what an error of 0.5 costs`);
    expect(1.5 ** 2 / 0.5 ** 2).toBe(9);
  });

  it('compares line B', () => {
    expect(body).toContain(`$\\hat{y} = ${fmt(B.w)}x + ${fmt(B.b)}$. Its loss is ${fmt(loss(B, input.points), 4)}`);
    expect(loss(A, input.points)).toBeLessThan(loss(B, input.points));
  });

  it('quotes the best the handles reach, and the best line of all', () => {
    let best = { l: Infinity, left: 0, right: 0 };
    for (let a = 0; a <= 16; a++)
      for (let b = 0; b <= 16; b++) {
        const l = loss(lineOf({ left: a / 2, right: b / 2 }), REVISION);
        if (l < best.l - 1e-12) best = { l, left: a / 2, right: b / 2 };
      }
    expect(body).toContain(`the lowest you can reach is ${fmt(best.l, 4)}, with the left end at height ${fmt(best.left)} (x = 0) and the right end at ${fmt(best.right)} (x = ${SPAN})`);
    const top = bestLine(REVISION);
    expect(body).toContain(`$w = ${fmt(top.w)}$ and $b = ${fmt(top.b)}$, gets ${fmt(loss(top, REVISION), 4)}`);
  });

  it('splits the data and reports both models’ losses on training and test examples', () => {
    expect(inputOf('split')).toEqual({ story: 'split', seed: SPLIT_SEED });
    const s = splitStory(SPLIT_SEED);
    expect(body).toContain(`Here are ${SPLIT.n} examples: ${SPLIT.test} are picked at random for the test set and the other ${s.train.length} are the training set`);
    expect(body).toContain(`Two models learn from the ${s.train.length}.`);
    expect(s.trainLoss.memoriser).toBe(0);
    expect(body).toContain(`The line's training loss is ${fmt(s.trainLoss.line, 3)}`);
    expect(body).toContain(`the line's loss is ${fmt(s.testLoss.line, 3)} and the memoriser's is ${fmt(s.testLoss.memoriser, 3)}`);
    expect(s.testLoss.line).toBeLessThan(s.testLoss.memoriser);
  });

  it('counts how often the line wins on fresh data', () => {
    expect(body).toContain(`Over 500 random datasets like this one, the line beat the memoriser on the test set ${lineWins(500)} times`);
  });
});
