import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, plotFrame } from '@/viz/plot/frame';
import type { BitsPart, PlanePart, PlotPart, PlotState, Readout, Shape } from '@/viz/plot/types';

// IEEE 754 single precision (float32): 1 sign bit, 8 exponent bits, 23
// fraction bits. Every finite float32 is an integer times a power of two, so
// its exact decimal value can be written out with BigInt arithmetic.

export type FloatInput = { text: string };

const SIGN = 31;
const MAX_FINITE_BITS = 0x7f7fffff;
/** Longest exact decimal shown in full; longer ones are cut with an ellipsis. */
const MAX_DIGITS = 32;

// ───────────────────────────── bits ─────────────────────────────

const view = new DataView(new ArrayBuffer(4));

/** The 32-bit pattern of x rounded to float32. */
export function bitsOf(x: number): number {
  view.setFloat32(0, x);
  return view.getUint32(0);
}

export function fromBits(bits: number): number {
  view.setUint32(0, bits >>> 0);
  return view.getFloat32(0);
}

export type FloatKind = 'zero' | 'subnormal' | 'normal' | 'infinity' | 'nan';
export type Decoded = { sign: 0 | 1; e: number; f: number; kind: FloatKind };

export function decode(bits: number): Decoded {
  const sign = ((bits >>> SIGN) & 1) as 0 | 1;
  const e = (bits >>> 23) & 0xff;
  const f = bits & 0x7fffff;
  const kind: FloatKind = e === 255 ? (f === 0 ? 'infinity' : 'nan') : e === 0 ? (f === 0 ? 'zero' : 'subnormal') : 'normal';
  return { sign, e, f, kind };
}

/** The gap from |x| to the next float32 up, for a finite float32 pattern. */
export function ulp(bits: number): number {
  const mag = bits & 0x7fffffff;
  const { e } = decode(mag);
  return 2 ** (Math.max(e, 1) - 150);
}

// ───────────────────────────── exact decimals ─────────────────────────────

/** An exact decimal: int / 10^scale. */
type Dec = { int: bigint; scale: number };

function normalize({ int, scale }: Dec): Dec {
  while (scale > 0 && int % 10n === 0n) {
    int /= 10n;
    scale--;
  }
  return { int, scale };
}

/** m × 2^k exactly. */
function fromBinary(m: bigint, k: number): Dec {
  return normalize(k >= 0 ? { int: m << BigInt(k), scale: 0 } : { int: m * 5n ** BigInt(-k), scale: -k });
}

