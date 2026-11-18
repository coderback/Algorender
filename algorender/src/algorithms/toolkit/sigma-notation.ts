import { defineAlgorithm } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt, round } from '@/viz/plot/geometry';
import type { Bar, Handle, ImageBox, ImagePart, PlanePart, PlotPart, PlotState, Readout, Shape } from '@/viz/plot/types';

// Sums and products as loops. Σ from i = 1 to n is a for loop that adds a term
// each time round; the terms stand as bars and the running total climbs beside
// them. Π multiplies instead. The mean is a sum divided by n (drag the data);
// Σxᵢ² is not (Σxᵢ)², which the table of every product xᵢ·xⱼ makes plain; and
// a double sum fills a table row by row.

export type TermId = 'i' | 'square' | 'odd';
export type SigmaInput =
  | { story: 'series'; term: TermId; n: number }
  | { story: 'product'; n: number }
  | { story: 'mean'; xs: number[] }
  | { story: 'square'; xs: number[] }
  | { story: 'double'; rows: number; cols: number };
export type Story = SigmaInput['story'];

/** Bounds for custom input and drags. */
export const LIMITS = { series: [1, 12], product: [1, 8], data: [2, 8], value: [0, 10], rows: [2, 4], cols: [2, 5] } as const;

export const TERMS: Record<TermId, { name: string; f: (i: number) => number; closed: (n: number) => number; closedText: string }> = {
  i: { name: 'i', f: (i) => i, closed: (n) => (n * (n + 1)) / 2, closedText: 'n(n + 1)/2' },
  square: { name: 'i²', f: (i) => i * i, closed: (n) => (n * (n + 1) * (2 * n + 1)) / 6, closedText: 'n(n + 1)(2n + 1)/6' },
  odd: { name: '2i − 1', f: (i) => 2 * i - 1, closed: (n) => n * n, closedText: 'n²' },
};
const TERM_IDS = Object.keys(TERMS) as TermId[];

/** Σ from i = 1 to n of f(i), by the loop the notation stands for. */
export function sigma(n: number, f: (i: number) => number): number {
  let total = 0;
  for (let i = 1; i <= n; i++) total += f(i);
  return total;
}

/** Π from i = 1 to n of f(i). */
export function pi(n: number, f: (i: number) => number): number {
  let prod = 1;
  for (let i = 1; i <= n; i++) prod *= f(i);
  return prod;
}

const pseudocode = [
  'total ← 0',
  'for i ← 1 to n:',
  '    total ← total + term(i)',
  'return total',
  'mean ← total / n',
  'for i ← 1 to n: prod ← prod × i',
  'for i: for j: total ← total + a[i][j]',
];

/** A question with number choices, deduplicated and sorted by value (not as text, which puts 10 before 3). */
function askNumber(question: string, answer: number, wrong: readonly number[]): Checkpoint | undefined {
  const values = [...new Set([answer, ...wrong])].slice(0, 4).sort((a, b) => a - b);
  return values.length < 2 ? undefined : { question, choices: values.map(fmt), answer: values.indexOf(answer) };
}

const readouts = (items: Readout[]): PlotPart => ({ kind: 'readouts', id: 'readouts', label: 'Values', items });
const ticksTo = (n: number) => Array.from({ length: n }, (_, k) => ({ at: k + 1, label: String(k + 1) }));
const bar = (id: string, i: number, y: number, extra: Partial<Bar> = {}): Bar => ({ id, x0: i - 0.35, x1: i + 0.35, y, ...extra });

function chart(id: string, label: string, n: number, yMax: number, shapes: Shape[], yLabel: string, handles: Handle[] = []): PlanePart {
  return { kind: 'plane', id, label, x: { min: 0.4, max: n + 0.6, label: 'i', ticks: ticksTo(n) }, y: { min: 0, max: Math.max(1, yMax) * 1.12, label: yLabel }, equal: false, shapes, handles };
}

// ───────────────────────────── Σ and Π as loops ─────────────────────────────

