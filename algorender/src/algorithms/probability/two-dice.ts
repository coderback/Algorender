import { defineAlgorithm, type InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Checkpoint, Frame, VarValue } from '@/engine/types';
import { ask, askInOrder } from '@/viz/plot/frame';
import { cellKey, type GridPart, type ListPart, type MeterPart, type TablePart, type GridState } from '@/viz/grid/types';
import type { MarkKey } from '@/viz/marks';

// Chance on a 6×6 board (B5 of the math and ML path). Two dice give 36
// outcomes, each a cell: the first die picks the row, the second the column.
// An event is a set of cells, and because the 36 outcomes are equally likely,
// its probability is its cells over 36. "Not A" is the cells left over; "A or
// B" adds two regions and takes away the overlap counted twice; "A and B" is
// the overlap, which for independent events is a rectangle of rows × columns,
// so its share is P(A) × P(B). Thrown again and again, the share of throws
// that land in an event settles towards its probability.

// ───────────────────────────── the maths ─────────────────────────────

export const FACES = [1, 2, 3, 4, 5, 6] as const;
/** The number of outcomes of two dice: 6 × 6. */
export const TOTAL = 36;

/** One outcome: what the first die shows, then the second. (1, 6) and (6, 1) are different outcomes. */
export type Outcome = readonly [a: number, b: number];
export const OUTCOMES: readonly Outcome[] = FACES.flatMap((a) => FACES.map((b) => [a, b] as const));

/** An event: a yes-or-no question about an outcome, true on the cells it covers. */
export type Test = (a: number, b: number) => boolean;
export type DiceEvent = { name: string; test: Test };

export const sumIs = (s: number): DiceEvent => ({ name: `the sum is ${s}`, test: (a, b) => a + b === s });
export const sumAtLeast = (s: number): DiceEvent => ({ name: `the sum is at least ${s}`, test: (a, b) => a + b >= s });

export type EventId = 'sum7' | 'double' | 'first6' | 'second6' | 'atLeastOne6' | 'noSix' | 'firstEven' | 'secondHigh' | 'sum10up';

/** The events the stories use. */
export const EVENTS: Record<EventId, DiceEvent> = {
  sum7: sumIs(7),
  double: { name: 'a double (both dice the same)', test: (a, b) => a === b },
  first6: { name: 'the first die shows 6', test: (a) => a === 6 },
  second6: { name: 'the second die shows 6', test: (_, b) => b === 6 },
  atLeastOne6: { name: 'at least one die shows 6', test: (a, b) => a === 6 || b === 6 },
  noSix: { name: 'neither die shows 6', test: (a, b) => a !== 6 && b !== 6 },
  firstEven: { name: 'the first die is even', test: (a) => a % 2 === 0 },
  secondHigh: { name: 'the second die shows 5 or 6', test: (_, b) => b >= 5 },
  sum10up: sumAtLeast(10),
};

/** How many of the 36 outcomes the event covers. */
export const count = (test: Test) => OUTCOMES.filter(([a, b]) => test(a, b)).length;
/** P(event) = favourable outcomes / 36, as a number. */
export const prob = (test: Test) => count(test) / TOTAL;
export const both =
  (A: Test, B: Test): Test =>
  (a, b) =>
    A(a, b) && B(a, b);
export const either =
  (A: Test, B: Test): Test =>
  (a, b) =>
    A(a, b) || B(a, b);
export const not =
  (A: Test): Test =>
  (a, b) =>
    !A(a, b);

/** The ordered outcomes with this sum: 6 − |s − 7| from 2 to 12, else 0. */
export const waysToSum = (s: number) => count(sumIs(s).test);
/** The slip of counting (a, b) and (b, a) once: unordered pairs a ≤ b with this sum. */
export const unorderedWays = (s: number) => OUTCOMES.filter(([a, b]) => a <= b && a + b === s).length;

/** Independent, on the board: the cells in both, times 36, equal the cells in A times the cells in B. */
export const independent = (A: Test, B: Test) => count(both(A, B)) * TOTAL === count(A) * count(B);