function decString({ int, scale }: Dec): string {
  const neg = int < 0n;
  const digits = (neg ? -int : int).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const frac = digits.slice(digits.length - scale);
  return `${neg ? '−' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** A decimal or scientific literal, exactly. */
function parseDec(text: string): Dec {
  const m = text.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i)!;
  const [, sign, whole, frac = '', exp = '0'] = m;
  let int = BigInt(`${whole}${frac}` || '0');
  let scale = frac.length - Number(exp);
  if (scale < 0) {
    int *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return normalize({ int: sign === '-' ? -int : int, scale });
}

function addDec(a: Dec, b: Dec): Dec {
  const scale = Math.max(a.scale, b.scale);
  return normalize({ int: a.int * 10n ** BigInt(scale - a.scale) + b.int * 10n ** BigInt(scale - b.scale), scale });
}

const sameDec = (a: Dec, b: Dec) => a.int === b.int && a.scale === b.scale;

/** The exact value of a finite float32 pattern as a decimal string (null for ∞ and NaN). */
export function exactDecimal(bits: number): string | null {
  const d = exactDec(bits);
  return d && decString(d);
}

function exactDec(bits: number): Dec | null {
  const { sign, e, f, kind } = decode(bits);
  if (kind === 'infinity' || kind === 'nan') return null;
  const m = BigInt(kind === 'normal' ? f | 0x800000 : f);
  const d = fromBinary(m, Math.max(e, 1) - 150);
  return sign ? { ...d, int: -d.int } : d;
}

/** Cuts a long decimal to MAX_DIGITS characters. */
function short(s: string): string {
  return s.length > MAX_DIGITS ? `${s.slice(0, MAX_DIGITS)}…` : s;
}

/**
 * A decimal for display: in full when it fits, otherwise its leading
 * significant digits in scientific form (a subnormal's exact value starts
 * with dozens of zeros).
 */
function display(d: Dec): string {
  const full = decString(d);
  if (full.length <= MAX_DIGITS) return full;
  const digits = (d.int < 0n ? -d.int : d.int).toString();
  const exponent = digits.length - 1 - d.scale;
  const mantissa = `${digits[0]}.${digits.slice(1, 18)}${digits.length > 18 ? '…' : ''}`;
  return `${d.int < 0n ? '−' : ''}${mantissa} × 10^${num(exponent)}`;
}

/** An integer with a true minus sign. */
const num = (n: number) => (n < 0 ? `−${-n}` : String(n));

// ───────────────────────────── input ─────────────────────────────

const LITERAL = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/** One term, canonical: 'Infinity', '-Infinity', 'NaN', '-0', or the shortest double literal. */
function canonicalTerm(raw: string): string | null {
  const t = raw.trim().replace(/−/g, '-').replace(/^\+/, '');
  const word = t.toLowerCase().replace(/^-/, '');
  if (word === 'inf' || word === 'infinity' || word === '∞') return t.startsWith('-') ? '-Infinity' : 'Infinity';
  if (word === 'nan') return 'NaN';
  if (!LITERAL.test(t)) return null;
  const n = Number(t);
  return Object.is(n, -0) ? '-0' : String(n);
}

type Request = {
  /** The canonical text. */
  text: string;
  /** Its value in float64 (a sum is added in float64). */
  value: number;
  /** The exact decimal asked for, or null for ∞ and NaN. */
  exact: Dec | null;
  sum: [string, string] | null;
};

function interpret(text: string): Request | { error: string } {
  const parts = text.split('+').map((p) => p.trim());
  // A leading sign or an exponent's sign isn't an addition: rejoin "1e+5", "+3".
  const terms: string[] = [];
  for (const p of parts) {
    if (terms.length && (/e$/i.test(terms[terms.length - 1]) || terms[terms.length - 1] === '')) terms[terms.length - 1] += `+${p}`;
    else terms.push(p);
  }
  if (terms.length === 0 || terms.length > 2 || terms.some((t) => t === '')) return { error: 'Enter one number, or a sum of two such as 0.1 + 0.2.' };
  const canon = terms.map(canonicalTerm);
  if (canon.some((c) => c == null)) return { error: 'Use decimals (0.1, -2.5, 1e-40), Infinity, NaN, or a sum of two numbers.' };
  const [a, b] = canon as string[];
  const exactOf = (c: string) => (c === 'NaN' || c.endsWith('Infinity') ? null : parseDec(c));
  if (b === undefined) return { text: a, value: Number(a), exact: exactOf(a), sum: null };
  const ea = exactOf(a);
  const eb = exactOf(b);
  if (!ea || !eb) return { error: 'Sums take two finite numbers.' };
  return { text: `${a} + ${b}`, value: Number(a) + Number(b), exact: addDec(ea, eb), sum: [a, b] };
}

const pretty = (s: string) => s.replace(/-/g, '−').replace(/Infinity/g, '∞');

/** A compact display of a double: plain in a readable range, otherwise scientific. */
function show(v: number): string {
  if (!Number.isFinite(v)) return pretty(String(v));
  if (v === 0) return Object.is(v, -0) ? '−0' : '0';
  const a = Math.abs(v);
  const s = a >= 1e-4 && a < 1e7 ? String(Number(v.toPrecision(8))) : v.toExponential(3).replace('e+', 'e');
  return pretty(s);
}

const pow2 = (p: number) => `2^${p < 0 ? `−${-p}` : p}`;

// ───────────────────────────── frames ─────────────────────────────

const pseudocode = [
  'bits ← float32(x): 1 + 8 + 23 bits',
  's ← bit 31              (1 = negative)',
  'e ← bits 30..23;  power ← e − 127',
  'f ← bits 22..0;   significand 1.f',
  'x ≈ (−1)^s × 1.f × 2^(e − 127)',
  'gap to the next float: 2^(e − 150)',
];

type Stage = 'none' | 'sign' | 'exponent' | 'fraction' | 'all';

function* run(input: FloatInput): Generator<Frame<PlotState>> {
  const req = interpret(input.text);
  if ('error' in req) throw new Error(req.error);
  const stored = Math.fround(req.value);
  const bits = bitsOf(stored);
  const { sign, e, f, kind } = decode(bits);
  const finite = kind !== 'infinity' && kind !== 'nan';
  const asked = pretty(req.text);
  const exact = finite ? exactDec(bits)! : null;
  const isExact =
    kind === 'nan' ? req.text === 'NaN' : kind === 'infinity' ? req.exact == null && req.value === stored : !!req.exact && sameDec(req.exact, exact!);
  const power = Math.max(e, 1) - 127;
  const eBits = bits.toString(2).padStart(32, '0').slice(1, 9);
  const fBits = bits.toString(2).padStart(32, '0').slice(9);
  // The significand 1.f (or 0.f) exactly, cut short when long.
  const sigDec = finite ? fromBinary(BigInt(kind === 'normal' ? f | 0x800000 : f), -23) : null;
  const sig = sigDec ? short(decString(sigDec)) : '';
  const gap = finite ? ulp(bits) : NaN;

  const subs = {
    sign: `${sign} (${sign ? '−' : '+'})`,
    exponent:
      kind === 'normal'
        ? `${e} − 127 = ${num(power)}`
        : kind === 'infinity' || kind === 'nan'
          ? '255: special'
          : '0: subnormal, 2^−126',
    fraction: kind === 'normal' ? `1.f = ${short(sig)}` : kind === 'infinity' ? '0 → ∞' : kind === 'nan' ? '≠ 0 → NaN' : `0.f = ${short(sig)}`,
  };

  const bitsPart = (stage: Stage): BitsPart => {
    const pattern = bits.toString(2).padStart(32, '0');
    const range = stage === 'sign' ? [0, 1] : stage === 'exponent' ? [1, 9] : stage === 'fraction' ? [9, 32] : [0, 0];
    const shown = ['sign', 'exponent', 'fraction', 'all'].indexOf(stage);
    return {
      kind: 'bits',
      id: 'bits',
      label: `float32 bits of ${asked}`,
      bits: [...pattern].map((v, i) => ({ id: `bit${31 - i}`, value: v, mark: i >= range[0] && i < range[1] ? 'key' : null })),
      fields: [
        { id: 'sign', label: 'sign', from: 0, to: 1, tone: 1, sub: shown >= 0 ? subs.sign : undefined },
        { id: 'exponent', label: 'exponent', from: 1, to: 9, tone: 2, sub: shown >= 1 ? subs.exponent : undefined },
        { id: 'fraction', label: 'fraction', from: 9, to: 32, tone: 3, sub: shown >= 2 ? subs.fraction : undefined },
      ],
    };
  };

  const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });
  const askedItem: Readout = { id: 'asked', label: 'asked for', value: asked, mark: 'compare' };
  // A decimal string can't carry the sign of zero, so −0 is spelled out.
  const storedText = kind === 'zero' ? (sign ? '−0' : '0') : finite ? display(exact!) : pretty(String(stored));
  const storedItem: Readout = { id: 'stored', label: 'stored', value: storedText, mark: 'found' };
  const vars = { s: sign, e, f };

  // ── intro
  const how = req.sum
    ? `${pretty(req.sum[0])} + ${pretty(req.sum[1])} is first added in float64 (${pretty(String(req.value))}), then rounded to float32.`
    : finite || req.exact != null ? `It is rounded to the nearest pattern of 32 bits.` : `It has a bit pattern of its own.`;
  yield plotFrame([bitsPart('none'), readouts([askedItem])], {
    line: 0,
    note: `A float32 stores ${asked} in 32 bits: 1 sign bit, 8 exponent bits and 23 fraction bits, like scientific notation in base 2. ${how}`,
    vars,
    checkpoint: askInOrder('What will the sign bit be?', ['0', '1'], String(sign)),
  });

  // ── sign
  const exponentQuestion =
    kind === 'normal'
      ? ask('Which power of two will the exponent bits give?', pow2(power), [pow2(power - 1), pow2(power + 1), pow2(power + 2)])
      : askInOrder('Will the exponent field be all zeros, all ones, or neither?', ['All zeros', 'All ones', 'Neither'], kind === 'infinity' || kind === 'nan' ? 'All ones' : 'All zeros');
  yield plotFrame([bitsPart('sign'), readouts([askedItem])], {
    line: 1,
    note: `Bit 31 is the sign: ${sign} means ${sign ? 'negative' : 'positive'}. The other 31 bits are the same for x and −x, so flipping this one bit negates the number${kind === 'zero' ? ', which is why there is both a 0 and a −0' : ''}.`,
    vars,
    checkpoint: exponentQuestion,
  });

  // ── exponent
  const exponentNote =
    kind === 'normal'
      ? `Bits 30–23 read ${eBits} = ${e}. Subtract the bias 127 to get the power: ${e} − 127 = ${num(power)}, so the number is ${pow2(power)} times something between 1 and 2.`
      : kind === 'subnormal'
        ? `All eight exponent bits are 0: a subnormal number. There is no hidden leading 1 and the power is fixed at 2^−126, so the tiniest values fade out gradually instead of jumping to 0.`
        : kind === 'zero'
          ? `All eight exponent bits are 0, the subnormal range, where the power is fixed at 2^−126 and there is no hidden leading 1.`
          : `All eight exponent bits are 1 (255): this pattern is reserved for special values, not numbers in the usual range.`;
  yield plotFrame([bitsPart('exponent'), readouts([askedItem])], {
    line: 2,
    note: exponentNote,
    vars: { ...vars, power },
    checkpoint: askInOrder('Will the 23 fraction bits all be 0?', ['Yes', 'No'], f === 0 ? 'Yes' : 'No'),
  });

  // ── fraction
  const trimmed = fBits.replace(/0+$/, '') || '0';
  const fractionNote =
    kind === 'normal'
      ? `The 23 fraction bits are the binary digits after the point, with a hidden 1 in front: 1.${trimmed} in binary = ${sig}.`
      : kind === 'subnormal'
        ? `With no hidden 1, the fraction bits give 0.${trimmed} in binary = ${sig}.`
        : kind === 'zero'
          ? `The fraction is 0 too, so this is ${sign ? '−0' : '0'}: zero, with a sign.`
          : kind === 'infinity'
            ? `A zero fraction under an all-ones exponent means ${sign ? '−∞' : '+∞'}.`
            : `A non-zero fraction under an all-ones exponent means NaN, "not a number". The fraction bits can carry a payload, and NaN is never equal to anything, even itself.`;
  yield plotFrame([bitsPart('fraction'), readouts([askedItem])], {
    line: 3,
    note: fractionNote,
    vars: { ...vars, power },
    checkpoint: finite || req.exact != null ? askInOrder(`Is ${asked} stored exactly?`, ['Yes', 'No'], isExact ? 'Yes' : 'No') : undefined,
  });

  // ── value
  const error = Math.abs(stored - req.value);
  let valueNote: string;
  if (kind === 'infinity') {
    valueNote = req.exact != null ? `${asked} is beyond the largest float32 (about 3.4 × 10^38), so it overflows to ${sign ? '−∞' : '∞'}.` : `${asked} is stored as ${sign ? '−∞' : '∞'}, larger in size than every finite float.`;
  } else if (kind === 'nan') {
    valueNote = `NaN is stored as itself. It is what 0/0 or ∞ − ∞ produce, and every comparison with it is false.`;
  } else if (kind === 'zero' && req.exact && req.exact.int !== 0n) {
    valueNote = `${asked} is smaller than half the smallest subnormal (about 1.4 × 10^−45), so it rounds to ${sign ? '−0' : '0'}.`;
  } else if (kind === 'zero') {
    valueNote = `${asked} is stored exactly as ${storedText}. It compares equal to ${sign ? '+0' : '−0'}, but dividing by it gives ${sign ? '−∞' : '+∞'}.`;
  } else {
    const formula = `${sign ? '−' : ''}${sig} × ${kind === 'normal' ? pow2(power) : '2^−126'}`;
    valueNote = isExact
      ? `${formula} = ${storedText} exactly: ${asked} fits in a float32 with nothing left over.`
      : `${formula} = ${storedText}, the float32 nearest to ${asked}. It is off by about ${show(error)}, because the exact value needs more significant bits than ${
          kind === 'subnormal' ? 'a subnormal, with no hidden 1, can hold' : 'a float32’s 24'
        }.`;
  }
  const gapQuestion = finite
    ? askInOrder('Is the gap to the next float bigger than 1, exactly 1, or smaller than 1?', ['Bigger than 1', 'Exactly 1', 'Smaller than 1'], gap > 1 ? 'Bigger than 1' : gap === 1 ? 'Exactly 1' : 'Smaller than 1')
    : undefined;
  yield plotFrame(
    [bitsPart('all'), readouts([askedItem, storedItem, ...(finite ? [{ id: 'error', label: 'error', value: show(error) }] : [])])],
    { line: 4, note: valueNote, vars: { ...vars, power }, checkpoint: gapQuestion },
  );

  // ── the neighbours
  if (finite) {
    const mag = bits & 0x7fffffff;
    const signed = (b: number) => (sign ? -fromBits(b) : fromBits(b));
    const pos = (v: number) => (v - stored) / gap;
    const neighbours: Shape[] = [];
    for (let d = -2; d <= 2; d++) {
      const b = mag + d;
      if (d === 0 || b < 0 || b > MAX_FINITE_BITS) continue;
      neighbours.push({ kind: 'point', id: `n${d}`, at: [pos(signed(b)), 0], size: 'sm' });
    }
    const askedAt = Math.max(-2.5, Math.min(2.5, pos(req.value)));
    const line: PlanePart = {
      kind: 'plane',
      id: 'line',
      label: `Neighbouring float32s, in gaps of ${show(gap)}`,
      x: {
        min: -2.6,
        max: 2.6,
        label: 'towards +∞ →',
        ticks: [-2, -1, 0, 1, 2].map((k) => ({ at: k, label: k === 0 ? 'stored' : `${k > 0 ? '+' : '−'}${Math.abs(k)}` })),
      },
      y: { min: -1, max: 1, ticks: [] },
      equal: false,
      shapes: [
        { kind: 'path', id: 'axis', points: [[-2.6, 0], [2.6, 0]], faint: true },
        ...neighbours,
        { kind: 'point', id: 'stored', at: [0, 0], mark: 'found', size: 'lg', label: 'stored' },
        ...(Number.isFinite(req.value) && !isExact ? [{ kind: 'point', id: 'asked', at: [askedAt, 0], mark: 'compare', size: 'md', label: 'asked' } as Shape] : []),
      ],
      handles: [],
    };
    const top = mag === MAX_FINITE_BITS ? ' One step further up there is no float left: the next pattern is ∞.' : '';
    const halved =
      kind === 'normal' && f === 0 && mag > 0x00800000 ? ' On the side nearer zero the power of two drops by one, so the gap there is half as big.' : '';
    yield plotFrame(
      [line, bitsPart('all'), readouts([askedItem, storedItem, { id: 'gap', label: 'gap', value: show(gap) }])],
      {
        line: 5,
        note: `Float32s near ${storedText} are ${show(gap)} apart: ${kind === 'normal' ? `2^(${num(power)} − 23) = ${pow2(power - 23)}` : 'the subnormal spacing 2^−149'}. Nothing in between can be stored, so ${
          isExact ? `${asked} sits exactly on a float` : `${asked} is rounded to the nearest one`
        }.${halved}${top}`,
        vars: { ...vars, power },
      },
    );
  }

  // ── summary
  const digits = kind === 'normal' ? ' The gap is always about 2^−23 ≈ 1.2 × 10^−7 of the number itself, which is why a float32 keeps about 7 significant decimal digits.' : '';
  yield plotFrame([bitsPart('all'), readouts([askedItem, storedItem])], {
    line: null,
    note: finite
      ? `${asked} → sign ${sign}, exponent ${eBits}, fraction ${trimmed.length > 12 ? `${trimmed.slice(0, 12)}…` : trimmed}: ${isExact ? 'stored exactly' : `stored as ${storedText}`}.${digits}`
      : `${asked} → sign ${sign}, exponent all ones, fraction ${f === 0 ? 'zero' : 'non-zero'}: ${kind === 'nan' ? 'NaN' : sign ? '−∞' : '+∞'}.`,
    vars: { ...vars, power },
  });
}

const example = (id: string, label: string, text: string) => ({ id, label, make: () => ({ text }), sized: false });

export const floatingPoint = defineAlgorithm<FloatInput, PlotState>({
  kind: 'algorithm',
  slug: 'floating-point',
  view: 'plot',
  input: {
    examples: [
      example('tenth', '0.1', '0.1'),
      example('one', '1', '1'),
      example('exact', '−2.5', '-2.5'),
      example('big-int', '2²⁴ + 1', '16777217'),
      example('subnormal', 'Subnormal (1e−40)', '1e-40'),
      example('largest', 'Largest float', String(fromBits(MAX_FINITE_BITS))),
      example('infinity', '∞', 'Infinity'),
      example('nan', 'NaN', 'NaN'),
      example('negative-zero', '−0', '-0'),
      example('sum', '0.1 + 0.2', '0.1 + 0.2'),
    ],
    custom: {
      label: 'A number (decimal, 1e-40, Infinity, NaN) or a sum of two',
      placeholder: 'e.g. 0.1 + 0.2',
      parse: (text) => {
        const r = interpret(text);
        return 'error' in r ? r : { value: { text: r.text } };
      },
      format: ({ text }) => text,
    },
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'A bit, or a neighbouring float' },
    { tone: 1, label: 'Sign' },
    { tone: 2, label: 'Exponent' },
    { tone: 3, label: 'Fraction' },
    { mark: 'key', label: 'Bits being read' },
    { mark: 'found', label: 'The float stored' },
    { mark: 'compare', label: 'The number asked for' },
  ],
  run,
  content: {
    idea: 'A float32 is scientific notation in base 2: a sign, a power of two and 24 significant binary digits (the leading 1 is implied), packed into 32 bits. Most decimals, like 0.1, have no exact binary form, so they are rounded to the nearest float.',
    invariant: 'value = (−1)^s × 1.f × 2^(e − 127) for normal numbers. Neighbouring floats are 2^(e − 150) apart, so the gap grows with the number while the relative precision stays about 7 decimal digits.',
    whenToUse: 'Whenever you compare floats (never with ==), add many small numbers to a large one, pick float32, float16 or bfloat16 for a model, or wonder why 0.1 + 0.2 ≠ 0.3. Subnormals, ±0, ∞ and NaN explain the strange results at the edges.',
    traits: [
      { label: 'About 7 significant digits', good: null },
      { label: 'Most decimals aren’t exact', good: false },
      { label: 'Special values: ±0, ∞, NaN', good: null },
    ],
    experiments: [
      { example: 'tenth', prompt: '0.1 in binary is 0.000110011001100… forever, so the 23 fraction bits cut it off and the stored value is slightly too big.' },
      { example: 'big-int', prompt: 'Above 2²⁴ the gap between floats is 2, so 16 777 217 can’t be stored: it rounds to 16 777 216.' },
      { example: 'subnormal', prompt: 'With the exponent bits all 0 there is no hidden 1: tiny numbers lose precision gradually instead of jumping to zero.' },
      { example: 'sum', prompt: '0.1 + 0.2 is added in float64 first, then rounded. Compare the stored value with the 0.3 you might expect.' },
    ],
  },
});
