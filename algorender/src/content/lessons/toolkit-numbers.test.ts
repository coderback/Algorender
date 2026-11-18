// The math toolkit's lessons (B1 of the math and ML path) quote numbers: every
// one is measured here from the code that draws it, and must appear in the
// lesson exactly as written. The lessons' embedded visualisers are checked
// too: each preset exists, each starting step is the frame the text describes,
// and each prediction challenge asks at least as many questions as its goal.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apply, BASES, formulaOf, functionsModule } from '@/algorithms/toolkit/functions';
import { compound, doublings, logarithms } from '@/algorithms/toolkit/logarithms';
import { pi, sigma, sigmaNotation } from '@/algorithms/toolkit/sigma-notation';
import { rotate, toRadians, unitCircle } from '@/algorithms/toolkit/unit-circle';
import { getExercise } from '@/content/exercises';
import { directProduct, logProb, rotated, variance } from '@/content/exercises/toolkit';
import type { AnyAlgorithm } from '@/engine/module';
import { fmt } from '@/viz/plot/geometry';
import { planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState } from '@/viz/plot/types';

const lesson = (slug: string) => readFileSync(fileURLToPath(new URL(`./${slug}.mdx`, import.meta.url)), 'utf8').replace(/\s+/g, ' ');
/** Truncated, as a lesson writes a long decimal before its “…”. */
const trunc = (v: number, digits: number) => String(Math.trunc(v * 10 ** digits) / 10 ** digits);
const LATEX_MINUS =(s: string) => s.replace(/−/g, '-');

const traceFor = (module: AnyAlgorithm, preset: string) => {
  const ex = module.input.examples.find((e) => e.id === preset);
  if (!ex) throw new Error(`${module.slug} has no example ${preset}`);
  return traceOf(module, ex.make({ seed: 0, size: 0 })).frames;
};

/** Every Explore and PredictChallenge in a lesson: its slug, preset, step and goal. */
function embeds(body: string) {
  return [...body.matchAll(/<(Explore|PredictChallenge) slug="([a-z-]+)" settings=\{\{ preset: '([a-z-]+)'(?:, step: '(\d+)')? \}\}[^>]*?(?:goal=\{(\d+)\})?[^>]*\/>/g)].map((m) => ({
    tag: m[1],
    slug: m[2],
    preset: m[3],
    step: m[4] === undefined ? null : Number(m[4]),
    goal: m[5] === undefined ? null : Number(m[5]),
  }));
}

const MODULES: Record<string, AnyAlgorithm> = { functions: functionsModule, logarithms, 'sigma-notation': sigmaNotation, 'unit-circle': unitCircle };

describe.each(['functions-graphs', 'exponents-logs', 'sums-notation', 'trigonometry'])('%s', (slug) => {
  it('embeds real presets, at frames that exist, with enough questions for each goal', () => {
    const found = embeds(lesson(slug));
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found.filter((e) => e.tag === 'PredictChallenge')).toHaveLength(1);
    for (const e of found) {
      const frames = traceFor(MODULES[e.slug], e.preset);
      if (e.step !== null) expect(e.step).toBeLessThan(frames.length);
      if (e.goal !== null) expect(frames.filter((f) => f.checkpoint).length, `${e.preset} asks fewer than ${e.goal}`).toBeGreaterThanOrEqual(e.goal);
    }
  });

  it('embeds exercises that practise this lesson’s visualiser', () => {
    const used = [...lesson(slug).matchAll(/exercise="([a-z-]+)"/g)].map((m) => getExercise(m[1])!);
    expect(used).toHaveLength(1);
    expect(Object.keys(MODULES)).toContain(used[0].visualiser);
  });
});

describe('functions-graphs quotes', () => {
  const body = lesson('functions-graphs');

  it('reads the table, the shift and the targets off the module', () => {
    expect(body).toContain(`$(-2, ${BASES.square.f(-2)})$`);
    // The "match the curve" explorer opens on the finished graph, with its handles.
    const frames = traceFor(functionsModule, 'parabola');
    expect(frames[9].line).toBe(5);
    expect(planeOf(frames[9].state as PlotState).handles.map((h) => h.id)).toEqual(['anchor', 'unit']);
    const target = { base: 'square' as const, a: -1, h: 1, k: 4 };
    expect(body).toContain(`Try to make y = ${formulaOf(target)}`);
    expect(apply(target, 1)).toBe(4);
    expect(apply(target, 2)).toBe(3);
    expect(body).toContain('Unit point: $(2, 3)$');
    expect(formulaOf({ base: 'abs', a: 0.5, h: -3, k: 0 })).toBe('0.5|x + 3|');
    expect(formulaOf({ base: 'line', a: 2, h: 0, k: 1 })).toBe('2x + 1');
    expect(formulaOf({ base: 'abs', a: -1, h: 0, k: 3 })).toBe('−|x| + 3');
    expect(body).toContain('`line a=2 h=0 k=1`');
    expect(functionsModule.input.custom!.parse('line a=2 h=0 k=1')).toEqual({ value: { base: 'line', a: 2, h: 0, k: 1 } });
  });
});