const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
/** "6/36": a count over the 36 outcomes, unreduced, as the board counts it. */
export const over36 = (k: number) => `${k}/${TOTAL}`;
/** "1/6": a fraction in lowest terms ("0", "1" at the ends). */
export function reduced(k: number, n = TOTAL): string {
  if (k === 0) return '0';
  const g = gcd(k, n);
  return n / g === 1 ? String(k / g) : `${k / g}/${n / g}`;
}
/** 36000 as “36,000”, the same on the server and in every browser. */
export const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** A share to three decimals, as the throws story reads it: 0.167. */
export const share3 = (x: number) => String(Math.round(x * 1000) / 1000);

/** Seeded throws of two fair dice, every one in order. */
export function throwDice(seed: number, n: number): Outcome[] {
  const rng = createRng(seed);
  const face = () => 1 + Math.floor(rng() * 6);
  return Array.from({ length: n }, () => {
    const a = face();
    return [a, face()] as const;
  });
}

/** How many of the first n throws landed on each cell, rows by the first die. */
export function tally(throws: readonly Outcome[], n: number): number[][] {
  const t = FACES.map(() => FACES.map(() => 0));
  for (let k = 0; k < n; k++) t[throws[k][0] - 1][throws[k][1] - 1]++;
  return t;
}
/** How many of the first n throws fall in the event. */
export const hits = (throws: readonly Outcome[], n: number, test: Test) => throws.slice(0, n).filter(([a, b]) => test(a, b)).length;

/** The throws story stops at these totals. */
export const THROW_COUNTS = [36, 360, 3600, 36000] as const;
/** The seed of the throws preset, so the lesson can quote its run. */
export const THROW_SEED = 35;

// ───────────────────────────── input ─────────────────────────────

export type DiceInput = { story: 'event'; sum: number } | { story: 'or' } | { story: 'and' } | { story: 'dependent' } | { story: 'throws'; seed: number };
export type Story = DiceInput['story'];

export const MAX_SEED = 1_000_000_000;

export function parseDice(text: string): { value: DiceInput } | { error: string } {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const sum = /^sum (\d+)$/.exec(t);
  if (sum) {
    const s = Number(sum[1]);
    if (s < 2 || s > 12) return { error: 'Two dice sum to a number from 2 to 12.' };
    return { value: { story: 'event', sum: s } };
  }
  if (t === 'or' || t === 'and' || t === 'dependent') return { value: { story: t } };
  const thrown = /^throws (\d+)$/.exec(t);
  if (thrown) {
    const seed = Number(thrown[1]);
    if (seed > MAX_SEED) return { error: `Use a seed from 0 to ${MAX_SEED}.` };
    return { value: { story: 'throws', seed } };
  }
  return { error: 'Try “sum 7” (any sum from 2 to 12), “or”, “and”, “dependent”, or “throws 42” (42 is the seed).' };
}

export function formatDice(input: DiceInput): string {
  if (input.story === 'event') return `sum ${input.sum}`;
  if (input.story === 'throws') return `throws ${input.seed}`;
  return input.story;
}

const custom: NonNullable<InputSpec<DiceInput>['custom']> = {
  label: 'A story: “sum 7” (2 to 12), “or”, “and”, “dependent”, or “throws” and a seed',
  placeholder: 'e.g. sum 8',
  parse: parseDice,
  format: formatDice,
};

const pseudocode = [
  'outcomes: every pair (a, b), 36 in all',
  'A: the outcomes where A happens',
  'P(A) = (cells in A) / 36',
  'P(not A) = 1 − P(A)',
  'P(A or B) = P(A) + P(B) − P(A and B)',
  'independent: P(A and B) = P(A)·P(B)',
  'throw: a, b ← random faces, tally',
  'share of throws in A → P(A)',
];

// ───────────────────────────── drawing ─────────────────────────────

const ROWS = FACES.map((a) => ({ id: `a${a}`, label: String(a) }));
const COLS = FACES.map((b) => ({ label: String(b) }));

