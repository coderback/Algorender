import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Handle, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';

// Angles, sine and cosine on the unit circle: a point turned θ from (1, 0)
// travels an arc whose length is θ in radians, and its shadows on the axes are
// cos θ and sin θ. Going round traces the sine wave; turning a vector uses the
// same two numbers; and Math.sin(90) shows what happens when degrees are fed to
// a function that wants radians.

export type CircleInput = { story: 'circle'; deg: number } | { story: 'wave' } | { story: 'rotate'; deg: number; v: Vec } | { story: 'degrees'; deg: number };
export type Story = CircleInput['story'];

export const toRadians = (deg: number) => deg * (Math.PI / 180);
export const toDegrees = (rad: number) => rad * (180 / Math.PI);
/** Turns v by θ radians anticlockwise. */
export const rotate = ([x, y]: Vec, t: number): Vec => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
/** Values this close to 0 count as 0 (sin 180° is 1.2e-16 in floating point). */
const ZERO = 1e-9;
const sign = (v: number) => (Math.abs(v) < ZERO ? 'Zero' : v > 0 ? 'Positive' : 'Negative');
const SIGNS = ['Positive', 'Negative', 'Zero'];

export const WAVE_STEP = 30;
export const LIMITS = { deg: [-360, 360], v: [-3, 3] } as const;

const pseudocode = [
  'P ← (1, 0); turn θ anticlockwise',
  'radians ← arc length = θ° × π / 180',
  'P = (cos θ, sin θ): its shadows',
  'cos²θ + sin²θ = 1 (Pythagoras)',
  'trace sin θ as θ goes 0 → 2π',
  "v' ← (x cos θ − y sin θ,",
  '      x sin θ + y cos θ)',
  'sin(90) in code means 90 radians',
];

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });

const circlePoints = (r = 1, from = 0, to = 2 * Math.PI, n = 120): Vec[] => Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n).map((t) => [r * Math.cos(t), r * Math.sin(t)] as Vec);
const circleShape: Shape = { kind: 'path', id: 'circle', points: circlePoints(), closed: true, faint: true };

function circlePlane(shapes: Shape[], handles: Handle[] = [], label = 'The unit circle (radius 1)'): PlanePart {
  const axis = { min: -1.45, max: 1.45 };
  return { kind: 'plane', id: 'plane', label, x: { ...axis, label: 'x' }, y: { ...axis, label: 'y' }, equal: true, shapes: [circleShape, ...shapes], handles };
}

/** The point at angle t, its arc from (1, 0), and (optionally) its two shadows. */
function turned(t: number, opts: { arc?: boolean; shadows?: boolean; radius?: boolean } = {}): Shape[] {
  const P: Vec = [Math.cos(t), Math.sin(t)];
  const out: Shape[] = [];
  if (opts.arc) out.push({ kind: 'path', id: 'arc', points: circlePoints(1, 0, t, Math.max(8, Math.ceil(Math.abs(t) * 20))), mark: 'found', label: `arc ${fmt(t, 2)}` });
  if (opts.radius !== false) out.push({ kind: 'vector', id: 'radius', from: [0, 0], to: P });
  if (opts.shadows) {
    out.push({ kind: 'path', id: 'cos', points: [[0, 0], [P[0], 0]], tone: 1, label: 'cos θ' });
    out.push({ kind: 'path', id: 'sin', points: [[P[0], 0], P], tone: 2, label: 'sin θ' });
  }
  out.push({ kind: 'point', id: 'P', at: P, mark: 'key', label: 'P' });
  return out;
}

/** A handle on P: drag it around the circle. Its position is P rounded to the drawing's hundredths. */
const pointHandle = (t: number): Handle => ({ id: 'P', at: [round(Math.cos(t), 2), round(Math.sin(t), 2)], label: 'P on the circle', mark: 'key', step: 0.25, min: [-1, -1], max: [1, 1] });

const angleReadouts = (deg: number): Readout[] => [
  { id: 'deg', label: 'θ in degrees', value: `${fmt(deg)}°` },
  { id: 'rad', label: 'θ in radians', value: fmt(toRadians(deg), 3), mark: 'found' },
];

// ───────────────────────────── the circle ─────────────────────────────

