// Property tests for contour maps (B4 of the math and ML path): every height
// written on the map is f at its point, every contour point has its level's
// height, walking along a contour keeps the height, the slices are f with one
// input held, and their slopes match central differences.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { numbersIn } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import { expectGoodPlotTrace, planeOf, readout, traceOf } from '@/viz/plot/testing';
import type { PlotState, Shape, Vec } from '@/viz/plot/types';
import {
  contourLevels,
  contourMaps,
  contourWalk,
  heightTable,
  LABEL_LIFT,
  levelLabels,
  parseContour,
  pBounds,
  sliceShape,
  sliceSlopes,
  STORIES,
  SURFACE_IDS,
  SURFACES,
  xSliceAt,
  ySliceAt,
  type ContourInput,
  type Story,
  type SurfaceId,
} from './contour-maps';

const num = (s: string | undefined) => Number((s ?? 'NaN').replace(/−/g, '-'));
const shapes = (state: PlotState, id = 'plane'): readonly Shape[] => planeOf(state, id).shapes;
const shapeIn = (state: PlotState, id: string, plane = 'plane') => shapes(state, plane).find((s) => s.id === id);
const answer = (frame: { checkpoint?: { choices: readonly string[]; answer: number } }) => frame.checkpoint && frame.checkpoint.choices[frame.checkpoint.answer];

function roundTrips(input: ContourInput) {
  const custom = contourMaps.input.custom!;
  const text = custom.format(input as never);
  expect(custom.parse(text), text).toEqual({ value: input });
}

/** A P allowed in the story: on its step, inside its bounds (never (0, 0) in the walk). */
const pointFor = (story: Story, surface: SurfaceId) => {
  const { min, max, step } = pBounds(story, surface);
  const coord = (k: 0 | 1) => fc.integer({ min: Math.round(min[k] / step), max: Math.round(max[k] / step) }).map((v) => v * step);
  return fc.tuple(coord(0), coord(1)).filter((p) => story !== 'walk' || p[0] !== 0 || p[1] !== 0) as fc.Arbitrary<Vec>;
};
const anyInput = fc
  .tuple(fc.constantFrom(...STORIES), fc.constantFrom(...SURFACE_IDS))
  .chain(([story, surface]) => pointFor(story, surface).map((p): ContourInput => ({ story, surface, p })));

/** Every label is f at its point: a table height just under it, a contour level on its line. */
function expectLabelsTrue(input: ContourInput, frames: readonly { state: PlotState }[]) {
  const s = SURFACES[input.surface];
  for (const f of frames)
    for (const shape of shapes(f.state)) {
      if (shape.kind !== 'label') continue;
      const [kind, ...rest] = shape.id.split(':');
      if (kind === 'h') {
        const [x, y] = rest.map(Number);
        expect(shape.at).toEqual([x, y + LABEL_LIFT]);
        expect(shape.text).toBe(fmt(s.f(x, y), 3));
      } else {
        expect(kind).toBe('lvl');
        expect(Math.abs(s.f(...shape.at) - num(shape.text))).toBeLessThan(0.05);
      }
    }
}

const frameCount = (story: Story, surface: SurfaceId) => {
  const p = pBounds(story, surface).max;
  return traceOf(contourMaps, { story, surface, p }).frames.length;
};