describe('exponents-logs quotes', () => {
  const body = lesson('exponents-logs');
  const sentence = getExercise('log-probability')!.examples.find((e) => e.id === 'sentence')!.input as { ps: number[] };

  it('measures the sentence that underflows', () => {
    expect(sentence.ps).toHaveLength(120);
    expect(logProb(sentence)).toBe(-1200);
    expect(directProduct(sentence)).toBe(0);
    expect(Math.log2(Number.MIN_VALUE)).toBe(-1074);
    expect(body).toContain('about $2^{-1200}$');
    expect(body).toContain('about $2^{-1074}$');
    expect(body).toContain('a comfortable $-1200$');
    // 2⁻¹²⁰⁰ = 10^−361.2…: a point and 361 zeros before the first digit.
    expect(Math.floor(1200 * Math.log10(2))).toBe(361);
    expect(body).toContain('roughly 360 zeros');
  });

  it('counts the doublings and the logs the visualiser shows', () => {
    expect(doublings(1000)).toBe(10);
    expect(body).toContain('ten doublings pass 1000');
    expect(body).toContain(`it is $${fmt(Math.log2(1000))}$`);
    const top = traceFor(logarithms, 'doubling').find((f) => f.line === 2)!;
    expect(readout(top.state as PlotState, 'log')).toBe('9.97');
    expect(doublings(1_000_000)).toBe(20);
    expect(body).toContain('for a million items, only 20');
    expect(body).toContain(`log₂ 10 = ${fmt(Math.log2(10))} and log₂ 100 = ${fmt(Math.log2(100))} stack up to log₂ 1000 = ${fmt(Math.log2(1000))}`);
  });

  it('quotes the compound-interest totals and ln 1000', () => {
    expect(body).toContain(`you end with £${compound(2)}`);
    expect(body).toContain(`Monthly gives £${fmt(compound(12), 4)}, daily £${fmt(compound(365), 4)}, every minute £${fmt(compound(525_600), 5)}`);
    expect(body).toContain(`(Every minute is really £${trunc(compound(525_600), 6)}, a whisker under $e = ${trunc(Math.E, 6)}`);
    expect(body).toContain(`the logs really are ${trunc(Math.log2(10), 4)}… and ${trunc(Math.log2(100), 4)}…, which add to ${trunc(Math.log2(1000), 4)}…`);
    expect(body).toContain(`$2^{0.5}$ is about ${fmt(Math.SQRT2, 3)}`);
    expect(body).toContain(`$\\ln 1000 = ${fmt(Math.log2(1000))} \\times ${fmt(Math.LN2, 3)} = ${fmt(Math.log(1000))}$`);
  });
});

describe('sums-notation quotes', () => {
  const body = lesson('sums-notation');

  it('adds up what the visualiser adds up', () => {
    expect(sigma(10, (i) => i)).toBe(55);
    expect(body).toContain('here with a total of 55');
    expect(body).toContain('$1, 3, 6, 10,');
    expect(sigma(5, (i) => i * i)).toBe(55);
    expect(body).toContain('1 + 4 + 9 + 16 + 25 = 55');
    expect(pi(6, (i) => i)).toBe(720);
    expect(body).toContain('\\cdots \\times 6 = 720$');
    const mean = traceFor(sigmaNotation, 'mean');
    expect(readout(mean[mean.length - 1].state as PlotState, 'mean')).toBe('5');
    expect(body).toContain('x̄ = (2 + 4 + 9 + 5) / 4 = 5');
    expect(body).toContain('For 1, 2, 3: square then add gives 14; add then square gives 36');
    const double = traceFor(sigmaNotation, 'double');
    expect(readout(double[double.length - 1].state as PlotState, 'total')).toBe('60');
    expect(body).toContain('The 12 cells add up to 60');
  });

  it('matches the variance exercise’s classic example, and the mean example’s spread', () => {
    expect(variance([2, 4, 9, 5]).variance).toBe(6.5);
    expect(body).toContain('so $\\sigma^2 = 26 / 4 = 6.5$');
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toMatchObject({ mean: 5, variance: 4 });
  });
});

describe('trigonometry quotes', () => {
  const body = lesson('trigonometry');

  it('reads the angles and the shadows off the unit circle', () => {
    expect(body).toContain(`an arc of length $${fmt(toRadians(60), 3)}$`);
    expect(body).toContain(`sits at $(${fmt(Math.cos(toRadians(60)), 3)}, ${fmt(Math.sin(toRadians(60)), 3)})$`);
    expect(body).toContain(`At 150°, P is at (${fmt(Math.cos(toRadians(150)), 3)}, ${fmt(Math.sin(toRadians(150)), 3)})`);
    expect(body).toContain(`one radian is about ${fmt(180 / Math.PI, 1)}°`);
    expect(body).toContain(`is $\\frac{\\pi}{2} \\approx ${fmt(Math.PI / 2)}$`);
  });

  it('turns (2, 1) a quarter turn to (−1, 2), keeping its length', () => {
    const w = rotate([2, 1], toRadians(90)).map((v) => fmt(v, 3));
    expect(body).toContain(`(2, 1) turned 90° lands at (${w.join(', ')}), and its length is still ${fmt(Math.hypot(2, 1), 3)}`);
    expect(rotated({ p: [2, 1], degrees: 90 }).map((v) => fmt(v, 3))).toEqual(w);
  });

  it('quotes what sin and cos do with degrees', () => {
    expect(body).toContain(`returns $${fmt(Math.sin(90), 3)}$`);
    expect(body).toContain(`about ${fmt(90 / (2 * Math.PI), 1)} full turns`);
    const turns = Math.floor(90 / (2 * Math.PI));
    expect(body).toContain(`Math.sin(90) lands ${fmt(((90 - turns * 2 * Math.PI) * 180) / Math.PI, 1)}° round, after ${turns} full turns`);
    expect(body).toContain(`cos 180 radians is about ${fmt(Math.cos(180), 3)}`);
    expect(body).toContain(`more than ${Math.floor(180 / (2 * Math.PI))} full turns`);
    expect(body).toContain(`returns about ${fmt(Math.sin(30), 3)}`);
    const degrees = traceFor(unitCircle, 'degrees');
    expect(readout(degrees[1].state as PlotState, 'got')).toBe(fmt(Math.sin(90), 3));
    expect(LATEX_MINUS(fmt(Math.cos(180), 3))).toBe('-0.598');
  });
});
