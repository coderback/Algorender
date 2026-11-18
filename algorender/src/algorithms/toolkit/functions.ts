import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { MarkKey } from '@/viz/marks';
import type { Axis, Handle, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Functions and their graphs: a rule from x to one f(x), a table of values,
// the dots joined into a graph, then the three knobs of a·f(x − h) + k moving
// the graph (stretch or flip, shift sideways, lift). Every input has the same
// frames (a knob left alone gets a "nothing changes" frame), so dragging the
// anchor or the unit point keeps the learner on the frame they were looking at.

export type BaseId = 'line' | 'square' | 'abs' | 'sqrt';
export type FunctionsInput = { base: BaseId; a: number; h: number; k: number };

type Base = {
  /** The rule for an input written `v`, e.g. `${v}²`; `wrap` says whether a shifted input needs brackets. */
  name: string;
  f: (x: number) => number;
  /** Where the rule makes sense (√ of a negative number does not). */
  defined: (x: number) => boolean;
  /** The table's inputs. */
  xs: readonly number[];
  /** Writes the rule around an input expression. */
  write: (inner: string, shifted: boolean) => string;
};

export const BASES: Record<BaseId, Base> = {
  line: { name: 'x', f: (x) => x, defined: () => true, xs: [-2, -1, 0, 1, 2], write: (v) => v },
  square: { name: 'x²', f: (x) => x * x, defined: () => true, xs: [-2, -1, 0, 1, 2], write: (v, s) => (s ? `(${v})²` : `${v}²`) },
  abs: { name: '|x|', f: Math.abs, defined: () => true, xs: [-2, -1, 0, 1, 2], write: (v) => `|${v}|` },
  sqrt: { name: '√x', f: Math.sqrt, defined: (x) => x >= 0, xs: [0, 1, 2, 3, 4], write: (v, s) => (s ? `√(${v})` : `√${v}`) },
};
const BASE_IDS = Object.keys(BASES) as BaseId[];

/** The knobs' range, and the step the handles snap to. */
export const KNOB = { min: -4, max: 4, step: 0.5 };
const AXIS: Axis = { min: -6, max: 6 };

const minus = (v: number) => fmt(v).replace('−', '');
const signed = (v: number) => (v < 0 ? ` − ${minus(v)}` : ` + ${fmt(v)}`);

/** a·f(x − h) + k written the way you would by hand: 2(x − 1)² + 3, −|x + 2|, √x. */
export function formulaOf({ base, a, h, k }: FunctionsInput): string {
  const b = BASES[base];
  if (a === 0) return fmt(k);
  const inner = h === 0 ? 'x' : `x${signed(-h)}`;
  let body = b.write(inner, h !== 0);
  if (base === 'line' && a !== 1 && a !== -1 && h !== 0) body = `(${body})`;
  const coef = a === 1 ? '' : a === -1 ? '−' : fmt(a);
  return `${coef}${body}${k === 0 ? '' : signed(k)}`;
}

/** The transformed function. */
export const apply = ({ base, a, h, k }: FunctionsInput, x: number) => a * BASES[base].f(x - h) + k;

/** Samples y = g(x) across the plane, split where g is undefined. */
function curve(g: (x: number) => number, ok: (x: number) => boolean): Vec[][] {
  const n = 160;
  const out: Vec[][] = [[]];
  for (let i = 0; i <= n; i++) {
    const x = AXIS.min + ((AXIS.max - AXIS.min) * i) / n;
    if (ok(x)) out[out.length - 1].push([x, g(x)]);
    else if (out[out.length - 1].length) out.push([]);
  }
  return out.filter((p) => p.length > 1);
}

const curveShapes = (id: string, pieces: Vec[][], paint: Partial<Shape>, label?: string): Shape[] =>
  pieces.map((points, i) => ({ kind: 'path', id: i ? `${id}${i}` : id, points, label: i ? undefined : label, ...paint }) as Shape);

const pseudocode = [
  'f(x) ← the rule',
  'for x in the table: write f(x)',
  'plot each (x, f(x)) and join them',
  'stretch: y ← a·f(x)',
  'shift: y ← a·f(x − h)',
  'lift: y ← a·f(x − h) + k',
  'from the anchor (h, k), step 1 right',
];

function plane(shapes: Shape[], handles: Handle[]): PlanePart {
  return { kind: 'plane', id: 'plane', label: 'The graph of y = f(x)', x: { ...AXIS, label: 'x' }, y: { ...AXIS, label: 'y' }, equal: true, shapes, handles };
}

const table = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'table', label: 'Table of values', items });
const knobs = (input: FunctionsInput, mark: 'a' | 'h' | 'k' | null): PlotPart => ({
  kind: 'readouts',
  id: 'knobs',
  label: 'Knobs',
  items: [
    { id: 'a', label: 'a (stretch)', value: fmt(input.a), mark: mark === 'a' ? 'key' : null },
    { id: 'h', label: 'h (sideways)', value: fmt(input.h), mark: mark === 'h' ? 'key' : null },
    { id: 'k', label: 'k (up)', value: fmt(input.k), mark: mark === 'k' ? 'key' : null },
  ],
});