describe('contour-maps', () => {
  it('plays every example, round-trips its text, and every drag keeps the frame count', () => {
    for (const ex of contourMaps.input.examples) {
      const input = ex.make({ seed: 0, size: 0 }) as ContourInput;
      const frames = traceOf(contourMaps, input).frames;
      expectGoodPlotTrace(contourMaps, frames);
      expectLabelsTrue(input, frames);
      roundTrips(input);
      for (const f of frames)
        for (const part of f.state.parts) {
          if (part.kind !== 'plane') continue;
          for (const h of part.handles) {
            for (const to of [
              [h.at[0] + h.step, h.at[1] - h.step],
              [h.min[0], h.max[1]],
              [h.max[0], h.min[1]],
              [0, 0],
            ] as Vec[]) {
              const moved = contourMaps.input.drag!(input as never, h.id, to) as ContourInput;
              const again = traceOf(contourMaps, moved).frames;
              expectGoodPlotTrace(contourMaps, again);
              roundTrips(moved);
              expect(again.length, `${ex.id} dragging ${h.id} to ${to}`).toBe(frames.length);
            }
          }
        }
    }
  });

  it('keeps every frame count fixed per story and surface, with checkpoints to predict', () => {
    for (const story of STORIES)
      for (const surface of SURFACE_IDS) {
        const n = frameCount(story, surface);
        expect(n).toBeGreaterThanOrEqual(8);
        expect(n).toBeLessThanOrEqual(25);
      }
    for (const ex of contourMaps.input.examples) {
      const frames = traceOf(contourMaps, ex.make({ seed: 0, size: 0 })).frames;
      expect(frames.filter((f) => f.checkpoint).length, ex.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('plays any P in any story on either surface', () => {
    fc.assert(
      fc.property(anyInput, (input) => {
        const frames = traceOf(contourMaps, input).frames;
        expectGoodPlotTrace(contourMaps, frames);
        expectLabelsTrue(input, frames);
        roundTrips(input);
        expect(frames.length).toBe(frameCount(input.story, input.surface));
        expect(frames[0].checkpoint, 'the first question').toBeDefined();
        expect(frames.filter((f) => f.checkpoint).length).toBeGreaterThanOrEqual(3);
      }),
      { numRuns: 80 },
    );
  });

  it('never gives a question’s answer away in the note of the frame that asks it', () => {
    const STEEP = ['against', 'per unit', 'steeper', 'equally'];
    const PHRASES: Record<string, string[]> = {
      'Stay the same': ['stays the same', 'never climbs'],
      'Go up': ['goes up'],
      'Go down': ['goes down'],
      Uphill: ['uphill'],
      Downhill: ['downhill'],
      Flat: ['flat'],
      Peak: ['peak', 'top of a hill'],
      Valley: ['valley'],
      Neither: ['no peak', 'on a slope'],
      'Along x': STEEP,
      'Along y': STEEP,
      'Equally steep': STEEP,
      'Equally steep (here, both flat)': [...STEEP, 'both flat'],
      'The x-slice': STEEP,
      'The y-slice': STEEP,
    };
    const check = (input: ContourInput) => {
      const s = SURFACES[input.surface];
      for (const f of traceOf(contourMaps, input).frames) {
        const c = f.checkpoint;
        if (!c) continue;
        const said = c.choices[c.answer];
        const note = f.note.toLowerCase();
        const where = `${input.story} ${input.surface} ${input.p}: "${c.question}" (${said}) in "${f.note}"`;
        if (said.startsWith('(')) expect(f.note.includes(said), where).toBe(false);
        else if (/^[−-]?\d/.test(said)) {
          // A number the frame names for another reason (in the question, the formula, or P itself) can't be told apart.
          const known = [...numbersIn(c.question), ...numbersIn(s.formula), ...input.p];
          if (!known.includes(num(said))) expect(numbersIn(f.note), where).not.toContain(num(said));
        } else if (said !== 'Yes' && said !== 'No') {
          expect(PHRASES[said], said).toBeDefined();
          for (const phrase of PHRASES[said]) expect(note.includes(phrase), `${where} says "${phrase}"`).toBe(false);
        }
      }
    };
    for (const ex of contourMaps.input.examples) check(ex.make({ seed: 0, size: 0 }) as ContourInput);
    fc.assert(fc.property(anyInput, check), { numRuns: 80 });
  });

  it('refuses a P it can’t draw', () => {
    expect(parseContour('walk hill at 0 0')).toHaveProperty('error');
    expect(parseContour('table hill at 1.5 1')).toHaveProperty('error');
    expect(parseContour('slices hill at 3.5 0')).toHaveProperty('error');
    expect(parseContour('slices hill at 1.25 0')).toHaveProperty('error');
    expect(parseContour('slices at 1 0')).toHaveProperty('error');
    expect(parseContour('hill at 1 0')).toHaveProperty('error');
    expect(parseContour('walk saddle at 1')).toHaveProperty('error');
    expect(parseContour('slices saddle at -2.5 2.5')).toEqual({ value: { story: 'slices', surface: 'saddle', p: [-2.5, 2.5] } });
    // The walk refuses to drag P onto the flat top; the table snaps P to grid points.
    const walk: ContourInput = { story: 'walk', surface: 'hill', p: [0.5, 0] };
    expect(contourMaps.input.drag!(walk as never, 'p', [0.1, -0.1])).toBe(walk);
    expect(contourMaps.input.drag!({ story: 'table', surface: 'hill', p: [0, 0] } as never, 'p', [1.4, 9])).toEqual({ story: 'table', surface: 'hill', p: [1, 2] });
  });

  it('puts every contour point at its level’s height', () => {
    for (const id of SURFACE_IDS) {
      const s = SURFACES[id];
      const levels = contourLevels(s);
      expect(levels.map((l) => l.value)).toEqual(s.levels);
      for (const level of levels) {
        expect(Number.isInteger(level.value)).toBe(true);
        expect(level.segments.length, `${id} f = ${level.value}`).toBeGreaterThan(0);
        for (const seg of level.segments) for (const end of seg) expect(Math.abs(s.f(...end) - level.value)).toBeLessThan(0.01);
      }
      for (const label of levelLabels(s)) expect(Math.abs(s.f(...label.at) - num(label.text))).toBeLessThan(0.05);
    }
  });

  it('keeps the height while walking along the contour through P, round a loop on the hill', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SURFACE_IDS).chain((surface) => pointFor('walk', surface).map((p) => [surface, p] as const)),
        ([surface, p]) => {
          const s = SURFACES[surface];
          const w = contourWalk(surface, p);
          expect(w.level).toBe(s.f(...p));
          for (const q of [...w.path, ...w.walk]) expect(Math.abs(s.f(...q) - w.level)).toBeLessThan(1e-6);
          expect(w.steps.length).toBe(w.closed ? 7 : 4);
          w.steps.forEach((i, k) => expect(i).toBeGreaterThan(k ? w.steps[k - 1] : 0));
          if (surface === 'hill') expect(w.closed).toBe(true);
          // The frames say so: every step's height reads as P's.
          const frames = traceOf(contourMaps, { story: 'walk', surface, p }).frames;
          for (let k = 0; k < 3; k++) expect(readout(frames[3].state, `step${k}`)).toBe(fmt(w.level, 3));
          expect(answer(frames[0])).toBe('Stay the same');
          expect(frames[0].checkpoint!.question).toBe('Walking along the contour line through P, will the height go up, go down or stay the same?');
          // Steeper where the height changes faster, which is where the contours crowd.
          const [sx, sy] = sliceSlopes(surface, p);
          expect(answer(frames[6])).toBe(Math.abs(sx) === Math.abs(sy) ? 'Equally steep' : Math.abs(sx) > Math.abs(sy) ? 'Along x' : 'Along y');
          expect(num(readout(frames[7].state, 'sx'))).toBe(sx);
          expect(num(readout(frames[7].state, 'sy'))).toBe(sy);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('slices are f with one input held, and their slopes match central differences', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SURFACE_IDS),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        (id, a, b) => {
          const s = SURFACES[id];
          const h = 1e-4;
          const [sx, sy] = sliceSlopes(id, [a, b]);
          expect(sx).toBeCloseTo((s.f(a + h, b) - s.f(a - h, b)) / (2 * h), 5);
          expect(sy).toBeCloseTo((s.f(a, b + h) - s.f(a, b - h)) / (2 * h), 5);
          expect(xSliceAt(id, b)(a)).toBe(s.f(a, b));
          expect(ySliceAt(id, a)(b)).toBe(s.f(a, b));
          // The bends: second differences.
          expect((s.f(a + h, b) - 2 * s.f(a, b) + s.f(a - h, b)) / (h * h)).toBeCloseTo(s.bend[0], 2);
          expect((s.f(a, b + h) - 2 * s.f(a, b) + s.f(a, b - h)) / (h * h)).toBeCloseTo(s.bend[1], 2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('draws the slices from f and asks about them truthfully', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SURFACE_IDS).chain((surface) => pointFor('slices', surface).map((p) => [surface, p] as const)),
        ([surface, p]) => {
          const s = SURFACES[surface];
          const [a, b] = p;
          const frames = traceOf(contourMaps, { story: 'slices', surface, p }).frames;
          const last = frames[frames.length - 1].state;
          const xs = shapeIn(last, 'xslice', 'slices');
          const ys = shapeIn(last, 'yslice', 'slices');
          expect(xs?.kind === 'path' && xs.points.every(([x, v]) => v === s.f(x, b))).toBe(true);
          expect(ys?.kind === 'path' && ys.points.every(([y, v]) => v === s.f(a, y))).toBe(true);
          // P sits on both, at its own height.
          const px = shapeIn(last, 'Px', 'slices');
          const py = shapeIn(last, 'Py', 'slices');
          expect(px?.kind === 'point' && px.at[0] === a && px.at[1] === s.f(a, b)).toBe(true);
          expect(py?.kind === 'point' && py.at[0] === b && py.at[1] === s.f(a, b)).toBe(true);
          // Each tangent rises by its slice's slope.
          for (const [id, slope] of [
            ['xtan', s.slopes(a, b)[0]],
            ['ytan', s.slopes(a, b)[1]],
          ] as const) {
            const t = shapeIn(last, id, 'slices');
            expect(t?.kind).toBe('path');
            if (t?.kind === 'path') expect((t.points[1][1] - t.points[0][1]) / (t.points[1][0] - t.points[0][0])).toBeCloseTo(slope, 9);
          }
          const [sx, sy] = s.slopes(a, b);
          const x0 = a + 1 <= s.x.max ? a + 1 : a - 1;
          expect(num(answer(frames[0]))).toBe(num(fmt(s.f(x0, b), 3)));
          expect(answer(frames[2])).toBe(sx === 0 ? 'Flat' : sx > 0 ? 'Uphill' : 'Downhill');
          expect(answer(frames[3])).toBe(sliceShape(sy, s.bend[1]));
          expect(answer(frames[5])).toBe(sy === 0 ? 'Flat' : sy > 0 ? 'Uphill' : 'Downhill');
          expect(readout(last, 'sx')).toBe(fmt(sx));
          expect(readout(last, 'sy')).toBe(fmt(sy));
        },
      ),
      { numRuns: 60 },
    );
  });

  it('on the saddle one slice is a valley and the other a hill; on the hill both are hills', () => {
    expect(sliceShape(0, SURFACES.saddle.bend[0])).toBe('Valley');
    expect(sliceShape(0, SURFACES.saddle.bend[1])).toBe('Peak');
    expect(SURFACES.hill.bend.every((v) => v < 0)).toBe(true);
    const frames = traceOf(contourMaps, { story: 'slices', surface: 'saddle', p: [0, 0] }).frames;
    expect(answer(frames[3])).toBe('Peak');
    expect(answer(frames[6])).toBe('Equally steep (here, both flat)');
    expect(frames[frames.length - 1].note.startsWith('Both flat: slope 0 along x and 0 along y.')).toBe(true);
    expect(frames[frames.length - 1].note).toContain('bottom of a valley');
  });

  it('fills the table with rows from the largest y down and columns x left to right, like the exercise', () => {
    for (const id of SURFACE_IDS) {
      const s = SURFACES[id];
      const rows = heightTable(id);
      expect(rows.length).toBe(s.grid.ys.length);
      expect(s.grid.ys[0]).toBeGreaterThan(s.grid.ys[s.grid.ys.length - 1]);
      rows.forEach((row, r) => row.forEach((v, c) => expect(v).toBe(s.f(s.grid.xs[c], s.grid.ys[r]))));
      const [on, ...off] = s.named.points;
      expect(s.f(...on)).toBe(s.named.level);
      for (const q of off) expect(s.f(...q)).not.toBe(s.named.level);
      for (const q of s.named.points) expect(s.grid.xs.includes(q[0]) && s.grid.ys.includes(q[1])).toBe(true);
    }
    expect(heightTable('hill')[0]).toEqual([-0.5, 2, 3.5, 4, 3.5, 2, -0.5]);
    expect(heightTable('hill')[2]).toEqual([3.5, 6, 7.5, 8, 7.5, 6, 3.5]);
    const frames = traceOf(contourMaps, { story: 'table', surface: 'hill', p: [2, 1] }).frames;
    expect(answer(frames[0])).toBe('5');
    const image = frames[frames.length - 1].state.parts.find((part) => part.kind === 'image');
    expect(image?.kind === 'image' && image.values).toEqual(heightTable('hill').flat().map((v) => fmt(v, 3)));
    // The named question, and a contour that misses every grid point.
    const asked = frames.filter((f) => f.checkpoint).map((f) => answer(f));
    expect(asked).toEqual(['5', '(2, 0)', 'No']);
  });
});
