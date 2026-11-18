import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { fmt, fmtVec, round } from '@/viz/plot/geometry';
import type { Bar, Handle, PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';
import { dot, norm, scale } from './shared';

// The dot product: multiply the matching parts of two vectors and add them up.
// One number that says how much two vectors point the same way: positive when
// the angle between them is under 90°, zero at a right angle, negative beyond.
// It is |u|·|v|·cos θ, the length of one vector's shadow on the other times
// the other's length, and divided by both lengths it is the cosine
// similarity that compares word vectors by direction alone.

export type DotInput =
  | { story: 'parts'; u: readonly number[]; v: readonly number[] }
  | { story: 'angle'; u: Vec; len: number }
  | { story: 'shadow'; u: Vec; v: Vec }
  | { story: 'similar'; q: Vec };
export type Story = DotInput['story'];

export const LIMITS = { part: 9, parts: [2, 6], plane: 4, len: 3 } as const;
/** The sweep's angles from u, in degrees. */
export const SWEEP = [0, 30, 60, 90, 120, 150, 180] as const;
/** Values this close to 0 count as 0 (cos 90° is 6e-17 in floating point). */
const ZERO = 1e-9;
const sign = (v: number) => (Math.abs(v) < ZERO ? 'Zero' : v > 0 ? 'Positive' : 'Negative');
const SIGNS = ['Positive', 'Zero', 'Negative'];

/** Toy word vectors, placed by hand for the picture (real embeddings have hundreds of learned numbers). */
export const WORDS: readonly { word: string; at: Vec }[] = [
  { word: 'dog', at: [4, 2] },
  { word: 'kitten', at: [2, 1.5] },
  { word: 'elephant', at: [6, 6] },
  { word: 'car', at: [-2, 3] },
];

const pseudocode = [
  'u·v = u₁v₁ + u₂v₂ + … + uₙvₙ',
  'total ← 0; for each i: total += uᵢ·vᵢ',
  'u·v = |u|·|v|·cos θ',
  'cos θ = u·v / (|u|·|v|)',
  'shadow of v on u = u·v / |u|',
  'v⊥ = v − (u·v / u·u)·u;  u·v⊥ = 0',
  'most similar: the largest cos θ',
];

export const dotN = (u: readonly number[], v: readonly number[]) => u.reduce((s, x, i) => s + x * v[i], 0);
export const cosine = (u: Vec, v: Vec) => dot(u, v) / (norm(u) * norm(v));
/** The projection of v onto u's line: (u·v / u·u)·u. */
export const project = (v: Vec, u: Vec): Vec => scale(dot(u, v) / dot(u, u), u);
const angleOf = (v: Vec) => Math.atan2(v[1], v[0]);
const toRad = (deg: number) => (deg * Math.PI) / 180;
/** v at `deg` degrees anticlockwise from u's direction, `len` long. */
export const swept = (u: Vec, len: number, deg: number): Vec => [len * Math.cos(angleOf(u) + toRad(deg)), len * Math.sin(angleOf(u) + toRad(deg))];

const readouts = (items: Readout[], id = 'readouts', label = 'Values'): PlotPart => ({ kind: 'readouts', id, label, items });

function plane(label: string, shapes: Shape[], handles: Handle[], extent: number = LIMITS.plane + 0.5, id = 'plane'): PlanePart {
  return { kind: 'plane', id, label, x: { min: -extent, max: extent, label: 'x' }, y: { min: -extent, max: extent, label: 'y' }, equal: true, shapes, handles };
}

const handle = (id: string, at: Vec, label: string, tone?: 1 | 2): Handle => ({ id, at, label, tone, step: 0.5, min: [-LIMITS.plane, -LIMITS.plane], max: [LIMITS.plane, LIMITS.plane] });
const list = (xs: readonly number[]) => `(${xs.map((x) => fmt(x)).join(', ')})`;
const times = (a: number, b: number) => `${fmt(a)}×${b < 0 ? `(${fmt(b)})` : fmt(b)}`;

// ───────────────────────────── parts: multiply and add ─────────────────────────────

function* parts(u: readonly number[], v: readonly number[]): Generator<Frame<PlotState>> {
  const n = u.length;
  const products = u.map((x, i) => x * v[i]);
  const total = dotN(u, v);
  const sub = (i: number) => String.fromCharCode(0x2080 + i + 1);
  const top = Math.max(1, ...products.map(Math.abs));
  const running = (k: number) => products.slice(0, k).reduce((s, p) => s + p, 0);
  const chart = (k: number): PlanePart => {
    const bars: Bar[] = products.slice(0, k).map((p, i) => ({ id: `p${i}`, x0: i + 0.15, x1: i + 0.85, y: p, label: fmt(p), mark: p < 0 ? 'reject' : 'found' }));
    const run: Vec[] = [[0, 0], ...products.slice(0, k).map((_, i) => [i + 1, running(i + 1)] as Vec)];
    return {
      kind: 'plane',
      id: 'chart',
      label: 'Each product uᵢvᵢ as a bar, and the running total',
      x: { min: -0.2, max: n + 0.2, label: 'i', ticks: u.map((_, i) => ({ at: i + 0.5, label: `u${sub(i)}v${sub(i)}` })) },
      y: { min: Math.min(-1, -top, ...products.map((_, i) => running(i + 1))) - 0.5, max: Math.max(top, ...products.map((_, i) => running(i + 1))) + 1, label: 'value' },
      equal: false,
      shapes: [{ kind: 'bars', id: 'bars', bars }, ...(k > 0 ? [{ kind: 'path' as const, id: 'running', points: run, dots: true, tone: 1 as const, label: 'running total' }] : [])],
      handles: [],
    };
  };
  const table = (k: number) =>
    readouts([
      { id: 'u', label: 'u', value: list(u), tone: 1 },
      { id: 'v', label: 'v', value: list(v), tone: 2 },
      { id: 'total', label: k === n ? 'u·v' : 'running total', value: fmt(running(k)), mark: k === n ? 'found' : null },
    ]);
  const sumU = u.reduce((s, x) => s + x, 0);
  const sumV = v.reduce((s, x) => s + x, 0);

  yield plotFrame([chart(0), table(0)], {
    line: 0,
    note: `u = ${list(u)} and v = ${list(v)} have ${n} parts each. Their dot product, u·v, multiplies the matching parts (first with first, second with second…) and adds up the results.`,
    vars: { n, total: 0 },
    checkpoint: ask('What is u·v?', fmt(total), [fmt(sumU * sumV), fmt(sumU + sumV), fmt(products.reduce((s, p) => s + Math.abs(p), 0))]),
  });

  for (let i = 0; i < n; i++) {
    const r = running(i + 1);
    const next = i + 1 < n ? running(i + 2) : null;
    yield plotFrame([chart(i + 1), table(i + 1)], {
      line: 1,
      note: `u${sub(i)}v${sub(i)} = ${times(u[i], v[i])} = ${fmt(products[i])}${products[i] < 0 ? ': the parts disagree in sign, so this one pulls the total down' : products[i] === 0 ? ': a zero part adds nothing' : ''}. Running total: ${fmt(r)}.${i === n - 1 ? ` So u·v = ${fmt(total)}.` : ''}`,
      vars: { i: i + 1, [`u${sub(i)}`]: u[i], [`v${sub(i)}`]: v[i], total: r },
      checkpoint: next === null ? undefined : ask(`Add u${sub(i + 1)}v${sub(i + 1)} = ${times(u[i + 1], v[i + 1])}. What is the running total now?`, fmt(next), [fmt(r + Math.abs(products[i + 1])), fmt(r + u[i + 1] + v[i + 1]), fmt(r - products[i + 1]), fmt(next + 1)]),
    });
  }

  yield plotFrame([chart(n), table(n)], {
    line: 0,
    note: `u·v = ${products.map((p) => fmt(p)).join(' + ').replace(/\+ −/g, '− ')} = ${fmt(total)}: a single number, not a vector. It is the Σ of uᵢvᵢ, so in code it is one loop with a running total.`,
    vars: { n, total },
  });
}

// ───────────────────────────── the angle and the sign ─────────────────────────────

function* angle(u: Vec, len: number): Generator<Frame<PlotState>> {
  const nu = norm(u);
  const handles = [handle('u', u, 'Tip of u', 1)];
  const U: Shape = { kind: 'vector', id: 'u', from: [0, 0], to: u, tone: 1, label: 'u' };
  for (let k = 0; k < SWEEP.length; k++) {
    const deg = SWEEP[k];
    const v = swept(u, len, deg);
    const d = dot(u, v);
    const c = Math.cos(toRad(deg));
    const arc: Vec[] = Array.from({ length: 25 }, (_, i) => {
      const t = angleOf(u) + (toRad(deg) * i) / 24;
      return [0.8 * Math.cos(t), 0.8 * Math.sin(t)] as Vec;
    });
    const next = SWEEP[k + 1];
    yield plotFrame(
      [
        plane(`v at ${deg}° from u`, [{ kind: 'line', id: 'u-line', through: [0, 0], dir: u, dashed: true }, ...(deg > 0 ? [{ kind: 'path' as const, id: 'arc', points: arc, label: `${deg}°` }] : []), U, { kind: 'vector', id: 'v', from: [0, 0], to: v, tone: 2, label: 'v' }], handles),
        readouts([
          { id: 'theta', label: 'angle θ', value: `${deg}°` },
          { id: 'dot', label: 'u·v', value: fmt(d, 3), mark: Math.abs(d) < ZERO ? null : d > 0 ? 'found' : 'reject' },
          { id: 'cos', label: 'cos θ', value: fmt(c, 3) },
        ]),
      ],
      {
        line: k === 0 ? 0 : 2,
        note:
          k === 0
            ? `u = ${fmtVec(u)}, and v is ${fmt(len)} long, starting in the same direction as u. Pointing together, u·v = ${fmt(d, 3)}, the largest it can be: |u| × |v| = ${fmt(nu, 3)} × ${fmt(len)}. Now turn v away from u in ${SWEEP[1]}° steps. Drag u to turn the whole picture.`
            : deg === 90
              ? `At 90°, a right angle, u·v = 0: the two parts' products cancel exactly. Vectors whose dot product is 0 are called perpendicular, or orthogonal.`
              : deg === 180
                ? `At 180° v points straight back along u, and u·v = ${fmt(d, 3)}, as negative as it can be.`
                : `θ = ${deg}°: u·v = ${fmt(d, 3)}${deg < 90 ? ', still positive: v still leans the same way as u' : ', negative: v now leans away from u'}.`,
        vars: { 'θ°': deg, 'u·v': round(d, 2) },
        checkpoint: next === undefined ? undefined : askInOrder(`Turn v to ${next}° from u. Will u·v be positive, zero or negative?`, SIGNS, sign(dot(u, swept(u, len, next)))),
      },
    );
  }
  yield plotFrame([plane('u·v = |u|·|v|·cos θ', [U, ...SWEEP.map((deg) => ({ kind: 'vector' as const, id: `v${deg}`, from: [0, 0] as Vec, to: swept(u, len, deg), mark: (deg < 90 ? 'found' : deg > 90 ? 'reject' : null) as 'found' | 'reject' | null, label: `${deg}°` }))], handles), readouts([{ id: 'max', label: '|u|·|v|', value: fmt(nu * len, 3) }, { id: 'rule', label: 'u·v', value: '|u|·|v|·cos θ' }])], {
    line: 2,
    note: `Every value matched |u|·|v|·cos θ = ${fmt(nu * len, 3)} × cos θ. Under 90° the dot product is positive, at 90° zero, beyond it negative. Divide by both lengths and only cos θ is left: how much the two point the same way, whatever their sizes.`,
    vars: {},
  });
}

// ───────────────────────────── the shadow ─────────────────────────────

function* shadow(u: Vec, v: Vec): Generator<Frame<PlotState>> {
  const handles = [handle('u', u, 'Tip of u', 1), handle('v', v, 'Tip of v', 2)];
  const d = dot(u, v);
  const nu = norm(u);
  const s = d / nu;
  const p = project(v, u);
  const perp: Vec = [v[0] - p[0], v[1] - p[1]];
  const U: Shape = { kind: 'vector', id: 'u', from: [0, 0], to: u, tone: 1, label: 'u' };
  const V: Shape = { kind: 'vector', id: 'v', from: [0, 0], to: v, tone: 2, label: 'v' };
  const line: Shape = { kind: 'line', id: 'u-line', through: [0, 0], dir: u, dashed: true, label: 'u’s line' };
  const drop: Shape = { kind: 'path', id: 'drop', points: [v, p], dashed: true, faint: true };
  const shade: Shape = { kind: 'vector', id: 'shadow', from: [0, 0], to: p, mark: s < 0 ? 'reject' : 'found', label: 'shadow' };
  const vars = { 'u·v': d, '|u|': round(nu, 3) };

  yield plotFrame([plane('v and u', [line, U, V], handles), readouts([{ id: 'u', label: 'u', value: fmtVec(u), tone: 1 }, { id: 'v', label: 'v', value: fmtVec(v), tone: 2 }])], {
    line: 4,
    note: `Shine light onto u's line so that it falls at right angles to the line. v casts a shadow along it. Drag u or v.`,
    vars,
    checkpoint: ask('How long is v’s shadow on u’s line? (Negative if it falls behind the origin.)', fmt(s, 3), [fmt(d, 3), fmt(norm(v), 3), fmt(d / dot(u, u), 3)]),
  });

  yield plotFrame(
    [
      plane('v’s shadow on u', [line, drop, shade, U, V], handles),
      readouts([
        { id: 'dot', label: 'u·v', value: fmt(d) },
        { id: 'len', label: '|u|', value: fmt(nu, 3) },
        { id: 's', label: 'shadow = u·v / |u|', value: fmt(s, 3), mark: s < 0 ? 'reject' : 'found' },
      ]),
    ],
    {
      line: 4,
      note: `The shadow is u·v / |u| = ${fmt(d)} / ${fmt(nu, 3)} = ${fmt(s, 3)} long${s < 0 ? ', negative because v leans away from u' : ''}. Turned round: u·v = |u| × the shadow of v. The dot product measures how far v goes in u's direction.`,
      vars,
      checkpoint: ask('The dashed drop from v to its shadow is v⊥ = v − shadow. What is u·v⊥?', '0', [fmt(d), fmt(s, 3), fmt(-d)]),
    },
  );

  yield plotFrame(
    [
      plane('v = shadow + a part at right angles', [line, shade, { kind: 'vector', id: 'perp', from: p, to: v, mark: 'key', label: 'v⊥' }, U, V], handles),
      readouts([
        { id: 'p', label: 'shadow vector', value: fmtVec(p, 3), mark: s < 0 ? 'reject' : 'found' },
        { id: 'perp', label: 'v⊥', value: fmtVec(perp, 3), mark: 'key' },
        { id: 'zero', label: 'u·v⊥', value: fmt(dot(u, perp), 6) },
      ]),
    ],
    {
      line: 5,
      note: `u·v⊥ = 0: the drop meets u's line at a right angle, so v splits into a part along u, (u·v / u·u)·u = ${fmtVec(p, 3)}, and a part with nothing in u's direction, v⊥ = ${fmtVec(perp, 3)}. Fitting a line to data later uses exactly this split.`,
      vars,
    },
  );
}

// ───────────────────────────── similarity ─────────────────────────────

function* similar(q: Vec): Generator<Frame<PlotState>> {
  const words = WORDS.map((w) => ({ ...w, dot: dot(q, w.at), cos: cosine(q, w.at) }));
  const best = (key: 'dot' | 'cos') => words.reduce((a, b) => (b[key] > a[key] ? b : a)).word;
  const names = WORDS.map((w) => w.word);
  const handles: Handle[] = [{ id: 'q', at: q, label: 'The query word, puppy', mark: 'key', step: 0.5, min: [-3, -3], max: [3, 3] }];
  const shapes = (mark?: (w: (typeof words)[number]) => 'found' | 'reject' | null): Shape[] => [
    ...words.map((w) => ({ kind: 'vector' as const, id: w.word, from: [0, 0] as Vec, to: w.at, label: w.word, mark: mark ? mark(w) : null })),
    { kind: 'vector', id: 'q', from: [0, 0], to: q, mark: 'key', label: 'puppy' },
  ];
  const wordPlane = (label: string, s: Shape[]): PlanePart => ({ ...plane(label, s, handles, 7), x: { min: -3.5, max: 7, label: 'x' }, y: { min: -3.5, max: 7, label: 'y' } });
  const table = (key: 'dot' | 'cos') =>
    readouts(
      [...words].sort((a, b) => b[key] - a[key]).map((w) => ({ id: w.word, label: w.word, value: fmt(w[key], key === 'cos' ? 3 : 2), mark: w.word === best(key) ? ('found' as const) : w[key] < 0 ? ('reject' as const) : null })),
      'readouts',
      key === 'dot' ? 'Dot product with puppy' : 'Cosine similarity with puppy',
    );
  const bestDot = best('dot');
  const bestCos = best('cos');
  const away = words.filter((w) => w.cos < 0).map((w) => w.word);

  yield plotFrame([wordPlane('Toy word vectors', shapes()), readouts([{ id: 'q', label: 'puppy', value: fmtVec(q), mark: 'key' }])], {
    line: 6,
    note: `Language models store each word as a vector, and words used alike point alike. These ${WORDS.length} two-number word vectors are toys, placed by hand for this picture. Which word is most like puppy = ${fmtVec(q)}? Drag puppy to move it.`,
    vars: {},
    checkpoint: askInOrder('Which word has the largest dot product with puppy?', names, bestDot),
  });

  yield plotFrame([wordPlane('Ranked by the dot product', shapes((w) => (w.word === bestDot ? 'found' : null))), table('dot')], {
    line: 0,
    note: `By the dot product, ${bestDot} wins with ${fmt(words.find((w) => w.word === bestDot)!.dot)}.${bestDot !== bestCos ? ` But look at the picture: ${bestDot} wins partly because it is long, and a longer arrow multiplies everything up.` : ''}`,
    vars: {},
    // When both rankings agree the note has just named the winner, so ask whether they agree instead.
    checkpoint:
      bestDot === bestCos
        ? askInOrder('Will the cosine similarity, comparing direction only, pick the same word?', ['Yes', 'No'], 'Yes')
        : askInOrder('Which word has the largest cosine similarity, comparing direction only?', names, bestCos),
  });

  yield plotFrame([wordPlane('Ranked by direction: cos θ', shapes((w) => (w.word === bestCos ? 'found' : w.cos < 0 ? 'reject' : null))), table('cos')], {
    line: 3,
    note: `Cosine similarity divides out both lengths: cos θ = u·v / (|u|·|v|). ${bestCos} points most nearly the same way as puppy, with cos θ = ${fmt(words.find((w) => w.word === bestCos)!.cos, 3)}.${bestDot !== bestCos ? ` The dot product's winner, ${bestDot}, drops to ${fmt(words.find((w) => w.word === bestDot)!.cos, 3)}.` : ''}`,
    vars: {},
    ...(away.length > 0 && { checkpoint: askInOrder('Which word has a negative cosine similarity with puppy?', names, away[0]) }),
  });

  yield plotFrame([wordPlane('1 alike, 0 unrelated, −1 opposite', shapes((w) => (w.cos > 0.9 ? 'found' : w.cos < 0 ? 'reject' : null))), table('cos')], {
    line: 6,
    note: `${away.length ? `${away.join(' and ')} point${away.length === 1 ? 's' : ''} more than 90° away from puppy, so the cosine is negative.` : 'No word here points more than 90° away from puppy.'} A cosine near 1 means alike, near 0 unrelated, and near −1 opposite. Search engines and chatbots find related text this way, over vectors with hundreds of parts.`,
    vars: {},
  });
}

function* run(input: DotInput): Generator<Frame<PlotState>> {
  switch (input.story) {
    case 'parts':
      return yield* parts(input.u, input.v);
    case 'angle':
      return yield* angle(input.u, input.len);
    case 'shadow':
      return yield* shadow(input.u, input.v);
    case 'similar':
      return yield* similar(input.q);
  }
}

// ───────────────────────────── custom text ─────────────────────────────

const STORIES: Story[] = ['parts', 'angle', 'shadow', 'similar'];
const isHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9;
const inPlane = (v: Vec) => v.every((c) => isHalf(c) && Math.abs(c) <= LIMITS.plane);
const nonZero = (v: Vec) => v[0] !== 0 || v[1] !== 0;

export function parseDot(text: string): { value: DotInput } | { error: string } {
  const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
  const story = STORIES.find((s) => s === word);
  if (!story) return { error: 'Start with parts, angle, shadow or similar.' };
  if (story === 'parts') {
    const halves = text.split(/[|;]/);
    if (halves.length !== 2) return { error: 'Give u and v split by |, e.g. parts 2 -1 3 | 1 4 -1.' };
    const u = numbersIn(halves[0]);
    const v = numbersIn(halves[1]);
    const [lo, hi] = LIMITS.parts;
    if (u.length !== v.length || u.length < lo || u.length > hi) return { error: `u and v need the same number of parts, from ${lo} to ${hi}.` };
    if (![...u, ...v].every((x) => isHalf(x) && Math.abs(x) <= LIMITS.part)) return { error: `Use halves from −${LIMITS.part} to ${LIMITS.part}.` };
    return { value: { story, u, v } };
  }
  const xs = numbersIn(text);
  if (story === 'similar') {
    if (xs.length !== 2 || !inPlane([xs[0], xs[1]]) || Math.abs(xs[0]) > 3 || Math.abs(xs[1]) > 3 || !nonZero([xs[0], xs[1]])) return { error: 'Give puppy’s two numbers, halves from −3 to 3 (not both 0), e.g. similar 2 1.' };
    return { value: { story, q: [xs[0], xs[1]] } };
  }
  if (story === 'angle') {
    if (xs.length !== 3) return { error: 'Give u and the length of v, e.g. angle 3 1 2.' };
    const u: Vec = [xs[0], xs[1]];
    if (!inPlane(u) || !nonZero(u)) return { error: `u's parts are halves from −${LIMITS.plane} to ${LIMITS.plane}, not both 0.` };
    if (!isHalf(xs[2]) || xs[2] <= 0 || xs[2] > LIMITS.len) return { error: `v's length is a half from 0.5 to ${LIMITS.len}.` };
    return { value: { story, u, len: xs[2] } };
  }
  if (xs.length !== 4) return { error: 'Give u and v, e.g. shadow 4 0, 2 3.' };
  const u: Vec = [xs[0], xs[1]];
  const v: Vec = [xs[2], xs[3]];
  if (!inPlane(u) || !inPlane(v) || !nonZero(u)) return { error: `Use halves from −${LIMITS.plane} to ${LIMITS.plane}; u can't be (0, 0).` };
  return { value: { story, u, v } };
}

function format(input: DotInput): string {
  const p = (v: Vec) => `${plain(v[0])} ${plain(v[1])}`;
  switch (input.story) {
    case 'parts':
      return `parts ${input.u.map((x) => plain(x)).join(' ')} | ${input.v.map((x) => plain(x)).join(' ')}`;
    case 'angle':
      return `angle ${p(input.u)} ${plain(input.len)}`;
    case 'shadow':
      return `shadow ${p(input.u)}, ${p(input.v)}`;
    case 'similar':
      return `similar ${p(input.q)}`;
  }
}

const snapHalf = (x: number) => Math.round(x * 2) / 2;

export function dragDot(input: DotInput, id: string, to: Vec): DotInput {
  const t: Vec = [snapHalf(to[0]), snapHalf(to[1])];
  if (input.story === 'angle') return nonZero(t) ? { ...input, u: t } : input;
  if (input.story === 'shadow') {
    if (id === 'u') return nonZero(t) ? { ...input, u: t } : input;
    return { ...input, v: t };
  }
  if (input.story === 'similar') return nonZero(t) ? { ...input, q: t } : input;
  return input;
}

const example = (id: string, label: string, input: DotInput) => ({ id, label, make: () => input, sized: false });

export const dotProduct = defineAlgorithm<DotInput, PlotState>({
  kind: 'algorithm',
  slug: 'dot-product',
  view: 'plot',
  input: {
    examples: [
      example('parts', 'Multiply the parts, add them up', { story: 'parts', u: [2, -1, 3], v: [1, 4, -1] }),
      example('bill', 'A shopping bill', { story: 'parts', u: [3, 1, 2], v: [2, 5, 1.5] }),
      example('angle', 'The sign, as v turns', { story: 'angle', u: [3, 1], len: 2 }),
      example('shadow', 'The shadow of v on u', { story: 'shadow', u: [4, 0], v: [2, 3] }),
      example('tilted', 'A shadow on a tilted line', { story: 'shadow', u: [3, 1], v: [1, 2] }),
      example('similar', 'Similar words', { story: 'similar', q: [2, 1] }),
    ],
    custom: {
      label: 'A story: parts u | v, angle ux uy |v|, shadow ux uy, vx vy, or similar qx qy',
      placeholder: 'e.g. parts 2 -1 3 | 1 4 -1',
      parse: parseDot,
      format,
    },
    drag: dragDot,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Guides, and words that are neither the best match nor opposite' },
    { tone: 1, label: 'u, and the running total' },
    { tone: 2, label: 'v' },
    { mark: 'found', label: 'A positive product or shadow, or the best match' },
    { mark: 'reject', label: 'A negative product or shadow, or an opposite word' },
    { mark: 'key', label: 'The query word, or the part of v at right angles to u' },
  ],
  run,
  content: {
    idea: 'Multiply two vectors’ matching parts and add the results: u·v = u₁v₁ + u₂v₂ + … + uₙvₙ. The answer is one number that says how much the two point the same way: positive when the angle between them is under 90°, zero at a right angle, negative beyond.',
    invariant: 'u·v = |u|·|v|·cos θ, which is |u| times the length of v’s shadow on u’s line. u·u = |u|², and u·v = v·u. Dividing by both lengths leaves cos θ, between −1 and 1, which compares direction alone.',
    whenToUse: 'Whenever you need “how alike” or “how much along”: cosine similarity between word vectors, documents or images; a neuron’s weighted sum of its inputs; projecting a point onto a line (least squares); checking two directions are at right angles (u·v = 0).',
    traits: [
      { label: 'Two vectors in, one number out', good: null },
      { label: 'Sign tells the angle: < 90°, = 90°, > 90°', good: null },
      { label: 'Grows with length: use cos θ to compare direction', good: false },
    ],
    experiments: [
      { example: 'parts', prompt: 'Change one part of v so that u·v becomes exactly 0. What is the angle between them now?' },
      { example: 'angle', prompt: 'Predict each sign before you step, then drag u: the signs never change with u’s direction.' },
      { example: 'shadow', prompt: 'Drag v behind the origin, left of the y-axis. What happens to the shadow’s sign?' },
      { example: 'similar', prompt: 'Drag puppy until the dot product and the cosine agree on the best match.' },
    ],
  },
});