/** The board, its cells written by `text` and painted by tests in order (a later paint wins). */
function board(label: string, text: (a: number, b: number) => string, paint: readonly (readonly [MarkKey, Test])[] = []): TablePart {
  const marks: Record<string, MarkKey> = {};
  for (const [mark, test] of paint) for (const [a, b] of OUTCOMES) if (test(a, b)) marks[cellKey(`a${a}`, b - 1)] = mark;
  return {
    kind: 'table',
    id: 'board',
    label,
    look: 'board',
    corner: 'a╲b',
    rows: ROWS,
    cols: COLS,
    cells: Object.fromEntries(ROWS.map((r, i) => [r.id, FACES.map((b) => text(i + 1, b))])),
    styles: {},
    marks,
    tints: {},
    rowMarks: {},
    colMarks: {},
    arrows: [],
    pieces: [],
    bars: [],
    guides: [],
    box: null,
    checkered: false,
  };
}

const SUMS = (a: number, b: number) => String(a + b);
const PAIRS = (a: number, b: number) => `${a},${b}`;
const BOARD = 'Two dice: the first die a picks the row, the second b the column';

/** A meter of the 36 outcomes split into marked parts (empty parts left out). */
function meter(label: string, parts: readonly { id: string; amount: number; mark: MarkKey | null }[], total = TOTAL, unit = 'outcomes'): MeterPart {
  return {
    kind: 'meter',
    id: 'cells',
    label,
    total,
    unit,
    segments: parts.filter((p) => p.amount > 0).map((p) => ({ ...p, label: String(p.amount) })),
  };
}

const chances = (items: readonly string[], label = 'Chances'): ListPart => ({
  kind: 'list',
  id: 'chances',
  label,
  empty: 'None yet',
  items: items.map((text, k) => ({ id: `c${k}`, text, mark: null })),
});

function frame(parts: readonly GridPart[], o: { note: string; line: number; vars?: Record<string, VarValue>; checkpoint?: Checkpoint; throws?: number }): Frame<GridState> {
  return {
    state: { parts },
    line: o.line,
    note: o.note,
    vars: o.vars ?? {},
    stats: { throws: o.throws ?? 0 },
    ...(o.checkpoint && { checkpoint: o.checkpoint }),
  };
}

/** A count question: the choices sorted by value, so the answer's place gives nothing away. */
const askCount = (question: string, answer: number, wrong: readonly number[]) =>
  ask(
    question,
    String(answer),
    wrong.filter((w) => w >= 0 && w !== answer).map(String),
  )!;

// ───────────────────────────── story 1: one event ─────────────────────────────