function* circle(deg: number): Generator<Frame<PlotState>> {
  const t = toRadians(deg);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const vars = { 'θ°': deg, θ: round(t, 3) };

  yield plotFrame([circlePlane(turned(0)), readouts([{ id: 'deg', label: 'θ in degrees', value: '0°' }])], {
    line: 0,
    note: 'The unit circle has radius 1 and its centre at (0, 0). Start the point P at (1, 0), on the right, and turn it anticlockwise. Angles can be measured in degrees (a full turn is 360°) or by how far P travels round the circle.',
    vars: { 'θ°': 0 },
    checkpoint: askInOrder('How far does P travel in one full turn of the unit circle?', ['2π ≈ 6.28', '360', 'π ≈ 3.14', '1'], '2π ≈ 6.28'),
  });

  yield plotFrame([circlePlane(turned(t, { arc: true }), [pointHandle(t)]), readouts(angleReadouts(deg))], {
    line: 1,
    note: `A full turn, 360°, travels the whole circumference, 2π ≈ 6.28. Turning ${fmt(deg)}° travels ${fmt(t, 3)}: that distance is the angle in radians. To convert, multiply degrees by π/180. Drag P to try other angles.`,
    vars,
    checkpoint: askInOrder('Is P’s x-coordinate (how far right of the centre it is) positive, negative or zero?', SIGNS, sign(c)),
  });

  yield plotFrame(
    [
      circlePlane(turned(t, { arc: true, shadows: true }), [pointHandle(t)]),
      readouts([...angleReadouts(deg), { id: 'cos', label: 'cos θ', value: fmt(c, 3), tone: 1 }, { id: 'sin', label: 'sin θ', value: fmt(s, 3), tone: 2 }]),
    ],
    {
      line: 2,
      note: `P is at (${fmt(c, 3)}, ${fmt(s, 3)}). Its x-coordinate is called cos θ and its y-coordinate sin θ: the shadows P casts on the two axes. So cos ${fmt(deg)}° = ${fmt(c, 3)} and sin ${fmt(deg)}° = ${fmt(s, 3)}.`,
      vars: { ...vars, cos: round(c, 3), sin: round(s, 3) },
      checkpoint: ask('What is cos²θ + sin²θ for this P?', '1', [fmt(c + s, 2), '0', '2']),
    },
  );

  yield plotFrame(
    [
      circlePlane(turned(t, { arc: true, shadows: true }), [pointHandle(t)]),
      readouts([
        { id: 'cos2', label: 'cos²θ', value: fmt(c * c, 3), tone: 1 },
        { id: 'sin2', label: 'sin²θ', value: fmt(s * s, 3), tone: 2 },
        { id: 'one', label: 'cos²θ + sin²θ', value: fmt(c * c + s * s, 3), mark: 'found' },
      ]),
    ],
    {
      line: 3,
      note: `The two shadows and the radius make a right-angled triangle with a long side of 1, so by Pythagoras cos²θ + sin²θ = 1 (cos²θ means (cos θ)²): ${fmt(c * c, 3)} + ${fmt(s * s, 3)} = 1, at every angle. That is why both always stay between −1 and 1.`,
      vars: { ...vars, 'cos²+sin²': 1 },
    },
  );
}

// ───────────────────────────── the sine wave ─────────────────────────────

function* wave(): Generator<Frame<PlotState>> {
  const ticks = [
    { at: 0, label: '0' },
    { at: Math.PI / 2, label: 'π/2' },
    { at: Math.PI, label: 'π' },
    { at: (3 * Math.PI) / 2, label: '3π/2' },
    { at: 2 * Math.PI, label: '2π' },
  ];
  const wavePlane = (shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'wave', label: 'sin θ against θ', x: { min: -0.2, max: 2 * Math.PI + 0.2, label: 'θ (radians)', ticks }, y: { min: -1.3, max: 1.3, label: 'sin θ' }, equal: false, shapes, handles: [] });
  const dots: Vec[] = [];
  for (let deg = 0; deg <= 360; deg += WAVE_STEP) {
    const t = toRadians(deg);
    const s = Math.sin(t);
    dots.push([t, s]);
    const next = deg + WAVE_STEP;
    yield plotFrame(
      [
        circlePlane(turned(t, { arc: deg > 0, shadows: true })),
        wavePlane([
          { kind: 'path', id: 'trace', points: [...dots], dots: true, tone: 2 },
          { kind: 'path', id: 'height', points: [[t, 0], [t, s]], tone: 2 },
          { kind: 'point', id: 'now', at: [t, s], mark: 'key' },
        ]),
        readouts([...angleReadouts(deg), { id: 'sin', label: 'sin θ', value: fmt(s, 3), tone: 2 }]),
      ],
      {
        line: 4,
        note:
          deg === 0
            ? 'Turn P round in 30° steps and plot its height, sin θ, against the angle in radians on the right.'
            : `θ = ${deg}° (${fmt(t, 2)} radians): P is at height ${fmt(s, 3)}, so that is the next point of the wave.${deg === 360 ? ' One full turn draws one full wave, and turning further repeats it: sine has a period of 2π.' : ''}`,
        vars: { 'θ°': deg, sin: round(s, 3) },
        checkpoint: next <= 360 ? askInOrder(`At θ = ${next}°, will sin θ be positive, negative or zero?`, SIGNS, sign(Math.sin(toRadians(next)))) : undefined,
      },
    );
  }
  const curve = (g: (t: number) => number): Vec[] => Array.from({ length: 121 }, (_, i) => (2 * Math.PI * i) / 120).map((t) => [t, g(t)] as Vec);
  yield plotFrame(
    [
      circlePlane(turned(2 * Math.PI, { shadows: true })),
      wavePlane([
        { kind: 'path', id: 'trace', points: curve(Math.sin), tone: 2, label: 'sin θ' },
        { kind: 'path', id: 'cos-wave', points: curve(Math.cos), tone: 1, label: 'cos θ' },
      ]),
      readouts([{ id: 'period', label: 'period', value: '2π ≈ 6.283' }]),
    ],
    {
      line: 4,
      note: 'The smooth curve through the dots is the sine wave. Plotting the x-shadow instead gives cos θ: the same wave, reaching each peak a quarter turn (π/2) before sine does. Waves like these gave the original transformer its sense of position.',
      vars: {},
    },
  );
}