/** Handles on the finished graph: the anchor (h, k), where f's (0, 0) lands, and the unit point (h + 1, k + a), where (1, 1) lands. */
function handles({ a, h, k }: FunctionsInput): Handle[] {
  return [
    { id: 'anchor', at: [h, k], label: 'Anchor (h, k)', mark: 'key', step: KNOB.step, min: [KNOB.min, KNOB.min], max: [KNOB.max, KNOB.max] },
    { id: 'unit', at: [h + 1, k + a], label: 'Unit point (h + 1, k + a)', mark: 'compare', step: KNOB.step, min: [h + 1, k + KNOB.min], max: [h + 1, k + KNOB.max] },
  ];
}

// Exclusive choices: a = −2 both flips and steepens, so the other two say the curve stays the same way up.
const STRETCH = ['Flips upside down', 'Gets steeper, same way up', 'Gets flatter, same way up', 'Stays the same'];
const stretchOf = (a: number) => (a < 0 ? STRETCH[0] : a === 1 ? STRETCH[3] : a > 1 ? STRETCH[1] : STRETCH[2]);
const shiftOf = (h: number) => (h === 0 ? 'Stays put' : h > 0 ? `Right by ${fmt(h)}` : `Left by ${minus(h)}`);
const shiftWrong = (h: number) => (h === 0 ? ['Right by 1', 'Left by 1'] : [shiftOf(-h), `Up by ${minus(h)}`]);
const liftOf = (k: number) => (k === 0 ? 'Stays put' : k > 0 ? `Up by ${fmt(k)}` : `Down by ${minus(k)}`);