function* event(s: number): Generator<Frame<GridState>> {
  const A = sumIs(s).test;
  const k = waysToSum(s);
  const rest = TOTAL - k;
  const pairs = OUTCOMES.filter(([a, b]) => a + b === s).map(([a, b]) => `(${a}, ${b})`);
  const named = `“the sum is ${s}”`;

  yield frame([board(BOARD, PAIRS)], {
    line: 0,
    note: `Two dice, a first and a second, give 6 × 6 = 36 outcomes, one cell each: the cell (a, b) is the first die showing a and the second b. For fair dice that don’t affect each other, every cell is equally likely. Call A the event ${named}.`,
    vars: { outcomes: TOTAL },
    checkpoint: askCount(`How many of the 36 outcomes have a sum of ${s}?`, k, [unorderedWays(s), s - 1, s, 2 * k]),
  });

  yield frame([board(BOARD, SUMS, [['compare', A]])], {
    line: 1,
    note:
      k === 0
        ? `No cell sums to ${s}, so A is empty: it can’t happen.`
        : `The cells where A happens: ${pairs.join(', ')}. ${k > 1 && unorderedWays(s) < k ? `Swapping the dice gives a different cell, so (${pairs[0].slice(1, -1)}) and its mirror both count.` : 'Each one is a separate outcome.'}`,
    vars: { A: `sum is ${s}`, 'cells in A': k },
    checkpoint: ask(`What is P(A), the chance that the sum is ${s}?`, over36(k), ['1/11', `${k}/12`, `${unorderedWays(s)}/21`]),
  });

  yield frame([board(BOARD, SUMS, [['compare', A]]), meter(`A: the sum is ${s}`, [{ id: 'a', amount: k, mark: 'compare' }]), chances([`P(A) = ${over36(k)} = ${reduced(k)}`])], {
    line: 2,
    note: `All 36 cells are equally likely, so the chance of A is the share of the board it covers: P(A) = ${over36(k)}${reduced(k) === over36(k) ? '' : ` = ${reduced(k)}`}. Thrown many times, about ${k === 0 ? 'none' : `${k} throws in every 36`} would land in A.`,
    vars: { 'cells in A': k, 'P(A)': reduced(k) },
    checkpoint: ask(`What is P(not A), the chance that the sum is not ${s}?`, over36(rest), [`${k}/${rest}`, '10/11']),
  });

  yield frame(
    [
      board(BOARD, SUMS, [
        ['reject', not(A)],
        ['compare', A],
      ]),
      meter('Every outcome is in A or not in A', [
        { id: 'a', amount: k, mark: 'compare' },
        { id: 'not-a', amount: rest, mark: 'reject' },
      ]),
      chances([`P(A) = ${over36(k)}`, `P(not A) = ${over36(rest)}`]),
    ],
    {
      line: 3,
      note: `“Not A” is every cell A leaves out: ${rest} of them, so P(not A) = ${over36(rest)}. Each outcome is in exactly one of A and not A, so the two chances add up to 1: P(not A) = 1 − P(A). When a direct count is long, count what is left out instead.`,
      vars: { 'P(A)': reduced(k), 'P(not A)': reduced(rest) },
    },
  );

  const sums = Array.from({ length: 11 }, (_, i) => i + 2);
  yield frame(
    [
      board(BOARD, SUMS, [['compare', A]]),
      chances(
        sums.map((t) => `${t}: ${waysToSum(t)}`),
        'Cells for each sum',
      ),
    ],
    {
      line: 2,
      note: `There are 11 possible sums, from 2 to 12, but they aren’t equally likely: 7 has 6 cells, while 2 and 12 have 1 each, the double 1 and the double 6. Count outcomes that are equally likely, the 36 cells, never the 11 sums.`,
      vars: { sums: 11, outcomes: TOTAL },
    },
  );
}

// ───────────────────────────── story 2: A or B ─────────────────────────────