function* series(term: TermId, n: number): Generator<Frame<PlotState>> {
  const t = TERMS[term];
  const total = sigma(n, t.f);
  const terms: Bar[] = [];
  const running: Bar[] = [];
  const termMax = t.f(n);

  yield plotFrame([chart('terms', `Terms ${t.name}`, n, termMax, [{ kind: 'bars', id: 'terms-bars', bars: [] }], 'term'), chart('total', 'Running total', n, total, [{ kind: 'bars', id: 'total-bars', bars: [] }], 'total'), readouts([{ id: 'total', label: 'total', value: '0' }])], {
    line: 0,
    note: `Σ from i = 1 to ${n} of ${t.name} means: start a total at 0, then for each i from 1 to ${n}, work out ${t.name} and add it on. The Σ is a for loop written in one symbol.`,
    vars: { total: 0 },
    checkpoint: askNumber(`The term is ${t.name}. What is it when i = 1?`, t.f(1), [t.f(2), 0, t.f(1) + 1]),
  });

  let sum = 0;
  for (let i = 1; i <= n; i++) {
    const v = t.f(i);
    sum += v;
    terms.push(bar(`t${i}`, i, v, { label: fmt(v) }));
    running.push(bar(`s${i}`, i, sum));
    const next = i < n ? t.f(i + 1) : null;
    yield plotFrame(
      [
        chart('terms', `Terms ${t.name}`, n, termMax, [{ kind: 'bars', id: 'terms-bars', bars: terms.map((b, k) => ({ ...b, mark: k === i - 1 ? 'key' : null })) }], 'term'),
        chart('total', 'Running total', n, total, [{ kind: 'bars', id: 'total-bars', bars: running.map((b, k) => ({ ...b, mark: k === i - 1 ? 'found' : null, label: k === i - 1 ? fmt(b.y) : undefined })) }], 'total'),
        readouts([
          { id: 'i', label: 'i', value: String(i) },
          { id: 'term', label: t.name, value: fmt(v), mark: 'key' },
          { id: 'total', label: 'total', value: fmt(sum), mark: 'found' },
        ]),
      ],
      {
        line: 2,
        note: `i = ${i}: the term is ${fmt(v)}, so the total goes from ${fmt(sum - v)} to ${fmt(sum)}.${i === n ? ` i has reached ${n}, the number on top of the Σ, so the loop stops.` : ''}`,
        vars: { i, term: v, total: sum },
        checkpoint: next === null ? undefined : askNumber(`What will the total be after i = ${i + 1}?`, sum + next, [sum + v, sum + next + 1, sum + next - 1, next]),
      },
    );
  }

  yield plotFrame(
    [
      chart('terms', `Terms ${t.name}`, n, termMax, [{ kind: 'bars', id: 'terms-bars', bars: terms }], 'term'),
      chart('total', 'Running total', n, total, [{ kind: 'bars', id: 'total-bars', bars: running.map((b, k) => ({ ...b, mark: k === n - 1 ? 'found' : null, label: k === n - 1 ? fmt(b.y) : undefined })) }], 'total'),
      readouts([
        { id: 'total', label: `Σ ${t.name}, i = 1..${n}`, value: fmt(total), mark: 'found' },
        { id: 'closed', label: t.closedText, value: fmt(t.closed(n)) },
      ]),
    ],
    {
      line: 3,
      note: `Σ from i = 1 to ${n} of ${t.name} = ${fmt(total)}. Some sums have a shortcut formula: this one is ${t.closedText} = ${fmt(t.closed(n))}. The loop and the formula agree, but the loop always works.`,
      vars: { total },
    },
  );
}

function* product(n: number): Generator<Frame<PlotState>> {
  const total = pi(n, (i) => i);
  const terms: Bar[] = [];
  const running: Bar[] = [];
  yield plotFrame([chart('terms', 'Factors i', n, n, [{ kind: 'bars', id: 'terms-bars', bars: [] }], 'factor'), chart('total', 'Running product', n, total, [{ kind: 'bars', id: 'total-bars', bars: [] }], 'product'), readouts([{ id: 'prod', label: 'product', value: '1' }])], {
    line: 5,
    note: `Π from i = 1 to ${n} of i is the same loop with × instead of +. It starts at 1, not 0: starting a product at 0 would make everything 0. The result, 1 × 2 × … × ${n}, is written ${n}! (${n} factorial).`,
    vars: { prod: 1 },
    checkpoint: n >= 2 ? ask('What is the running product after i = 2?', '2', ['3', '4', '1']) : undefined,
  });
  let prod = 1;
  for (let i = 1; i <= n; i++) {
    prod *= i;
    terms.push(bar(`t${i}`, i, i, { label: String(i) }));
    running.push(bar(`s${i}`, i, prod));
    yield plotFrame(
      [
        chart('terms', 'Factors i', n, n, [{ kind: 'bars', id: 'terms-bars', bars: terms.map((b, k) => ({ ...b, mark: k === i - 1 ? 'key' : null })) }], 'factor'),
        chart('total', 'Running product', n, total, [{ kind: 'bars', id: 'total-bars', bars: running.map((b, k) => ({ ...b, mark: k === i - 1 ? 'found' : null, label: k === i - 1 ? fmt(b.y) : undefined })) }], 'product'),
        readouts([
          { id: 'i', label: 'i', value: String(i) },
          { id: 'prod', label: 'product', value: fmt(prod), mark: 'found' },
        ]),
      ],
      {
        line: 5,
        note: `i = ${i}: multiply by ${i}, so the product goes from ${fmt(prod / i)} to ${fmt(prod)}.${i === n ? ` That is ${n}! = ${fmt(prod)}. Products grow much faster than sums, which is one reason to take logs: log of a product is a sum.` : ''}`,
        vars: { i, prod },
        checkpoint: i < n && i >= 2 ? ask(`What will the product be after i = ${i + 1}?`, fmt(prod * (i + 1)), [fmt(prod + i + 1), fmt(prod * i), fmt(prod * 2)]) : undefined,
      },
    );
  }
}