// ───────────────────────────── rotating a vector ─────────────────────────────

function* rotation(deg: number, v: Vec): Generator<Frame<PlotState>> {
  const t = toRadians(deg);
  const [x, y] = v;
  const iHat: Vec = [Math.cos(t), Math.sin(t)];
  const jHat: Vec = [-Math.sin(t), Math.cos(t)];
  const w = rotate(v, t);
  const len = Math.hypot(x, y);
  const axis = { min: -3.6, max: 3.6 };
  const handle: Handle = { id: 'v', at: v, label: 'Tip of v', mark: 'key', step: 0.5, min: [LIMITS.v[0], LIMITS.v[0]], max: [LIMITS.v[1], LIMITS.v[1]] };
  const plane = (shapes: Shape[]): PlanePart => ({ kind: 'plane', id: 'plane', label: `Turning v by ${fmt(deg)}°`, x: { ...axis, label: 'x' }, y: { ...axis, label: 'y' }, equal: true, shapes, handles: [handle] });
  const V: Shape = { kind: 'vector', id: 'v', from: [0, 0], to: v, mark: 'key', label: 'v' };
  const vars = { 'θ°': deg, x, y };

  yield plotFrame([plane([V]), readouts([{ id: 'v', label: 'v', value: `(${fmt(x)}, ${fmt(y)})` }, { id: 'len', label: 'length of v', value: fmt(len, 3) }])], {
    line: 5,
    note: `Turn the arrow v = (${fmt(x)}, ${fmt(y)}) by ${fmt(deg)}° about the origin. Sine and cosine say where it lands. Drag v's tip to try other arrows.`,
    vars,
    checkpoint: askInOrder('Does turning v change its length?', ['Yes', 'No'], 'No'),
  });
  yield plotFrame(
    [
      plane([
        V,
        { kind: 'vector', id: 'i', from: [0, 0], to: iHat, tone: 1, label: '(1, 0) turned' },
        { kind: 'vector', id: 'j', from: [0, 0], to: jHat, tone: 2, label: '(0, 1) turned' },
      ]),
      readouts([
        { id: 'i', label: '(1, 0) lands on', value: `(${fmt(iHat[0], 3)}, ${fmt(iHat[1], 3)})`, tone: 1 },
        { id: 'j', label: '(0, 1) lands on', value: `(${fmt(jHat[0], 3)}, ${fmt(jHat[1], 3)})`, tone: 2 },
      ]),
    ],
    {
      line: 5,
      note: `First turn the two unit steps. (1, 0) goes to (cos θ, sin θ) = (${fmt(iHat[0], 3)}, ${fmt(iHat[1], 3)}), as on the unit circle, and (0, 1), a quarter turn ahead, goes to (−sin θ, cos θ) = (${fmt(jHat[0], 3)}, ${fmt(jHat[1], 3)}).`,
      vars: { ...vars, cos: round(Math.cos(t), 3), sin: round(Math.sin(t), 3) },
      checkpoint: ask(`v is ${fmt(x)} steps of (1, 0) plus ${fmt(y)} of (0, 1). What is the x-coordinate of the turned v?`, fmt(w[0], 2), [fmt(x * Math.cos(t), 2), fmt(x * Math.cos(t) + y * Math.sin(t), 2), fmt(w[1], 2)]),
    },
  );
  yield plotFrame(
    [
      plane([
        V,
        { kind: 'vector', id: 'i', from: [0, 0], to: [x * iHat[0], x * iHat[1]], tone: 1, dashed: true },
        { kind: 'vector', id: 'j', from: [x * iHat[0], x * iHat[1]], to: w, tone: 2, dashed: true },
        { kind: 'vector', id: 'w', from: [0, 0], to: w, mark: 'found', label: "v'" },
      ]),
      readouts([
        { id: 'w', label: "v' (turned)", value: `(${fmt(w[0], 3)}, ${fmt(w[1], 3)})`, mark: 'found' },
        { id: 'len', label: 'length of v', value: fmt(len, 3) },
        { id: 'len2', label: "length of v'", value: fmt(Math.hypot(...w), 3) },
      ]),
    ],
    {
      line: 6,
      note: `Take ${fmt(x)} of the turned (1, 0) and ${fmt(y)} of the turned (0, 1): v' = (x cos θ − y sin θ, x sin θ + y cos θ) = (${fmt(w[0], 3)}, ${fmt(w[1], 3)}). Its length is still ${fmt(len, 3)}: turning moves an arrow without stretching it.`,
      vars: { ...vars, "x'": round(w[0], 3), "y'": round(w[1], 3) },
    },
  );
}