function* orStory(): Generator<Frame<GridState>> {
  const { first6, second6, atLeastOne6, noSix, sum7, double } = EVENTS;
  const A = first6.test;
  const B = second6.test;
  const union = count(either(A, B));
  const overlap = count(both(A, B));
  const sevens = count(sum7.test);
  const doubles = count(double.test);

  yield frame([board(BOARD, SUMS, [['compare', A]]), chances([`P(A) = ${over36(count(A))}`])], {
    line: 1,
    note: `Let A be “${first6.name}”: the bottom row, ${count(A)} cells, so P(A) = ${over36(count(A))}. Let B be “${second6.name}”, the last column. “A or B” means at least one of them happens.`,
    vars: { A: 'first die 6', B: 'second die 6' },
    checkpoint: askCount('How many cells are in A or B (at least one die shows 6)?', union, [count(A) + count(B), count(A) + count(B) - 2 * overlap, count(A)]),
  });

  yield frame(
    [
      board(BOARD, SUMS, [
        ['compare', A],
        ['frontier', B],
        ['found', both(A, B)],
      ]),
      meter('A or B', [
        { id: 'a', amount: count(A) - overlap, mark: 'compare' },
        { id: 'ab', amount: overlap, mark: 'found' },
        { id: 'b', amount: count(B) - overlap, mark: 'frontier' },
      ]),
      chances([`P(A) = ${over36(count(A))}`, `P(B) = ${over36(count(B))}`, `P(A and B) = ${over36(overlap)}`, `P(A or B) = ${over36(union)}`]),
    ],
    {
      line: 4,
      note: `Adding ${count(A)} + ${count(B)} counts the corner (6, 6) twice, once in the row and once in the column, so take it away once: ${count(A)} + ${count(B)} − ${overlap} = ${union}. P(A or B) = P(A) + P(B) − P(A and B) = ${over36(union)}.`,
      vars: { 'cells in A': count(A), 'cells in B': count(B), 'in both': overlap, 'A or B': union },
      checkpoint: askCount('New events: A is “the sum is 7”, B is “a double”. How many cells are in A or B?', sevens + doubles, [sevens + doubles - 1, 0, sevens]),
    },
  );

  yield frame(
    [
      board(BOARD, SUMS, [
        ['compare', sum7.test],
        ['frontier', double.test],
      ]),
      meter('A or B', [
        { id: 'a', amount: sevens, mark: 'compare' },
        { id: 'b', amount: doubles, mark: 'frontier' },
      ]),
      chances([`P(A) = ${over36(sevens)}`, `P(B) = ${over36(doubles)}`, `P(A and B) = 0`, `P(A or B) = ${over36(sevens + doubles)}`]),
    ],
    {
      line: 4,
      note: `The sevens run along one diagonal and the doubles along the other, and they never meet: a double sums to an even number. Events with no cell in common can’t happen together, so nothing is counted twice and the chances simply add: ${over36(sevens)} + ${over36(doubles)} = ${over36(sevens + doubles)}.`,
      vars: { 'cells in A': sevens, 'cells in B': doubles, 'in both': 0, 'A or B': sevens + doubles },
      checkpoint: askCount('Back to sixes. How many cells show no 6 on either die?', count(noSix.test), [TOTAL - count(first6.test), TOTAL - count(first6.test) - count(second6.test)]),
    },
  );

  const none = count(noSix.test);
  yield frame(
    [
      board(BOARD, SUMS, [
        ['reject', noSix.test],
        ['compare', atLeastOne6.test],
      ]),
      meter('At least one 6, or none', [
        { id: 'a', amount: count(atLeastOne6.test), mark: 'compare' },
        { id: 'not-a', amount: none, mark: 'reject' },
      ]),
      chances([`P(no 6) = ${over36(none)}`, `P(at least one 6) = 1 − ${over36(none)} = ${over36(TOTAL - none)}`]),
    ],
    {
      line: 3,
      note: `With no 6, both dice show 1 to 5, so the first five rows meet the first five columns in a 5 × 5 square of ${none} cells. “At least one 6” is everything else, so P(at least one 6) = 1 − ${over36(none)} = ${over36(TOTAL - none)}: the same answer as adding and taking away the overlap, by counting what is left out.`,
      vars: { 'no 6': none, 'at least one 6': TOTAL - none },
    },
  );
}

// ───────────────────────────── story 3: A and B, independent ─────────────────────────────

function* andStory(): Generator<Frame<GridState>> {
  const { firstEven, secondHigh } = EVENTS;
  const A = firstEven.test;
  const B = secondHigh.test;
  const nA = count(A);
  const nB = count(B);
  const nAB = count(both(A, B));

  yield frame([board(BOARD, SUMS, [['compare', A]]), chances([`P(A) = ${over36(nA)} = 3/6`])], {
    line: 1,
    note: `Let A be “${firstEven.name}”: the rows 2, 4 and 6, so ${nA} cells and P(A) = ${over36(nA)} = 3/6. Let B be “${secondHigh.name}”: the last two columns, P(B) = 2/6. “A and B” means both happen at once.`,
    vars: { A: 'first die even', B: 'second die 5 or 6' },
    checkpoint: askCount('How many cells are in both A and B?', nAB, [nA + nB, nA + nB - nAB, 3 + 2]),
  });

  yield frame(
    [
      board(BOARD, SUMS, [
        ['compare', A],
        ['frontier', B],
        ['found', both(A, B)],
      ]),
      meter('A and B', [{ id: 'ab', amount: nAB, mark: 'found' }]),
      chances([`P(A) = 3/6`, `P(B) = 2/6`, `P(A and B) = ${over36(nAB)}`, `3/6 × 2/6 = ${over36(nAB)}`]),
    ],
    {
      line: 5,
      note: `“A and B” is where A’s 3 rows cross B’s 2 columns: a 3 × 2 rectangle of ${nAB} cells. Every row of A meets every column of B, so P(A and B) = ${over36(nAB)} = 3/6 × 2/6, the product of the two chances.`,
      vars: { 'cells in A': nA, 'cells in B': nB, 'in both': nAB },
      checkpoint: askInOrder('Does knowing the first die is even change the chance that the second die shows 5 or 6?', ['Yes', 'No'], 'No'),
    },
  );

  yield frame(
    [
      board(BOARD, SUMS, [
        ['compare', A],
        ['frontier', B],
        ['found', both(A, B)],
      ]),
      chances(
        FACES.map((a) => `row ${a}: ${FACES.filter((b) => B(a, b)).length} of 6 in B`),
        'B in each row',
      ),
    ],
    {
      line: 5,
      note: `In every row, B takes the same 2 cells of 6, so whatever the first die shows, the second still shows 5 or 6 a third of the time. The dice don’t affect each other: A and B are independent, and that is exactly when multiplying works.`,
      vars: { 'B per row': '2 of 6' },
    },
  );
}