// ───────────────────────────── the mean ─────────────────────────────

function* mean(xs: readonly number[]): Generator<Frame<PlotState>> {
  const n = xs.length;
  const handles: Handle[] = xs.map((x, k) => ({ id: `x${k + 1}`, at: [k + 1, x], label: `x${sub(k + 1)}`, mark: 'key', step: 1, min: [k + 1, LIMITS.value[0]], max: [k + 1, LIMITS.value[1]] }));
  const total = sigma(n, (i) => xs[i - 1]);
  const m = total / n;
  const data = (marked: number | null, extra: Shape[] = []): PlanePart =>
    chart(
      'data',
      'The data xᵢ',
      n,
      LIMITS.value[1],
      [{ kind: 'bars', id: 'data-bars', bars: xs.map((x, k) => bar(`x${k + 1}`, k + 1, x, { label: fmt(x), mark: k + 1 === marked ? 'key' : null })) }, ...extra],
      'x',
      handles,
    );

  yield plotFrame([data(null), readouts([{ id: 'n', label: 'n', value: String(n) }, { id: 'total', label: 'total', value: '0' }])], {
    line: 0,
    note: `x̄ ("x bar") is the mean of the data: x̄ = (1/n) Σ xᵢ. Read it inside out: add up every xᵢ, then divide by n = ${n}. Drag the bars to change the data.`,
    vars: { n, total: 0 },
    checkpoint: ask('What will Σ xᵢ, the total of all the bars, come to?', fmt(total), [fmt(total + n), fmt(m), fmt(xs[n - 1] * n)]),
  });

  let sum = 0;
  for (let i = 1; i <= n; i++) sum += xs[i - 1];
  yield plotFrame(
    [
      data(n),
      readouts([
        { id: 'n', label: 'n', value: String(n) },
        { id: 'total', label: 'Σ xᵢ', value: fmt(sum), mark: 'found' },
      ]),
    ],
    {
      line: 2,
      note: `The loop adds x₁ through x${sub(n)}: ${xs.map(fmt).join(' + ')} = ${fmt(sum)}.`,
      vars: { total: sum },
      checkpoint: ask(`So what is x̄ = ${fmt(sum)} / ${n}?`, fmt(m), [fmt(sum), fmt(sum / (n - 1)), fmt(m + 1)]),
    },
  );

  const meanLine: Shape = { kind: 'line', id: 'mean', through: [0, m], dir: [1, 0], mark: 'found', label: `x̄ = ${fmt(m)}` };
  const gaps: Shape[] = xs.map((x, k) => ({ kind: 'path', id: `gap${k + 1}`, points: [[k + 1, x], [k + 1, m]], mark: x >= m ? 'compare' : 'reject', dashed: true }));
  yield plotFrame([data(null, [meanLine]), readouts([{ id: 'mean', label: 'x̄', value: fmt(m), mark: 'found' }])], {
    line: 4,
    note: `x̄ = ${fmt(sum)} / ${n} = ${fmt(m)}. If every bar were cut or filled to the same height, that height would be ${fmt(m)}.`,
    vars: { mean: round(m, 2) },
    checkpoint: askInOrder('Add up how far each bar sits above x̄ (counting below as negative). What do you get?', ['0', `${fmt(m)}`, 'Depends on the data'].filter((c, i, a) => a.indexOf(c) === i), '0'),
  });
  const above = xs.reduce((s, x) => s + Math.max(0, x - m), 0);
  // Negated as text: rounding −x and x separately can disagree in the last digit.
  const below = fmt(above) === '0' ? '0' : `−${fmt(above)}`;
  yield plotFrame([data(null, [meanLine, ...gaps]), readouts([{ id: 'mean', label: 'x̄', value: fmt(m), mark: 'found' }, { id: 'above', label: 'above x̄', value: fmt(above) }, { id: 'below', label: 'below x̄', value: below }])], {
    line: 4,
    note: `The gaps above the mean add to ${fmt(above)} and the gaps below to ${below}: Σ (xᵢ − x̄) = 0 for any data. The mean is the balance point.`,
    vars: { 'Σ(xᵢ − x̄)': 0 },
  });
}

