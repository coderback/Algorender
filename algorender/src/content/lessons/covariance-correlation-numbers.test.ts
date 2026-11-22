// B6 of the math and ML path, "Covariance and correlation": every number the
// lesson quotes is measured here from the code that draws it (the correlation
// visualiser and the correlation exercise), and must appear in the lesson
// exactly as written. The embeds are checked too: each preset exists, the
// prediction challenge asks at least its goal, the lesson embeds its one
// exercise, which practises this lesson's visualiser, and links only lessons
// on what it builds on.

import { compile } from '@mdx-js/mdx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import remarkMath from 'remark-math';
import { describe, expect, it } from 'vitest';
import {
  centre,
  correlation,
  correlationOf,
  covariance,
  DATA,
  dot,
  dragCorr,
  GENTLE,
  mean,
  MINUTES,
  norm,
  onLine,
  products,
  spread,
  STEEP,
  type CorrInput,
} from '@/algorithms/probability/correlation';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { correlate } from '@/content/exercises/correlation';
import { fmt } from '@/viz/plot/geometry';
import { readout, traceOf } from '@/viz/plot/testing';
import { misconceptionsIn, promptsIn } from './assessment';
import { lessons } from './index';
import { quizzesIn } from './quizzes';

const source = readFileSync(fileURLToPath(new URL('./covariance-correlation.mdx', import.meta.url)), 'utf8');
const body = source.replace(/\s+/g, ' ');
const f3 = (v: number) => fmt(v, 3);
const words = (s: string) => s.trim().split(/\s+/).length;

const inputOf = (preset: string) => {
  const ex = correlation.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`correlation has no example ${preset}`);
  return ex.make({ seed: 1, size: 0 }) as CorrInput;
};
const framesOf = (preset: string) => traceOf(correlation, inputOf(preset)).frames;