// ───────────────────────────── story 4: not independent ─────────────────────────────

function* dependentStory(): Generator<Frame<GridState>> {
  const { sum10up, first6, sum7, double } = EVENTS;
  const A = sum10up.test;
  const B = first6.test;
  const nAB = count(both(A, B));

  yield frame([board(BOARD, SUMS, [['compare', A]]), chances([`P(A) = ${over36(count(A))}`, `P(B) = ${over36(count(B))}`, `P(A) × P(B) = 1/36`])], {
    line: 1,
    note: `Let A be “${sum10up.name}”: ${count(A)} cells in the bottom-right corner, so P(A) = ${over36(count(A))} = 1/6. Let B be “${first6.name}”, also 1/6. Multiplying gives 1/6 × 1/6 = 1/36, which would mean a single cell in both.`,
    vars: { A: 'sum ≥ 10', B: 'first die 6' },
    checkpoint: askCount('How many cells are really in both A and B?', nAB, [1, count(B), count(A) + count(B) - nAB]),
  });

  yield frame(
    [
      board(BOARD, SUMS, [
        ['compare', A],
        ['frontier', B],
        ['found', both(A, B)],
      ]),
      chances([`P(A and B) = ${over36(nAB)}`, `P(A) × P(B) = 1/36`]),
    ],
    {
      line: 5,
      note: `The bottom row holds (6, 4), (6, 5) and (6, 6): ${nAB} cells, so P(A and B) = ${over36(nAB)}, three times the product. A first die of 6 makes a big sum likelier: in that row ${nAB} of 6 cells are in A, against ${count(A)} of 36 on the whole board. A and B are not independent, so multiplying gives the wrong answer.`,
      vars: { 'in both': nAB, 'product says': 1 },
      checkpoint: askCount('Now A is “the sum is 7” and B is “a double”. How many cells are in both?', count(both(sum7.test, double.test)), [1, count(sum7.test) + count(double.test), count(sum7.test)]),
    },
  );

  const nS = count(both(sum7.test, first6.test));
  yield frame(
    [
      board(BOARD, SUMS, [
        ['compare', sum7.test],
        ['frontier', double.test],
      ]),
      chances(['P(A and B) = 0', 'P(A) × P(B) = 1/36']),
    ],
    {
      line: 5,
      note: `The sevens and the doubles never meet: a double always sums to an even number, so P(A and B) = 0, yet multiplying 1/6 × 1/6 says they should sometimes meet. Events that can’t happen together are not independent: knowing one happened rules the other out.`,
      vars: { 'in both': 0, 'product says': 1 },
      checkpoint: askCount('Last pair: A is “the sum is 7”, B is “the first die shows 6”. How many cells are in both?', nS, [0, 2, count(first6.test)]),
    },
  );

  yield frame(
    [
      board(BOARD, SUMS, [
        ['compare', sum7.test],
        ['frontier', first6.test],
        ['found', both(sum7.test, first6.test)],
      ]),
      chances([`P(A and B) = ${over36(nS)}`, 'P(A) × P(B) = 1/36']),
    ],
    {
      line: 5,
      note: `Just one cell, (6, 1): P(A and B) = 1/36 = 1/6 × 1/6, so these two are independent. Every row has exactly one 7, so whatever the first die shows, a 7 stays 1 chance in 6. Whether two events are independent is a fact you check by counting, not a feeling about whether they sound related.`,
      vars: { 'in both': nS, 'product says': 1 },
    },
  );
}