// ───────────────────────────── degrees in code ─────────────────────────────

function* degrees(deg: number): Generator<Frame<PlotState>> {
  const wrong = deg;
  const right = toRadians(deg);
  const turns = Math.floor(wrong / (2 * Math.PI));
  yield plotFrame([circlePlane(turned(0)), readouts([{ id: 'call', label: 'the call', value: `Math.sin(${fmt(deg)})` }])], {
    line: 7,
    note: `You want sin ${fmt(deg)}°, so you write Math.sin(${fmt(deg)}) in JavaScript (or math.sin(${fmt(deg)}) in Python). Python's, JavaScript's and almost every other language's sin and cos expect radians.`,
    vars: { x: deg },
    checkpoint: ask(`What does Math.sin(${fmt(deg)}) return?`, fmt(Math.sin(wrong), 3), [fmt(Math.sin(right), 3), '0', fmt(-Math.sin(right), 3)]),
  });
  yield plotFrame([circlePlane(turned(wrong, { shadows: true })), readouts([{ id: 'got', label: `Math.sin(${fmt(deg)})`, value: fmt(Math.sin(wrong), 3), mark: 'reject' }, { id: 'turns', label: 'full turns', value: fmt(wrong / (2 * Math.PI), 2) }])], {
    line: 7,
    note: `Math.sin(${fmt(deg)}) = ${fmt(Math.sin(wrong), 3)}: it turned P ${fmt(deg)} radians, which is ${fmt(wrong / (2 * Math.PI), 2)} full turns${turns > 0 ? `, ending ${fmt(toDegrees(wrong - turns * 2 * Math.PI), 1)}° round` : ''}. No error, no warning: just a wrong number.`,
    vars: { x: deg, 'sin(x)': round(Math.sin(wrong), 3) },
    checkpoint: ask(`What should you pass instead, to get sin ${fmt(deg)}°?`, `${fmt(deg)} × π/180`, [`${fmt(deg)} × 180/π`, `${fmt(deg)} / 360`]),
  });
  yield plotFrame([circlePlane(turned(right, { arc: true, shadows: true })), readouts([{ id: 'right', label: `Math.sin(${fmt(deg)} × π/180)`, value: fmt(Math.sin(right), 3), mark: 'found' }, ...angleReadouts(deg)])], {
    line: 1,
    note: `Converted first, ${fmt(deg)}° is ${fmt(right, 3)} radians, and Math.sin(${fmt(right, 3)}) = ${fmt(Math.sin(right), 3)}, the value you wanted. Convert with × π/180 (Python also has math.radians).`,
    vars: { x: round(right, 3), 'sin(x)': round(Math.sin(right), 3) },
  });
}

function* run(input: CircleInput): Generator<Frame<PlotState>> {
  if (input.story === 'circle') yield* circle(input.deg);
  else if (input.story === 'wave') yield* wave();
  else if (input.story === 'rotate') yield* rotation(input.deg, input.v);
  else yield* degrees(input.deg);
}

const STORIES: Story[] = ['circle', 'wave', 'rotate', 'degrees'];