function* run(input: FunctionsInput): Generator<Frame<PlotState>> {
  const { base, a, h, k } = input;
  const b = BASES[base];
  const xs = b.xs;
  const vars = { a, h, k };
  const dot = (id: string, at: Vec, mark: MarkKey | null = null): Shape => ({ kind: 'point', id, at, mark });
  const id = (x: number) => `p${x}`;

  yield plotFrame([plane([], []), table([]), knobs(input, null)], {
    line: 0,
    note: `A function is a rule: put a number x in, get exactly one number f(x) out. This one is f(x) = ${b.name}. Before drawing anything, work out what it gives for a few inputs.`,
    vars: {},
    checkpoint: ask(`What is f(${fmt(xs[0])})?`, fmt(b.f(xs[0])), [fmt(-b.f(xs[0])), fmt(xs[0]), fmt(b.f(xs[0]) + 1)]),
  });

  const rows: Readout[] = [];
  const dots: Shape[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = b.f(x);
    rows.push({ id: `x${x}`, label: `f(${fmt(x)})`, value: fmt(y) });
    dots.push(dot(id(x), [x, y]));
    const next = xs[i + 1];
    yield plotFrame([plane([...dots.slice(0, -1), dot(id(x), [x, y], 'key')], []), table([...rows]), knobs(input, null)], {
      line: 1,
      note: `Put in x = ${fmt(x)}: f(${fmt(x)}) = ${fmt(y)}. Each row of the table is a point: (${fmt(x)}, ${fmt(y)}) sits at ${fmt(x)} along the x-axis, at height ${fmt(y)}.`,
      vars: { x, 'f(x)': round(y, 2) },
      checkpoint:
        next === undefined
          ? ask('Inputs between the table’s rows have outputs too. What is f(0.5)?', fmt(b.f(0.5)), [fmt((b.f(0) + b.f(1)) / 2), fmt(1), fmt(0.25), fmt(0.5)])
          : ask(`What is f(${fmt(next)})?`, fmt(b.f(next)), [fmt(-b.f(next)), fmt(next + 1), fmt(b.f(next) + 1), fmt(2 * next)]),
    });
  }

  // No label: the finished curve's label would collide with it, and the legend names it.
  const baseCurve = curveShapes('base', curve(b.f, b.defined), { faint: true });
  yield plotFrame([plane([...curveShapes('curve', curve(b.f, b.defined), {}, `y = ${b.name}`), ...dots], []), table(rows), knobs(input, null)], {
    line: 2,
    note: `Every input in between has its own output too (f(0.5) = ${fmt(b.f(0.5))}), so the dots join into one unbroken curve: the graph of f. Each point on it is (x, f(x)), and a vertical line meets it at most once, since a function gives one output per input.`,
    vars: {},
    checkpoint: askInOrder(`Now multiply every output by a = ${fmt(a)}. What happens to the curve?`, STRETCH, stretchOf(a)),
  });

  // Stretch: every point (x, f(x)) moves to (x, a·f(x)); the dots keep their ids so they glide.
  const stretched = { base, a, h: 0, k: 0 };
  const sDots = xs.map((x) => dot(id(x), [x, apply(stretched, x)], 'key'));
  yield plotFrame(
    [plane([...baseCurve, ...curveShapes('curve', curve((x) => apply(stretched, x), b.defined), {}, `y = ${formulaOf(stretched)}`), ...sDots], []), table(rows), knobs(input, 'a')],
    {
      line: 3,
      note:
        a === 1
          ? 'a = 1 multiplies every output by 1, so nothing moves.'
          : `Every output is multiplied by ${fmt(a)}: the point (1, ${fmt(b.f(1))}) goes to (1, ${fmt(apply(stretched, 1))}).${a < 0 ? ' A negative a flips the curve over the x-axis.' : ''} Inputs stay where they were, so the curve only stretches up and down.`,
      vars: { a },
      checkpoint: askInOrder(`Now replace x by x − ${h < 0 ? `(${fmt(h)})` : fmt(h)}. Which way does the curve move?`, [shiftOf(h), ...shiftWrong(h)].sort(), shiftOf(h)),
    },
  );

  // Shift: y = a·f(x − h). The output f(0) now happens at x = h, so everything moves right by h.
  const shifted = { base, a, h, k: 0 };
  const hDots = xs.map((x) => dot(id(x), [x + h, apply(shifted, x + h)], 'key'));
  yield plotFrame(
    [
      plane([...baseCurve, ...curveShapes('curve', curve((x) => apply(shifted, x), (x) => b.defined(x - h)), {}, `y = ${formulaOf(shifted)}`), ...hDots], []),
      table(rows),
      knobs(input, 'h'),
    ],
    {
      line: 4,
      note:
        h === 0
          ? 'h = 0: x − 0 is just x, so the curve stays put.'
          : `To get the output f used to give at 0, you now need x − ${h < 0 ? `(${fmt(h)})` : fmt(h)} = 0, that is x = ${fmt(h)}. Every output arrives ${minus(h)} ${h > 0 ? 'later' : 'earlier'}, so the curve moves ${h > 0 ? 'right' : 'left'} by ${minus(h)}: the opposite of the sign you see in the formula.`,
      vars: { a, h },
      checkpoint: askInOrder(`Now add k = ${fmt(k)} to every output. Which way does the curve move?`, [liftOf(k), ...(k === 0 ? ['Up by 1', 'Down by 1'] : [liftOf(-k), `Right by ${minus(k)}`])].sort(), liftOf(k)),
    },
  );

  const kDots = xs.map((x) => dot(id(x), [x + h, apply(input, x + h)], 'key'));
  const finalCurve = curveShapes('curve', curve((x) => apply(input, x), (x) => b.defined(x - h)), { mark: 'found' }, `y = ${formulaOf(input)}`);
  yield plotFrame([plane([...baseCurve, ...finalCurve, ...kDots], handles(input)), table(rows), knobs(input, 'k')], {
    line: 5,
    note:
      k === 0
        ? `k = 0 adds nothing, so the curve stays put. The finished function is y = ${formulaOf(input)}. Drag the anchor or the unit point to change the knobs.`
        : `Adding ${fmt(k)} to every output moves the whole curve ${k > 0 ? 'up' : 'down'} by ${minus(k)}. The finished function is y = ${formulaOf(input)}. Drag the anchor or the unit point to change the knobs.`,
    vars,
    checkpoint: ask('Start at the anchor (h, k) and step 1 to the right. How much does the height change?', fmt(a), [fmt(-a), fmt(a + 1), fmt(k), fmt(2 * a), fmt(h)]),
  });

  // The rise over one step from the anchor: a, because f goes from (0, 0) to (1, 1).
  const anchor: Vec = [h, k];
  const unit: Vec = [h + 1, k + a];
  yield plotFrame(
    [
      plane(
        [
          ...baseCurve,
          ...finalCurve,
          { kind: 'path', id: 'run', points: [anchor, [h + 1, k]], mark: 'compare', label: 'run 1' },
          { kind: 'path', id: 'rise', points: [[h + 1, k], unit], mark: 'compare', label: `rise ${fmt(a)}` },
          ...kDots,
        ],
        handles(input),
      ),
      table(rows),
      knobs(input, 'a'),
    ],
    {
      line: 6,
      note:
        base === 'line'
          ? `From the anchor, one step right climbs ${fmt(a)}: for a straight line that rise per step is its slope, the same everywhere on the line.`
          : `From the anchor, one step right climbs ${fmt(a)}, because f(1) − f(0) = 1 before the stretch. ${base === 'abs' ? `|x| is straight on each side of its corner, so every further step right changes the height by ${fmt(a)} too; only at the corner does the steepness jump.` : `The next step climbs a different amount: ${b.name} is curved, and measuring how steep a curve is at each point is what derivatives do.`}`,
      vars,
    },
  );
}