// ───────────────────────────── story 5: throws ─────────────────────────────

function* throwsStory(seed: number): Generator<Frame<GridState>> {
  const A = EVENTS.sum7.test;
  const last = THROW_COUNTS[THROW_COUNTS.length - 1];
  const thrown = throwDice(seed, last);
  const exact = 1 / 6;
  const at = (n: number) => {
    const k = hits(thrown, n, A);
    return { n, k, share: k / n, t: tally(thrown, n) };
  };
  const [r36, r360, r3600, rAll] = THROW_COUNTS.map(at);
  const view = (r: ReturnType<typeof at>) => [
    board(`Throws on each cell after ${thousands(r.n)}`, (a, b) => String(r.t[a - 1][b - 1]), [['compare', A]]),
    meter('Throws that summed to 7', [{ id: 'a', amount: r.k, mark: 'compare' }], r.n, 'throws'),
    chances([`throws: ${thousands(r.n)}`, `sevens: ${r.k}`, `share: ${share3(r.share)}`, `exact: 1/6 ≈ 0.167`]),
  ];
  const off = (r: ReturnType<typeof at>) => {
    const gap = Math.abs(r.share - exact);
    return gap < 0.0005 ? 'less than 0.001 from 1/6' : `${share3(gap)} from 1/6`;
  };

  yield frame([board('Throws on each cell: none yet', () => '', [['compare', A]]), chances(['P(sum is 7) = 6/36 = 1/6 ≈ 0.167'])], {
    line: 6,
    note: 'Now throw the two dice again and again, and add one to a cell each time its outcome comes up. The marked cells are the sevens: 6 cells of 36, so P(sum is 7) = 1/6, and in the long run one throw in 6 should be a seven.',
    vars: { throws: 0 },
    // Asked about the chance, not this run, so the answer is the same for any seed.
    checkpoint: askInOrder('A seven has chance 1/6. Does that mean exactly 6 of the first 36 throws will sum to 7?', ['Yes', 'No'], 'No'),
  });

  const empty = r36.t.flat().filter((c) => c === 0).length;
  const most = Math.max(...r36.t.flat());
  yield frame(view(r36), {
    line: 6,
    throws: r36.n,
    note: `After 36 throws, ${r36.k} summed to 7: a share of ${share3(r36.share)}, against the exact 0.167. A chance of 1/6 promises no exact count, because chance doesn’t deal the outcomes out evenly: ${empty} of the 36 cells have had no throw at all, while one has had ${most}.`,
    vars: { throws: r36.n, sevens: r36.k, share: share3(r36.share) },
  });

  // 3600 × 1/6, against the slips 3600 × 1/12 (dividing by 6 + 6) and 3600 × 1/11 (eleven equally likely sums).
  const choose = [
    { label: 'About 300', value: 300 },
    { label: 'About 327', value: 327 },
    { label: 'About 600', value: 600 },
  ];
  const nearest = choose.reduce((best, c) => (Math.abs(c.value - r3600.k) < Math.abs(best.value - r3600.k) ? c : best));
  yield frame(view(r360), {
    line: 7,
    throws: r360.n,
    note: `After 360 throws, ${r360.k} sevens: a share of ${share3(r360.share)}, ${off(r360)}. Every cell is equally likely, so the tallies fill in fairly evenly, about 10 a cell: sevens are commoner than a sum of 2 or 12 only because they have 6 cells, not because any one cell is luckier.`,
    vars: { throws: r360.n, sevens: r360.k, share: share3(r360.share) },
    checkpoint: askInOrder(
      'Keep going to 3600 throws. About how many will have summed to 7?',
      choose.map((c) => c.label),
      nearest.label,
    ),
  });

  yield frame(view(r3600), {
    line: 7,
    throws: r3600.n,
    note: `After 3600 throws, ${r3600.k} sevens: a share of ${share3(r3600.share)}, ${off(r3600)}. Expect about 3600 × 1/6 = 600, but seldom exactly 600: what settles down is the share, not the count.`,
    vars: { throws: r3600.n, sevens: r3600.k, share: share3(r3600.share) },
  });

  yield frame(view(rAll), {
    line: 7,
    throws: rAll.n,
    note: `After ${thousands(rAll.n)} throws, ${rAll.k} sevens: a share of ${share3(rAll.share)}, ${off(rAll)}. Over more and more throws, the share closes in on the probability counted on the board. The dice have no memory, so the share settles because the early ups and downs are swamped by many more throws, not because the dice make up for them.`,
    vars: { throws: rAll.n, sevens: rAll.k, share: share3(rAll.share) },
  });
}