// ───────────────────────────── Σxᵢ² against (Σxᵢ)² ─────────────────────────────

function table(id: string, label: string, rows: number, cols: number, cells: (number | null)[], boxes: ImageBox[], rowNames?: string[]): ImagePart {
  const max = Math.max(1, ...cells.map((v) => Math.abs(v ?? 0)));
  return {
    kind: 'image',
    id,
    label: rowNames ? `${label}: rows ${rowNames.join(', ')}` : label,
    width: cols,
    height: rows,
    pixels: cells.map((v) => (v == null ? 0 : 0.15 + (0.85 * Math.abs(v)) / max)),
    scale: 'signed',
    values: cells.map((v) => (v == null ? '' : fmt(v))),
    boxes,
    size: Math.min(240, 52 * cols),
  };
}

function* squares(xs: readonly number[]): Generator<Frame<PlotState>> {
  const n = xs.length;
  const s = sigma(n, (i) => xs[i - 1]);
  const s2 = sigma(n, (i) => xs[i - 1] ** 2);
  const sq = s * s;
  const answer = s2 === sq ? 'They are equal' : s2 > sq ? 'Σ xᵢ² is bigger' : '(Σ xᵢ)² is bigger';
  const data = chart('data', 'The data xᵢ', n, Math.max(...xs, 1), [{ kind: 'bars', id: 'data-bars', bars: xs.map((x, k) => bar(`x${k + 1}`, k + 1, x, { label: fmt(x) })) }], 'x');
  const products = xs.flatMap((a) => xs.map((b) => a * b));
  const diag = xs.map((_, k): ImageBox => ({ id: `d${k}`, x: k, y: k, w: 1, h: 1, mark: 'found' }));

  yield plotFrame([data, readouts([{ id: 'sum', label: 'Σ xᵢ', value: fmt(s) }])], {
    line: 1,
    note: `Two sums look alike: Σ xᵢ² squares each value and then adds, while (Σ xᵢ)² adds first and squares the total. The brackets say which happens first. Here Σ xᵢ = ${xs.map(fmt).join(' + ')} = ${fmt(s)}.`,
    vars: { 'Σxᵢ': s },
    checkpoint: askInOrder('Which is bigger for this data?', ['Σ xᵢ² is bigger', '(Σ xᵢ)² is bigger', 'They are equal'], answer),
  });
  yield plotFrame(
    [
      data,
      table('table', 'Every product xᵢ·xⱼ, the diagonal marked', n, n, products, diag),
      readouts([
        { id: 's2', label: 'Σ xᵢ² (diagonal)', value: fmt(s2), mark: 'found' },
        { id: 'sq', label: '(Σ xᵢ)² (whole table)', value: fmt(sq) },
      ]),
    ],
    {
      line: 6,
      note: `Multiply (x₁ + … + x${sub(n)}) by itself and every pair xᵢ·xⱼ turns up once: that is the whole table, ${fmt(sq)}. Σ xᵢ² is only its diagonal, ${fmt(s2)}. ${s2 === sq ? 'With at most one non-zero value, the rest of the table is 0, so here they match. With values from 0 to 10, that is the only way they can.' : `The ${fmt(sq - s2)} off the diagonal are the cross terms that (Σ xᵢ)² has and Σ xᵢ² doesn't.`}`,
      vars: { 'Σxᵢ²': s2, '(Σxᵢ)²': sq },
    },
  );
}

// ───────────────────────────── a double sum ─────────────────────────────