export function parseFunctions(text: string): { value: FunctionsInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  const base = BASE_IDS.find((b) => b === word);
  if (!base) return { error: 'Start with a function: line, square, abs or sqrt.' };
  const knob = (name: string, fallback: number) => {
    const m = text.replace(/−/g, '-').match(new RegExp(`\\b${name}\\s*=\\s*(-?\\d*\\.?\\d+)`, 'i'));
    return m ? Number(m[1]) : fallback;
  };
  const values = { a: knob('a', 1), h: knob('h', 0), k: knob('k', 0) };
  if (numbersIn(text).length === 0 && text.includes('=')) return { error: 'Give the knobs as numbers, e.g. square a=1 h=2 k=-1.' };
  for (const [name, v] of Object.entries(values)) {
    if (!Number.isFinite(v) || v < KNOB.min || v > KNOB.max) return { error: `${name} must be between ${KNOB.min} and ${KNOB.max}.` };
    if (Math.abs(v / KNOB.step - Math.round(v / KNOB.step)) > 1e-9) return { error: `${name} must be a multiple of ${KNOB.step}.` };
  }
  return { value: { base, ...values } };
}

const example = (id: string, label: string, input: FunctionsInput) => ({ id, label, make: () => input, sized: false });

export const functionsModule = defineAlgorithm<FunctionsInput, PlotState>({
  kind: 'algorithm',
  slug: 'functions',
  view: 'plot',
  input: {
    examples: [
      example('parabola', 'x² moved: (x − 2)² − 1', { base: 'square', a: 1, h: 2, k: -1 }),
      example('line', 'A line: 2x + 1', { base: 'line', a: 2, h: 0, k: 1 }),
      example('flip', 'Flipped: −|x + 1| + 3', { base: 'abs', a: -1, h: -1, k: 3 }),
      example('root', 'Stretched: 2√(x + 3)', { base: 'sqrt', a: 2, h: -3, k: 0 }),
      example('flat', 'Flatter: 0.5x² − 2', { base: 'square', a: 0.5, h: 0, k: -2 }),
    ],
    custom: {
      label: 'Function (line, square, abs, sqrt) and the knobs a, h and k',
      placeholder: 'e.g. square a=1 h=2 k=-1',
      parse: parseFunctions,
      format: ({ base, a, h, k }) => `${base} a=${plain(a)} h=${plain(h)} k=${plain(k)}`,
    },
    drag: (input, handle, to) => {
      const clamp = (v: number) => round(Math.min(KNOB.max, Math.max(KNOB.min, v)), 2);
      if (handle === 'anchor') return { ...input, h: clamp(to[0]), k: clamp(to[1]) };
      return { ...input, a: clamp(to[1] - input.k) };
    },
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'The graph of the plain rule f (faint)' },
    { mark: 'key', label: 'The points from the table, and the anchor (h, k)' },
    { mark: 'compare', label: 'The unit point (h + 1, k + a), and rise over run' },
    { mark: 'found', label: 'The finished graph of a·f(x − h) + k' },
  ],
  run,
  content: {
    idea: 'A function is a rule that turns each input x into exactly one output f(x). Its graph is every point (x, f(x)). Three knobs move a graph without changing its shape: a·f(x − h) + k stretches it by a (and flips it when a is negative), moves it right by h, and lifts it by k.',
    invariant: 'The point (x, f(x)) on the plain graph ends up at (x + h, a·f(x) + k). So the anchor f(0) moves to (h, k), and the curve moves the opposite way to the sign inside the brackets: f(x − 2) is 2 to the right.',
    whenToUse: 'Everywhere a model has knobs. A line y = mx + c is a model with two knobs, and machine learning is choosing the knobs so the graph fits the data. Shifts and stretches also explain why the same few shapes (lines, parabolas, exponentials) turn up everywhere.',
    traits: [
      { label: 'One output per input', good: null },
      { label: 'Shift right by h: f(x − h)', good: null },
      { label: 'a < 0 flips the graph', good: null },
    ],
    experiments: [
      { example: 'parabola', prompt: 'Predict first: does (x − 2)² sit left or right of x²? Then drag the anchor to (−2, −1) and read the new formula.' },
      { example: 'line', prompt: 'Drag the unit point up and down: a is the slope of the line, the rise for each step to the right.' },
      { example: 'flip', prompt: 'A negative a turns |x| upside down. Drag the unit point above the anchor to flip it back.' },
      { example: 'root', prompt: '√x has no output for negative inputs, so the graph starts at the anchor. Where does it start after h = −3?' },
    ],
  },
});