function* run(input: DiceInput): Generator<Frame<GridState>> {
  switch (input.story) {
    case 'event':
      return yield* event(input.sum);
    case 'or':
      return yield* orStory();
    case 'and':
      return yield* andStory();
    case 'dependent':
      return yield* dependentStory();
    case 'throws':
      return yield* throwsStory(input.seed);
  }
}

export const twoDice = defineAlgorithm<DiceInput, GridState>({
  kind: 'algorithm',
  slug: 'two-dice',
  view: 'grid',
  input: {
    examples: [
      { id: 'sum-seven', label: 'One event: the sum is 7', make: () => ({ story: 'event', sum: 7 }) },
      { id: 'or', label: 'A or B: at least one 6', make: () => ({ story: 'or' }) },
      { id: 'and', label: 'A and B: rows times columns', make: () => ({ story: 'and' }) },
      { id: 'dependent', label: 'When multiplying fails', make: () => ({ story: 'dependent' }) },
      { id: 'throws', label: 'Throw 36,000 times', make: () => ({ story: 'throws', seed: THROW_SEED }) },
      { id: 'throws-new', label: 'Throw again (new dice)', make: ({ seed }) => ({ story: 'throws', seed }) },
    ],
    custom,
  },
  pseudocode,
  stats: [{ key: 'throws', label: 'Throws' }],
  legend: [
    { neutral: 'An outcome (a, b): first die a, second die b' },
    { mark: 'compare', label: 'In event A' },
    { mark: 'frontier', label: 'In event B' },
    { mark: 'found', label: 'In both A and B' },
    { mark: 'reject', label: 'Not in the event (the rest)' },
  ],
  run,
  content: {
    idea: 'Two dice have 36 equally likely outcomes, one cell each on a 6 × 6 board. An event is a set of cells, and its probability is the share of the board it covers: adding regions gives “or”, overlapping them gives “and”, and thrown many times, the share of throws in an event settles near its probability.',
    invariant:
      'P(A) = (cells in A) / 36, because every cell is equally likely. P(not A) = 1 − P(A); P(A or B) = P(A) + P(B) − P(A and B), since the overlap is counted twice; and A and B are independent exactly when P(A and B) = P(A) × P(B).',
    whenToUse:
      'Whenever outcomes are equally likely (dice, cards, coin flips, random draws): count the favourable ones. Count the complement when that is shorter, take the overlap away when adding, and only multiply chances after checking the events are independent.',
    traits: [
      { label: 'Count equally likely outcomes, not sums', good: true },
      { label: '“Or” adds, minus the overlap', good: true },
      { label: 'Multiply only when independent', good: null },
      { label: 'Simulation only approaches the exact answer', good: null },
    ],
    experiments: [
      { example: 'sum-seven', prompt: 'Before the board fills in, count the outcomes with sum 7 yourself. Then edit the input to “sum 2” or “sum 10” and compare how many cells each sum gets.' },
      { example: 'or', prompt: 'Predict how many cells have at least one 6 before the overlap is taken away, then check it a second way by counting the cells with no 6.' },
      { example: 'and', prompt: 'Look at each row of A in turn: what share of it is B? Compare with B’s share of the whole board.' },
      { example: 'dependent', prompt: 'Before each answer, multiply the two chances and predict whether the count will agree. Which of the three pairs are independent?' },
      { example: 'throws', prompt: 'Watch the share of sevens after 36, 360, 3600 and 36,000 throws: does the count of sevens get closer to a sixth of the throws, or only the share?' },
      { example: 'throws-new', prompt: 'Throw with new dice a few times. Short runs differ a lot from one another; long runs end up close to 1/6 every time.' },
    ],
  },
});