function* double(rows: number, cols: number): Generator<Frame<PlotState>> {
  const cells: (number | null)[] = Array(rows * cols).fill(null);
  const total = sigma(rows, (i) => sigma(cols, (j) => i * j));
  const rowNames = Array.from({ length: rows }, (_, i) => `i = ${i + 1}`);
  yield plotFrame([table('table', 'The table of i·j', rows, cols, cells, [], rowNames), readouts([{ id: 'total', label: 'total', value: '0' }])], {
    line: 6,
    note: `A double sum, Σ over i = 1..${rows} of Σ over j = 1..${cols} of i·j, is a loop inside a loop: for each row i, run j across every column, then move to the next row. Each cell gets i·j.`,
    vars: { total: 0 },
    checkpoint: ask('Which cell does the loop fill second?', 'Row 1, column 2', ['Row 2, column 1', 'Row 2, column 2']),
  });
  let sum = 0;
  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= cols; j++) {
      const v = i * j;
      sum += v;
      cells[(i - 1) * cols + (j - 1)] = v;
      const ni = j < cols ? i : i + 1;
      const nj = j < cols ? j + 1 : 1;
      const last = i === rows && j === cols;
      yield plotFrame(
        [
          table('table', 'The table of i·j', rows, cols, [...cells], [{ id: 'now', x: j - 1, y: i - 1, w: 1, h: 1, mark: 'key' }], rowNames),
          readouts([
            { id: 'i', label: 'i', value: String(i) },
            { id: 'j', label: 'j', value: String(j) },
            { id: 'total', label: 'total', value: fmt(sum), mark: 'found' },
          ]),
        ],
        {
          line: 6,
          note: `i = ${i}, j = ${j}: add ${i} × ${j} = ${v}, total ${fmt(sum)}.${j === cols && !last ? ` Row ${i} is done, so i moves on and j starts again at 1.` : ''}`,
          vars: { i, j, total: sum },
          checkpoint: last ? undefined : ask(`What goes in the next cell (i = ${ni}, j = ${nj})?`, String(ni * nj), [String(v + 1), String(ni + nj), String(ni * nj + ni)]),
        },
      );
    }
  }
  const rowsSum = sigma(rows, (i) => i);
  const colsSum = sigma(cols, (j) => j);
  yield plotFrame(
    [
      table('table', 'The table of i·j', rows, cols, [...cells], [], rowNames),
      readouts([
        { id: 'total', label: 'Σᵢ Σⱼ i·j', value: fmt(total), mark: 'found' },
        { id: 'factored', label: `(Σ i)(Σ j) = ${rowsSum} × ${colsSum}`, value: fmt(rowsSum * colsSum) },
      ]),
    ],
    {
      line: 6,
      note: `The whole table adds to ${fmt(total)}. Because each cell is i times j, the double sum also factors: (1 + … + ${rows}) × (1 + … + ${cols}) = ${rowsSum} × ${colsSum} = ${fmt(rowsSum * colsSum)}.`,
      vars: { total },
    },
  );
}

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const sub = (k: number) => String(k).replace(/\d/g, (d) => SUBS[Number(d)]);

function* run(input: SigmaInput): Generator<Frame<PlotState>> {
  if (input.story === 'series') yield* series(input.term, input.n);
  else if (input.story === 'product') yield* product(input.n);
  else if (input.story === 'mean') yield* mean(input.xs);
  else if (input.story === 'square') yield* squares(input.xs);
  else yield* double(input.rows, input.cols);
}

const STORIES: Story[] = ['series', 'product', 'mean', 'square', 'double'];