describe('covariance-correlation embeds', () => {
  it('embeds real presets, with one prediction challenge that asks at least its goal', () => {
    // The goal is read from the whole tag: an optional group after a lazy [^>]*? never captures it.
    const found = [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*\/>/g)].map((m) => {
      const goal = /\bgoal=\{(\d+)\}/.exec(m[0])?.[1];
      return { tag: m[1], slug: m[2], preset: m[3], step: m[4] === undefined ? null : Number(m[4]), goal: goal === undefined ? null : Number(goal) };
    });
    expect(found.map((e) => e.preset)).toEqual(['revision', 'cosine', 'ring', 'u-shape', 'outlier']);
    expect(found.length).toBe([...body.matchAll(/<(Explore|PredictChallenge) /g)].length);
    expect(found.filter((e) => e.tag === 'PredictChallenge').map((e) => [e.preset, e.goal])).toEqual([['cosine', 5]]);
    for (const e of found) {
      expect(e.slug).toBe('correlation');
      const frames = framesOf(e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds one exercise, which practises this lesson’s visualiser', () => {
    const used = [...source.matchAll(/exercise="([a-z-]+)"/g)].map((m) => m[1]);
    expect(used).toEqual(['correlation']);
    expect(getExercise('correlation')?.visualiser).toBe('correlation');
  });

  it('links only lessons on what it builds on', () => {
    const { concepts } = loadConcepts();
    const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
      for (const p of concepts.find((c) => c.id === id)?.prereqs ?? []) if (!seen.has(p)) ancestors(p, seen.add(p));
      return seen;
    };
    const before = ancestors('covariance-correlation');
    expect([...before]).toEqual(expect.arrayContaining(['random-variables', 'dot-product']));
    const links = [...body.matchAll(/\]\(\/learn\/([a-z-]+)\)/g)].map((m) => m[1]);
    expect(links).toEqual(['dot-product']);
    for (const target of links) expect(before.has(lessons.find((l) => l.slug === target)!.concept), target).toBe(true);
  });

  it('spreads its right answers over the choices (quizzes keep the written order)', () => {
    const answers = [...source.matchAll(/\banswer: (\d+)/g)].map((m) => Number(m[1]));
    expect(answers.length).toBeGreaterThanOrEqual(8);
    expect(new Set(answers).size).toBeGreaterThanOrEqual(3);
    for (const k of new Set(answers)) expect(answers.filter((a) => a === k).length, `answer ${k}`).toBeLessThanOrEqual(answers.length * 0.6);
  });

  it('gives none of the challenge’s answers away before it', () => {
    const before = body.slice(body.indexOf('Your turn: correlation as a cosine'), body.indexOf('<PredictChallenge'));
    for (const v of ['12', '5.099', '4.472', '0.526', '58', '√26', '√20', '(−3, −1, 0, 4)']) expect(before).not.toContain(v);
    // Nor do the captions and the sentences leading into the runs that open with a prediction.
    for (const preset of ['ring', 'u-shape', 'outlier']) {
      const at = body.indexOf(`settings={{ preset: '${preset}' }}`);
      expect(at, preset).toBeGreaterThan(0);
      const end = body.indexOf('/>', at);
      // Everything since the previous embed or correction, bold marks dropped.
      const shown = body.slice(Math.max(body.lastIndexOf('</Misconception>', at), body.lastIndexOf('/>', at - 1)), end).replace(/\*/g, '');
      expect(shown, preset).not.toMatch(/cancel|strong|pulls r|r = 0 again|0\.89|straight-line lean/);
    }
  });

  it('compiles, with its sections in the learning loop’s order and its length in range', async () => {
    await compile(source, { remarkPlugins: [remarkMath] });
    const steps = [...source.matchAll(/<Section step="([a-z]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['hook', 'parts', 'see', 'predict', 'do', 'check', 'explain', 'recap']);
    const lines = source.split('\n').length;
    expect(lines).toBeGreaterThanOrEqual(280);
    expect(lines).toBeLessThanOrEqual(400);
    expect(words(source)).toBeGreaterThan(2500);
  });
});

describe('covariance-correlation quotes: the four corners', () => {
  const { xs, ys } = DATA.revision;

  it('describes the students and their means', () => {
    expect(inputOf('revision')).toEqual({ story: 'quadrants', xs: [...xs], ys: [...ys] });
    expect(xs.join(', ')).toBe('1, 2, 3, 5, 6, 7');
    expect(ys.join(', ')).toBe('3, 4, 7, 4, 8, 10');
    expect(body).toContain('The hours are 1, 2, 3, 5, 6 and 7, so $\\bar{x} = 4$; the scores are 3, 4, 7, 4, 8 and 10, so $\\bar{y} = 6$.');
    expect([mean(xs), mean(ys)]).toEqual([4, 6]);
    expect(body).toContain('the middle, $(4, 6)$');
    // The hook's two students below the trend.
    expect([xs[2], ys[2], xs[3], ys[3]]).toEqual([3, 7, 5, 4]);
    expect(body).toContain('one student revised for 3 hours and scored 7, another revised for 5 and scored only 4');
    expect(xs.length).toBe(6);
  });

  it('measures the products, the covariance, minutes and r', () => {
    const p = products(xs, ys);
    expect(p).toEqual([9, 4, -1, -2, 4, 12]);
    expect(body).toContain('The six products are 9, 4, −1, −2, 4 and 12.');
    expect(body).toContain('Student 3, at $(3, 7)$, revised less than average but scored more: a − rectangle. Student 4, at $(5, 4)$');
    expect([p[2], p[3]].every((v) => v < 0)).toBe(true);
    expect(body).toContain('\\text{cov} = \\frac{9 + 4 - 1 - 2 + 4 + 12}{6} = \\frac{26}{6} \\approx 4.333');
    const cov = covariance(xs, ys);
    expect(cov).toBeCloseTo(26 / 6, 12);
    expect(f3(cov)).toBe('4.333');
    expect(f3(MINUTES * cov)).toBe('260');
    expect(body).toContain('every gap $x - \\bar{x}$ is 60 times bigger, so every product is too, and the covariance becomes 260');
    const minutes = xs.map((x) => MINUTES * x);
    expect(covariance(minutes, ys)).toBeCloseTo(260, 9);
    const [sx, sy] = [spread(xs), spread(ys)];
    expect(centre(xs).reduce((s, v) => s + v * v, 0)).toBe(28);
    expect([sx.toFixed(3), f3(MINUTES * sx), f3(sy)]).toEqual(['2.160', '129.615', '2.517']);
    expect(centre(xs).map((d) => d * d)).toEqual([9, 4, 1, 1, 4, 9]);
    expect(centre(ys).map((d) => d * d)).toEqual([9, 4, 1, 4, 4, 16]);
    expect(centre(ys).reduce((s, v) => s + v * v, 0)).toBe(38);
    expect(f3(Math.sqrt(38 / 6))).toBe('2.517');
    expect(body).toContain('$s_x = \\sqrt{28/6} \\approx 2.160$ hours (or 129.615 minutes), since the squared gaps $9 + 4 + 1 + 1 + 4 + 9$ add up to 28. For the scores the squared gaps are $9 + 4 + 1 + 4 + 4 + 16 = 38$, so $s_y = \\sqrt{38/6} \\approx 2.517$.');
    const r = correlationOf(xs, ys);
    expect(f3(r)).toBe('0.797');
    expect(f3(correlationOf(minutes, ys))).toBe('0.797');
    expect(body).toContain('r = \\frac{\\text{cov}}{s_x\\, s_y} = \\frac{4.333}{2.160 \\times 2.517} \\approx 0.797');
    expect(f3(4.333 / (2.16 * 2.517))).toBe('0.797');
    expect(body).toContain('$r$ is 0.797 either way');
    // Dividing by n − 1 everywhere gives the same r.
    const S = p.reduce((s, v) => s + v, 0);
    const n = xs.length;
    const sq = (v: readonly number[]) => centre(v).reduce((s, d) => s + d * d, 0);
    expect(S / (n - 1) / (Math.sqrt(sq(xs) / (n - 1)) * Math.sqrt(sq(ys) / (n - 1)))).toBeCloseTo(r, 12);
    // The visualiser shows the same numbers.
    const frames = framesOf('revision');
    expect(readout(frames[n + 2].state, 'cov')).toBe('4.333');
    expect(readout(frames[n + 3].state, 'covM')).toBe('260');
    expect(readout(frames[n + 3].state, 'sx')).toBe('129.615');
    expect(frames[n + 3].note).toContain('= 2.160 hours, or 129.615 minutes, and sy = 2.517 marks');
    expect(readout(frames[n + 4].state, 'r')).toBe('0.797');
  });

  it('writes r as a cosine of the students’ centred lists', () => {
    const [a, b] = [centre(xs), centre(ys)];
    expect(a).toEqual([-3, -2, -1, 1, 2, 3]);
    expect(b).toEqual([-3, -2, 1, -2, 2, 4]);
    expect(body).toContain('a &= x - \\bar{x} = (-3, -2, -1, 1, 2, 3) \\\\ b &= y - \\bar{y} = (-3, -2, 1, -2, 2, 4)');
    expect(dot(a, b)).toBe(26);
    expect(body).toContain('so $a \\cdot b = 26$, which is $n$ times the covariance');
    expect([dot(a, a), dot(b, b)]).toEqual([28, 38]);
    expect(body).toContain('$|a| = \\sqrt{28}$ and $|b| = \\sqrt{38}$');
    expect(Math.sqrt(6) * spread(xs)).toBeCloseTo(Math.sqrt(28), 12);
    expect(Math.sqrt(6) * spread(ys)).toBeCloseTo(Math.sqrt(38), 12);
    expect(body).toContain('$|a|^2$ is the sum of the squared gaps, $28 = 6 \\times s_x^2$, so $|a| = \\sqrt{6}\\, s_x$, and in the same way $|b| = \\sqrt{6}\\, s_y$');
    expect([f3(norm(a)), f3(norm(b))]).toEqual(['5.292', '6.164']);
    expect(f3(26 / (norm(a) * norm(b)))).toBe('0.797');
    expect(body).toContain('$26 / (5.292 \\times 6.164)$, which is 0.797 again');
    expect(Math.round((Math.acos(correlationOf(xs, ys)) * 180) / Math.PI)).toBe(37);
    expect(body).toContain("the angle between $a$ and $b$ is the angle whose cosine is 0.797: about 37°, as a calculator's $\\cos^{-1}$ key will tell you");
  });
});

describe('covariance-correlation quotes: the challenge, patterns and the far point', () => {
  it('works the challenge the cosine way', () => {
    const { xs, ys } = DATA.cosine;
    expect(inputOf('cosine')).toEqual({ story: 'cosine', xs: [...xs], ys: [...ys] });
    expect(body).toContain('Now four new points: $(2, 6)$, $(4, 2)$, $(5, 4)$ and $(9, 8)$.');
    expect([mean(xs), mean(ys)]).toEqual([5, 5]);
    const [a, b] = [centre(xs), centre(ys)];
    expect([a, b]).toEqual([
      [-3, -1, 0, 4],
      [1, -3, -1, 3],
    ]);
    expect(products(xs, ys).map((v) => v + 0)).toEqual([-3, 3, 0, 12]);
    expect(dot(a, b)).toBe(12);
    expect([dot(a, a), dot(b, b), f3(norm(a)), f3(norm(b))]).toEqual([26, 20, '5.099', '4.472']);
    expect(f3(correlationOf(xs, ys))).toBe('0.526');
    expect(Math.round((Math.acos(correlationOf(xs, ys)) * 180) / Math.PI)).toBe(58);
    expect(body).toContain("For these four points $r$ came out at 0.526, the cosine of an angle of about 58° between $a$ and $b$: a weaker upward lean than the students'.");
    expect(correlationOf(xs, ys)).toBeLessThan(correlationOf(DATA.revision.xs, DATA.revision.ys));
    // The lines: b = 2a gives r = 1, b = −0.5a gives r = −1.
    expect([STEEP, GENTLE]).toEqual([2, -0.5]);
    expect(correlationOf(xs, onLine(xs, ys, STEEP))).toBeCloseTo(1, 12);
    expect(correlationOf(xs, onLine(xs, ys, GENTLE))).toBeCloseTo(-1, 12);
    expect(body).toContain('Moved onto the line $y - \\bar{y} = 2(x - \\bar{x})$');
    expect(body).toContain('$y - \\bar{y} = -0.5\\,(x - \\bar{x})$, $b = -0.5\\,a$ points straight back along $a$, and $r = -1$');
    // On a flat line every y is the same: no spread, so the module refuses it and the lesson says r isn't defined.
    expect(onLine(xs, ys, 0).every((y) => y === mean(ys))).toBe(true);
    expect(body).toContain('So $r = \\pm 1$ exactly when the points lie on a sloping line');
    expect(body).toContain("so $s_y = 0$ and $r$ isn't defined at all");
    const frames = framesOf('cosine');
    expect([readout(frames[2].state, 'ab'), readout(frames[3].state, 'na'), readout(frames[4].state, 'nb'), readout(frames[5].state, 'r')]).toEqual(['12', '5.099', '4.472', '0.526']);
    expect([readout(frames[6].state, 'r'), readout(frames[7].state, 'r')]).toEqual(['1', '−1']);
  });

  it('cancels the ring’s and the U’s rectangles', () => {
    const ring = DATA.ring;
    expect(ring.xs.length).toBe(8);
    expect([mean(ring.xs), mean(ring.ys)]).toEqual([5, 5]);
    expect(body).toContain('Here are eight points on a ring around $(5, 5)$');
    const p = products(ring.xs, ring.ys);
    expect(p.filter((v) => v > 0)).toEqual([3, 3, 3, 3]);
    expect(p.filter((v) => v < 0)).toEqual([-3, -3, -3, -3]);
    expect(body).toContain('Four points sit in + corners and four in − corners, each with a product of size 3: the + rectangles add up to 12 and the − ones to −12, so the covariance is 0 and $r = 0$.');
    expect(correlationOf(ring.xs, ring.ys)).toBe(0);
    const last = framesOf('ring').at(-1)!.state;
    expect([readout(last, 'plus'), readout(last, 'minus'), readout(last, 'r')]).toEqual(['12', '−12', '0']);

    const u = DATA['u-shape'];
    expect(u.xs.length).toBe(7);
    expect(u.ys).toEqual(u.xs.map((x) => (x - 4) ** 2));
    expect(body).toContain('Seven points on $y = (x - 4)^2$ fall and then rise');
    const q = products(u.xs, u.ys);
    expect([q.filter((v) => v > 0).reduce((s, v) => s + v, 0), q.filter((v) => v < 0).reduce((s, v) => s + v, 0)]).toEqual([18, -18]);
    expect(body).toContain('the + rectangles (18) and the − ones (−18) cancel, and $r = 0$ again');
    // Drag the two left-hand points down to the bottom.
    let dragged = inputOf('u-shape');
    dragged = dragCorr(dragged, 'p0', [1, 0]);
    dragged = dragCorr(dragged, 'p1', [2, 0]);
    expect(dragged.ys.slice(0, 2)).toEqual([0, 0]);
    expect(fmt(correlationOf(dragged.xs, dragged.ys))).toBe('0.81');
    expect(body).toContain('$r$ jumps to about 0.81');
  });

  it('measures the far point', () => {
    const { xs, ys } = DATA.outlier;
    const m = xs.length - 1;
    expect(m).toBe(6);
    expect(correlationOf(xs.slice(0, m), ys.slice(0, m))).toBe(0);
    expect([xs[m], ys[m]]).toEqual([9, 9]);
    expect(body).toContain('Now the other way round: six points with no lean at all, $r = 0$, and one more far out at $(9, 9)$.');
    expect([f3(mean(xs)), f3(mean(ys))]).toEqual(['3.429', '3']);
    expect(f3(correlationOf(xs, ys))).toBe('0.89');
    expect(body).toContain('The far point drags the middle to $(3.429, 3)$ and $r$ from 0 to 0.89.');
    const p = products(xs, ys);
    const S = p.reduce((s, v) => s + v, 0);
    expect([f3(p[m]), f3(S), fmt((100 * p[m]) / S, 0)]).toEqual(['33.429', '39', '86']);
    expect(body).toContain('Its own rectangle is 33.429 of the total 39, about 86%');
    const last = framesOf('outlier').at(-1)!.state;
    expect([readout(last, 'po'), readout(last, 'sum'), readout(last, 'r1')]).toEqual(['33.429', '39', '0.89']);
    const moved = dragCorr(inputOf('outlier'), `p${m}`, [9, 0]);
    expect(fmt(correlationOf(moved.xs, moved.ys))).toBe('−0.63');
    expect(body).toContain('Drag it down to $(9, 0)$ and the same point swings $r$ round to about −0.63.');
  });

  it('quotes the exercise’s ring test', () => {
    const ring = getExercise('correlation')!.tests.find((t) => t.name.startsWith('a ring'))!;
    expect(ring.input).toEqual({ xs: [...DATA.ring.xs], ys: [...DATA.ring.ys] });
    expect(correlate(ring.input).r).toBe(0);
    expect(body).toContain('One test is the ring, where the products cancel and $r = 0$.');
  });
});

describe('covariance-correlation: quiz and probes', () => {
  it('checks the quiz', () => {
    const q1 = { xs: [0, 2, 4], ys: [1, 5, 3] };
    expect([mean(q1.xs), mean(q1.ys)]).toEqual([2, 3]);
    expect(products(q1.xs, q1.ys)).toEqual([4, 0, 0]);
    expect(covariance(q1.xs, q1.ys)).toBeCloseTo(4 / 3, 12);
    expect(q1.xs.reduce((s, x, i) => s + x * q1.ys[i], 0) / 3).toBeCloseTo(22 / 3, 12);
    // Exactly on a falling line, r = −1; scattered around a steep rising line, 0 < r < 1.
    expect(correlationOf([1, 2, 3, 4], [1, 2, 3, 4].map((x) => 8 - 0.2 * x))).toBeCloseTo(-1, 12);
    const scattered = correlationOf([1, 2, 3, 4], [10, 28, 33, 51]);
    expect(scattered).toBeGreaterThan(0);
    expect(scattered).toBeLessThan(1);
    // Twelve points on a circle.
    const circle = Array.from({ length: 12 }, (_, i) => [Math.cos((i * Math.PI) / 6), Math.sin((i * Math.PI) / 6)]);
    expect(Math.abs(correlationOf(circle.map((p) => p[0]), circle.map((p) => p[1])))).toBeLessThan(1e-12);
    // Units: r is unchanged; the slips divide or multiply it by 2.54.
    const h = [150, 160, 172, 181, 190];
    const w = [52, 61, 60, 75, 80];
    expect(correlationOf(h.map((x) => x / 2.54), w)).toBeCloseTo(correlationOf(h, w), 12);
    expect([f3(0.6 / 2.54), f3(0.6 * 2.54)]).toEqual(['0.236', '1.524']);
    expect([10 / (4 * 5), 10 / (16 * 25)]).toEqual([0.5, 0.025]);
    // One far point makes a correlation from almost none.
    const five = { xs: [1, 2, 3, 4, 5], ys: [3, 1, 4, 2, 3] };
    expect(Math.abs(correlationOf(five.xs, five.ys))).toBeLessThan(0.15);
    expect(correlationOf([...five.xs, 20], [...five.ys, 20])).toBeGreaterThan(0.8);
  });

  it('checks the probes, whose numbers appear nowhere else', () => {
    const quiz = source.slice(source.indexOf('<Quiz'));
    const text = source.slice(0, source.indexOf('<Quiz')).replace(/probes=\{\[[\s\S]*?\]\}/g, '');
    const probes = [...source.matchAll(/probes=\{\[[\s\S]*?\]\}/g)].map((m) => m[0]).join(' ');
    expect(correlationOf([-6, 0, 6], [36, 0, 36])).toBe(0);
    expect(correlationOf([1, 2, 3], [1, 2, 3].map((x) => 5 - 3 * x))).toBeCloseTo(-1, 12);
    expect(correlationOf([1, 2, 3], [1, 2, 3].map((x) => 0.3 * x + 2))).toBeCloseTo(1, 12);
    const alone = (n: string) => new RegExp(`(?<![\\d.])${n.replace(/[.$/^+()]/g, (c) => `\\${c}`)}(?![\\d])`);
    for (const n of ['50x', '0.3x', '−1/3', '3x', '36', '0.85', '−6']) {
      expect(probes, `${n} is in the probes`).toMatch(alone(n));
      expect(text, `${n} is in the text`).not.toMatch(alone(n));
      expect(quiz, `${n} is in the quiz`).not.toMatch(alone(n));
    }
    for (const n of ['12x', '0.2x', '4/3', '22/3', '0.9', '0.6', '2.54', '0.025', '0.04', '0.8', 'Twelve']) {
      expect(quiz, `${n} is in the quiz`).toMatch(alone(n));
      expect(probes, `${n} is in a probe`).not.toMatch(alone(n));
      expect(text, `${n} is in the text`).not.toMatch(alone(n));
    }
  });
});

// The lesson is listed in index.ts by the lead, so assessment.test.ts reads it too; the same rules, here, by name.
describe('covariance-correlation: mistakes, quiz and explain-back, read as the app reads them', () => {
  it('names three mistakes, each probed twice and trapped by a quiz question', () => {
    const mistakes = misconceptionsIn('covariance-correlation', source);
    expect(mistakes.map((m) => m.id)).toEqual(['steeper-is-stronger', 'zero-means-unrelated', 'correlation-causation']);
    const [quiz] = quizzesIn('covariance-correlation', source);
    expect(quiz.questions.length).toBe(7);
    for (const m of mistakes) {
      expect(m.correction.length).toBeGreaterThan(20);
      expect(m.probes).toHaveLength(2);
      for (const p of m.probes) expect(p.trap).not.toBe(p.answer);
      expect(quiz.questions.some((q) => Object.values(q.traps ?? {}).includes(m.id)), m.id).toBe(true);
    }
    for (const q of quiz.questions)
      for (const [choice, id] of Object.entries(q.traps ?? {})) {
        expect(Number(choice)).not.toBe(q.answer);
        expect(mistakes.some((m) => m.id === id)).toBe(true);
      }
  });

  it('asks for an explanation before the recap, with a short rubric and example', () => {
    const [prompt] = promptsIn('covariance-correlation', source);
    expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
    expect(prompt.rubric.length).toBeLessThanOrEqual(5);
    for (const r of prompt.rubric) expect(words(r)).toBeLessThanOrEqual(30);
    expect(words(prompt.example)).toBeGreaterThanOrEqual(30);
    expect(words(prompt.example)).toBeLessThanOrEqual(150);
    expect(source.indexOf('<ExplainBack')).toBeGreaterThan(source.indexOf('<Section step="explain"'));
    expect(source.indexOf('<ExplainBack')).toBeLessThan(source.indexOf('<Section step="recap"'));
  });
});