export function parseCircle(text: string): { value: CircleInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  const story = STORIES.find((s) => s === word);
  if (!story) return { error: 'Start with circle, wave, rotate or degrees.' };
  if (story === 'wave') return { value: { story } };
  const xs = numbersIn(text);
  const [lo, hi] = LIMITS.deg;
  const angleOk = (d: number) => Number.isInteger(d) && d >= lo && d <= hi;
  if (story === 'rotate') {
    if (xs.length !== 3 || !angleOk(xs[0])) return { error: 'Give a whole angle in degrees and the vector, e.g. rotate 90 2 1.' };
    const v: Vec = [xs[1], xs[2]];
    if (!v.every((c) => c >= LIMITS.v[0] && c <= LIMITS.v[1] && Math.abs(c * 2 - Math.round(c * 2)) < 1e-9)) return { error: `The vector's parts must be halves from ${LIMITS.v[0]} to ${LIMITS.v[1]}.` };
    return { value: { story, deg: xs[0], v } };
  }
  if (xs.length !== 1 || !angleOk(xs[0])) return { error: `Give one whole angle in degrees from ${lo} to ${hi}, e.g. ${story} 60.` };
  return { value: { story, deg: xs[0] } };
}

function format(input: CircleInput): string {
  if (input.story === 'wave') return 'wave';
  if (input.story === 'rotate') return `rotate ${input.deg} ${plain(input.v[0])} ${plain(input.v[1])}`;
  return `${input.story} ${input.deg}`;
}

const example = (id: string, label: string, input: CircleInput) => ({ id, label, make: () => input, sized: false });

export const unitCircle = defineAlgorithm<CircleInput, PlotState>({
  kind: 'algorithm',
  slug: 'unit-circle',
  view: 'plot',
  input: {
    examples: [
      example('angle', 'An angle of 60°', { story: 'circle', deg: 60 }),
      example('obtuse', 'An angle of 150°', { story: 'circle', deg: 150 }),
      example('wave', 'Tracing the sine wave', { story: 'wave' }),
      example('rotate', 'Turning a vector', { story: 'rotate', deg: 90, v: [2, 1] }),
      example('degrees', 'Math.sin(90)', { story: 'degrees', deg: 90 }),
    ],
    custom: {
      label: 'A story: circle θ, wave, rotate θ x y, or degrees θ (θ in degrees)',
      placeholder: 'e.g. circle 60',
      parse: parseCircle,
      format,
    },
    drag: (input, _handle, to) => {
      if (input.story === 'circle') {
        if (to[0] === 0 && to[1] === 0) return input;
        const deg = Math.round(toDegrees(Math.atan2(to[1], to[0])));
        return { ...input, deg: deg < 0 ? deg + 360 : deg };
      }
      if (input.story === 'rotate') return { ...input, v: [round(to[0], 1), round(to[1], 1)] };
      return input;
    },
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'The unit circle and the radius' },
    { mark: 'key', label: 'The point P, or the vector v' },
    { mark: 'found', label: 'The arc (the angle in radians), or v turned' },
    { mark: 'reject', label: 'The value you get by passing degrees' },
    { tone: 1, label: 'cos θ, the x-shadow' },
    { tone: 2, label: 'sin θ, the y-shadow' },
  ],
  run,
  content: {
    idea: 'Turn a point anticlockwise round a circle of radius 1, starting from (1, 0). The distance it travels is the angle in radians (a full turn is 2π, the same as 360°), and its coordinates are (cos θ, sin θ): the shadows it casts on the two axes. Going round and round traces the sine wave.',
    invariant: 'cos²θ + sin²θ = 1 at every angle (Pythagoras on the unit circle), so both stay between −1 and 1, and they repeat every 2π. Turning a vector by θ sends (x, y) to (x cos θ − y sin θ, x sin θ + y cos θ) and keeps its length.',
    whenToUse: 'Whenever something turns or repeats: rotating points in graphics and robotics, waves and signals, and in machine learning the sine and cosine positional encodings and rotary embeddings (RoPE) that tell a transformer where each word is. In code, always pass radians.',
    traits: [
      { label: 'Radians = arc length', good: null },
      { label: 'cos²θ + sin²θ = 1', good: null },
      { label: 'Code wants radians, not degrees', good: false },
    ],
    experiments: [
      { example: 'angle', prompt: 'Drag P into each quarter of the circle and predict the signs of cos θ and sin θ before you read them.' },
      { example: 'wave', prompt: 'Predict each sign before stepping: sin θ is positive in the top half of the circle and negative in the bottom.' },
      { example: 'rotate', prompt: 'A quarter turn sends (x, y) to (−y, x). Check it, then drag v and check again.' },
      { example: 'degrees', prompt: 'Predict Math.sin(90) before you step. Then try degrees 180: is Math.sin(180) zero?' },
    ],
  },
});