export function parseSigma(text: string): { value: SigmaInput } | { error: string } {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const story = STORIES.find((s) => s === words[0]);
  if (!story) return { error: 'Start with series, product, mean, square or double.' };
  const xs = numbersIn(text);
  const whole = (v: number, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && v >= lo && v <= hi;
  if (story === 'series') {
    const term = TERM_IDS.find((t) => t === words[1]);
    if (!term) return { error: 'Then a term: i, square or odd, e.g. series square 5.' };
    if (xs.length !== 1 || !whole(xs[0], LIMITS.series)) return { error: `Then n, a whole number from ${LIMITS.series[0]} to ${LIMITS.series[1]}.` };
    return { value: { story, term, n: xs[0] } };
  }
  if (story === 'product') {
    if (xs.length !== 1 || !whole(xs[0], LIMITS.product)) return { error: `Give n, a whole number from ${LIMITS.product[0]} to ${LIMITS.product[1]}, e.g. product 5.` };
    return { value: { story, n: xs[0] } };
  }
  if (story === 'double') {
    if (xs.length !== 2 || !whole(xs[0], LIMITS.rows) || !whole(xs[1], LIMITS.cols)) return { error: `Give rows (${LIMITS.rows.join('–')}) and columns (${LIMITS.cols.join('–')}), e.g. double 3 4.` };
    return { value: { story, rows: xs[0], cols: xs[1] } };
  }
  if (xs.length < LIMITS.data[0] || xs.length > LIMITS.data[1] || !xs.every((v) => whole(v, LIMITS.value))) {
    return { error: `Give ${LIMITS.data[0]} to ${LIMITS.data[1]} whole numbers from ${LIMITS.value[0]} to ${LIMITS.value[1]}, e.g. ${story} 2 4 9 5.` };
  }
  return { value: { story, xs } };
}

function format(input: SigmaInput): string {
  if (input.story === 'series') return `series ${input.term} ${input.n}`;
  if (input.story === 'product') return `product ${input.n}`;
  if (input.story === 'double') return `double ${input.rows} ${input.cols}`;
  return `${input.story} ${input.xs.join(' ')}`;
}

const example = (id: string, label: string, input: SigmaInput) => ({ id, label, make: () => input, sized: false });

export const sigmaNotation = defineAlgorithm<SigmaInput, PlotState>({
  kind: 'algorithm',
  slug: 'sigma-notation',
  view: 'plot',
  input: {
    examples: [
      example('count', 'Σ i, i = 1..10', { story: 'series', term: 'i', n: 10 }),
      example('squares', 'Σ i², i = 1..5', { story: 'series', term: 'square', n: 5 }),
      example('odd', 'Σ (2i − 1), i = 1..6', { story: 'series', term: 'odd', n: 6 }),
      example('factorial', 'Π i, i = 1..6 (6!)', { story: 'product', n: 6 }),
      example('mean', 'The mean x̄', { story: 'mean', xs: [2, 4, 9, 5] }),
      example('square', 'Σ xᵢ² against (Σ xᵢ)²', { story: 'square', xs: [1, 2, 3] }),
      example('double', 'A double sum', { story: 'double', rows: 3, cols: 4 }),
    ],
    custom: {
      label: 'A story: series (i, square, odd) n, product n, mean or square with data, double rows cols',
      placeholder: 'e.g. mean 2 4 9 5',
      parse: parseSigma,
      format,
    },
    drag: (input, handle, to) => {
      if (input.story !== 'mean') return input;
      const k = Number(handle.slice(1)) - 1;
      const xs = [...input.xs];
      xs[k] = Math.round(Math.min(LIMITS.value[1], Math.max(LIMITS.value[0], to[1])));
      return { ...input, xs };
    },
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Terms and totals' },
    { mark: 'key', label: 'The term being added now' },
    { mark: 'found', label: 'The running total, the mean, or the diagonal' },
    { mark: 'compare', label: 'A value above the mean' },
    { mark: 'reject', label: 'A value below the mean' },
  ],
  run,
  content: {
    idea: 'Σ (sigma) is a loop that adds: Σ from i = 1 to n of a term means start at 0 and add the term for each i in turn. Π (pi) is the same loop with × and a start of 1. Subscripts name the items (xᵢ is item i), a bar is a mean (x̄), and a hat is a prediction (ŷ). Read the symbols aloud, inside out, and they turn into code.',
    invariant: 'The loop and the notation are the same thing: the total after step i is the sum of the first i terms. Brackets decide the order, so Σ xᵢ² (square, then add) is not (Σ xᵢ)² (add, then square), and the deviations from the mean always sum to 0.',
    whenToUse: 'Every formula in statistics and machine learning: the mean, the variance, a dot product, a loss averaged over the data, a probability of many independent events (a Π, or a Σ of logs). When a formula looks dense, write it as the loop it stands for.',
    traits: [
      { label: 'Σ is a for loop that adds', good: null },
      { label: 'Π starts at 1', good: null },
      { label: 'Σ xᵢ² ≠ (Σ xᵢ)²', good: false },
    ],
    experiments: [
      { example: 'odd', prompt: 'Add up the odd numbers 1 + 3 + 5 + …: every total is a perfect square. Predict the total after 6 terms.' },
      { example: 'mean', prompt: 'Drag one bar up by 4: the mean moves by 4 ÷ n, and the gaps above and below still balance.' },
      { example: 'square', prompt: 'Try square 5 0 0: when no value is negative, the two sums agree only if at most one value is non-zero.' },
      { example: 'double', prompt: 'Predict the next cell before each step: the loop fills a row, then starts the next one at j = 1.' },
    ],
  },
});
