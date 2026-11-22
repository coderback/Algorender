// Counting (B5 of the math and ML path, the first concept of stage 3): choices
// made one after another multiply (outfits as the cells of a table), ordered
// picks without repeats and n! (a podium, place by place), choosing without
// order (the table of ordered pairs folded in half: ÷ 2, and ÷ k! in general),
// and Pascal's triangle filled cell by cell from the two cells above, whose
// rows add up to 2ⁿ. Every story is a table on the grid view.

import { defineAlgorithm, type InputSpec } from '@/engine/module';
import type { Checkpoint, Frame } from '@/engine/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

// ───────────────────────────── the maths ─────────────────────────────

/** n! = n × (n − 1) × … × 1, with 0! = 1. */
export function factorial(n: number): number {
  let p = 1;
  for (let i = 2; i <= n; i++) p *= i;
  return p;
}

/** Ordered picks of k from n without repeats: n × (n − 1) × … (k factors). */
export function orderedPicks(n: number, k: number): number {
  if (k > n) return 0;
  let p = 1;
  for (let i = 0; i < k; i++) p *= n - i;
  return p;
}

/** The factors of an ordered pick: [n, n − 1, …] (k of them). */
export const pickFactors = (n: number, k: number) => Array.from({ length: k }, (_, i) => n - i);

/** Pascal's triangle, rows 0 to N, each row n holding C(n, 0) … C(n, n). */
export function pascal(N: number): number[][] {
  const rows: number[][] = [];
  for (let n = 0; n <= N; n++) rows.push(Array.from({ length: n + 1 }, (_, k) => (k === 0 || k === n ? 1 : rows[n - 1][k - 1] + rows[n - 1][k])));
  return rows;
}

/** C(n, k), the ways to choose k of n things when order doesn't matter: 0 when k is outside 0 … n. */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  return pascal(n)[n][k];
}

/** C(n, k) the other way: ordered picks ÷ k!, since every choice of k appears in k! orders. */
export const chooseByOrders = (n: number, k: number) => orderedPicks(n, k) / factorial(k);

export const rowSum = (n: number) => pascal(n)[n].reduce((s, x) => s + x, 0);

/** The usual wrong ways to fill a Pascal cell, each from the learner's own (correct) earlier cells. */
export function pascalSlips(n: number, k: number) {
  const C = (a: number, b: number) => choose(a, b);
  return {
    /** Up and up-right instead of up-left and up. */
    wrongNeighbours: C(n - 1, k) + C(n - 1, k + 1),
    /** Left and up, as in the grid-paths table. */
    leftAndUp: C(n, k - 1) + C(n - 1, k),
    /** The two cells above multiplied instead of added. */
    product: C(n - 1, k - 1) * C(n - 1, k),
  };
}

// ───────────────────────────── inputs ─────────────────────────────

export type CountingInput =
  | { story: 'outfits'; tops: number; bottoms: number; shoes: number }
  | { story: 'orders'; n: number; k: number }
  | { story: 'pairs'; n: number }
  | { story: 'pascal'; rows: number };
export type Story = CountingInput['story'];

export const LIMITS = {
  tops: [2, 6],
  bottoms: [2, 6],
  shoes: [2, 3],
  runners: [3, 7],
  team: [5, 7],
  pascal: [4, 9],
} as const satisfies Record<string, readonly [number, number]>;

export const TOPS = ['red', 'blue', 'green', 'grey', 'white', 'black'];
export const BOTTOMS = ['jeans', 'shorts', 'skirt', 'chinos', 'joggers', 'cords'];
export const SHOES = ['trainers', 'boots', 'sandals'];
export const PEOPLE = ['Ada', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus'];
/** The order the podium story picks its runners in (a fixed, unremarkable order, so every seed runs the same). */
const PICKS = [2, 0, 4, 1, 3, 6, 5];
export const pickOrder = (n: number) => PICKS.filter((i) => i < n);

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
/** "1st and 2nd", "1st, 2nd and 3rd", "1st to 5th"; with a prefix, "who comes 1st, who comes 2nd …". */
const placesText = (k: number, who = '') =>
  k > 3 ? `${who}1st to ${ORDINALS[k - 1]}` : ORDINALS.slice(0, k).map((o) => who + o).join(', ').replace(/, ([^,]*)$/, ' and $1');
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const word = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** 12,345 (commas the same in every runtime, unlike toLocaleString). */
export const commas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Number choices: the answer and the slips (distinct, never the answer), smallest first, so the answer's place varies. */
export function numberChoices(answer: number, slips: readonly number[]): Pick<Checkpoint, 'choices' | 'answer'> {
  const values = [answer, ...slips.filter((s, i) => Number.isInteger(s) && s >= 0 && s !== answer && slips.indexOf(s) === i)];
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  return { choices: sorted.map(commas), answer: sorted.indexOf(answer) };
}

// ───────────────────────────── pseudo-code ─────────────────────────────

const pseudocode = [
  'outfits: one top AND one bottom',
  '  count ← tops × bottoms',
  '  one more choice: × its options',
  'orders: k places from n, no repeats',
  '  count ← n × (n−1) × …  (k factors)',
  '  all n places: n! = n × … × 2 × 1',
  'teams: the order does not matter',
  '  ordered picks: n × (n−1)',
  '  each team twice: ÷ 2  (÷ k! for k)',
  'Pascal: C(n,0) = C(n,n) = 1',
  '  C(n,k) ← C(n−1,k−1) + C(n−1,k)',
  '  row n adds up to 2ⁿ',
];

// ───────────────────────────── story 1: outfits ─────────────────────────────

function* outfits(a: number, b: number, c: number): Generator<Frame<GridState>> {
  const t = new GridTracer([]);
  t.addTable({
    label: 'Outfits: a top (row) with a bottom (column)',
    corner: 'top╲bottom',
    rows: TOPS.slice(0, a).map((label) => ({ label })),
    cols: BOTTOMS.slice(0, b).map((label) => ({ label })),
  });
  t.addList({ id: 'count', label: 'Count', empty: 'Nothing counted yet' });
  const vars = { tops: a, bottoms: b };
  const fillRow = (i: number) => {
    for (let j = 0; j < b; j++) t.set([i, j], i * b + j + 1);
  };
  const rowCells = (i: number): CellRef[] => Array.from({ length: b }, (_, j) => [i, j] as const);

  yield t.frame({
    line: 0,
    note: 'An outfit is one top and one bottom, so every outfit is one cell of this table: the top’s row and the bottom’s column.',
    vars,
    checkpoint: { question: `How many outfits use the ${TOPS[0]} top?`, ...numberChoices(b, [1, a]) },
  });

  fillRow(0);
  yield t.frame({
    line: 1,
    note: `The ${TOPS[0]} top goes with each bottom in turn, one outfit per column, numbered along its row.`,
    marks: { key: rowCells(0) },
    vars: { ...vars, outfits: b },
    checkpoint: { question: `Once the ${TOPS[1]} top’s row is filled too, how many outfits are there in all?`, ...numberChoices(2 * b, [b + 1, b + 2]) },
  });

  fillRow(1);
  const full = (): Frame<GridState> => {
    t.addItem('count', { id: 'tops', text: `${a} tops` });
    t.addItem('count', { id: 'bottoms', text: `× ${b} bottoms` });
    t.addItem('count', { id: 'total', text: `= ${a * b}`, mark: 'key' });
    return t.frame({
      line: 1,
      note: `Each of the ${word(a)} tops has a whole row, one outfit with each of the ${word(b)} bottoms, so ${a} rows of ${b} make ${a} × ${b} = ${a * b} outfits. Adding, ${a} + ${b} = ${a + b}, counts the clothes, not the outfits.`,
      marks: { key: Array.from({ length: a }, (_, i) => rowCells(i)).flat() },
      vars: { ...vars, outfits: a * b },
      checkpoint: {
        question: `Each outfit now also takes one of ${c} pairs of shoes. How many outfits are there now?`,
        ...numberChoices(a * b * c, [a * b + c, a + b + c]),
      },
    });
  };

  if (a === 2) yield full();
  else {
    yield t.frame({
      line: 1,
      note: `The ${TOPS[1]} top makes a second row, one outfit with each bottom: a new top adds a whole row of outfits, not just one.`,
      marks: { key: rowCells(1) },
      vars: { ...vars, outfits: 2 * b },
      checkpoint: { question: 'When every top has its row, how many outfits are there?', ...numberChoices(a * b, [a + b, 2 * b + (a - 2)]) },
    });
    for (let i = 2; i < a; i++) fillRow(i);
    yield full();
  }

  const copies: CellRef[] = [];
  for (let s = 1; s < c; s++) {
    const id = `shoe${s}`;
    t.addTable({
      id,
      label: `The same outfits with ${SHOES[s]}`,
      corner: 'top╲bottom',
      rows: TOPS.slice(0, a).map((label) => ({ label })),
      cols: BOTTOMS.slice(0, b).map((label) => ({ label })),
    });
    for (let i = 0; i < a; i++)
      for (let j = 0; j < b; j++) {
        t.set([id, i, j], s * a * b + i * b + j + 1);
        copies.push([id, i, j]);
      }
  }
  t.mark({ item: 'total', list: 'count' }, null);
  t.removeItem('count', 'total');
  t.addItem('count', { id: 'shoes', text: `× ${c} shoes` });
  t.addItem('count', { id: 'total', text: `= ${a * b * c}`, mark: 'key' });
  const copiesText = c === 2 ? `the copy below, with ${SHOES[1]}, numbers them on from ${a * b + 1}` : `the copies below, with ${SHOES.slice(1, c).join(' and with ')}, number them on from ${a * b + 1}`;
  yield t.frame({
    line: 2,
    note: `Every one of the ${a * b} outfits goes with each pair of shoes: the first table is them with ${SHOES[0]}, and ${copiesText}. That is ${c} tables of ${a * b}: ${a} × ${b} × ${c} = ${a * b * c}.`,
    marks: { key: copies },
    vars: { ...vars, shoes: c, outfits: a * b * c },
  });

  yield t.frame({
    line: 2,
    note: `Choices made one after another multiply: every outfit so far goes with every option of the next choice. Adding is for “or”: a top or a bottom to give away is one of ${a} + ${b} = ${a + b} things.`,
    vars: { ...vars, shoes: c, outfits: a * b * c },
  });
}

// ───────────────────────────── story 2: orders ─────────────────────────────

function* orders(n: number, k: number): Generator<Frame<GridState>> {
  const t = new GridTracer([]);
  const people = PEOPLE.slice(0, n);
  const picks = pickOrder(n);
  t.addTable({
    label: 'Who can take each place (✓ still free)',
    corner: 'place╲runner',
    rows: ORDINALS.slice(0, k).map((label) => ({ label })),
    cols: people.map((label) => ({ label })),
  });
  t.addList({ id: 'count', label: 'Count so far', empty: 'Nothing counted yet' });
  const all = k === n;

  yield t.frame({
    line: 3,
    note: all
      ? `A ranking puts all ${word(n)} runners in order, 1st to last. Each row is a place and each column a runner, and nobody can take two places.`
      : `A podium is an order of the first ${word(k)} places: ${placesText(k, 'who comes ')}. Each row is a place and each column a runner, and nobody can take two places.`,
    vars: { runners: n, places: k },
  });

  /** Fills place p (0-based): every runner not yet placed gets a ✓, and the next pick is marked. */
  const place = (p: number) => {
    for (let j = 0; j < n; j++) {
      if (picks.slice(0, p).includes(j)) t.setStyle([p, j], 'block');
      else t.set([p, j], '✓');
    }
    t.mark([p, picks[p]], 'found');
    t.setRowHeader(p, { label: ORDINALS[p], sub: `${n - p} left` });
    if (p === 0) t.addItem('count', { id: 'f0', text: String(n) });
    else {
      t.removeItem('count', 'total');
      t.addItem('count', { id: `f${p}`, text: `× ${n - p}` });
    }
    t.addItem('count', { id: 'total', text: `= ${commas(orderedPicks(n, p + 1))}` });
  };

  for (let p = 0; p < k; p++) {
    place(p);
    const who = people[picks[p]];
    const placed = picks.slice(0, p).map((i) => people[i]);
    const product = pickFactors(n, p + 1).join(' × ');
    const count = orderedPicks(n, p + 1);
    let note: string;
    if (p === 0) note = `Any of the ${word(n)} runners can come 1st, so the first place has ${n} choices. Say ${who} wins.`;
    else if (p === n - 1) note = `Only ${who} is left, so the last place has no choice at all: ${product} = ${commas(count)}.`;
    else {
      const before = placed.length === 1 ? `${placed[0]} is` : `${placed.slice(0, -1).join(', ')} and ${placed.at(-1)} are`;
      note = `${before} already placed, so ${ORDINALS[p]} place is one of the other ${n - p}; say ${who}. Every way of filling the places before goes with each of them, so the count multiplies: ${product} = ${commas(count)} so far.`;
    }
    let checkpoint: Checkpoint | undefined;
    // The total is asked while it is still a prediction: in a full ranking the last factor is 1,
    // so it is asked one place earlier there (the count before the last place would already be n!).
    const totalAt = all ? k - 3 : k - 2;
    if (p === totalAt) {
      const total = orderedPicks(n, k);
      const sum = pickFactors(n, k).reduce((s, x) => s + x, 0);
      checkpoint = {
        question: all ? `In all, how many ways can the ${word(n)} runners finish?` : `In all, how many different podiums (${placesText(k)}) are there?`,
        ...numberChoices(total, [sum, n * k, n ** k]),
      };
    } else if (p < k - 1) {
      checkpoint = { question: `How many runners can take ${ORDINALS[p + 1]} place?`, ...numberChoices(n - p - 1, [n - p, n]) };
    } else if (p === k - 1 && !all) {
      const sum = (n * (n + 1)) / 2;
      checkpoint = {
        question: `If all ${word(n)} runners are ranked, 1st to ${ORDINALS[n - 1]}, how many orders are there?`,
        ...numberChoices(factorial(n), [sum, orderedPicks(n, k), n ** n]),
      };
    } else if (p === k - 1 && all) {
      checkpoint = { question: `A ${ORDINALS[n]} runner joins the race. How many ways can they all finish now?`, ...numberChoices(factorial(n + 1), [factorial(n) + n + 1, 2 * factorial(n)]) };
    }
    yield t.frame({
      line: 4,
      note,
      // The pick keeps its own mark; the other runners still free are what this place could have been.
      marks: { key: Array.from({ length: n }, (_, j) => [p, j] as const).filter(([, j]) => !picks.slice(0, p + 1).includes(j)) },
      vars: { runners: n, place: ORDINALS[p], choices: n - p },
      ...(checkpoint && { checkpoint }),
    });
  }

  if (!all) {
    // Rank the rest too: the remaining places take the runners left, × (n − k) × … × 1.
    const extra: CellRef[] = [];
    for (let p = k; p < n; p++) {
      t.addRow({ id: `r${p}`, label: ORDINALS[p] });
      place(p);
      for (let j = 0; j < n; j++) if (!picks.slice(0, p + 1).includes(j)) extra.push([p, j]);
    }
    const tail = pickFactors(n - k, n - k).join(' × ');
    yield t.frame({
      line: 5,
      note: `Ranking the rest too, the places after the podium take the runners left: ${commas(orderedPicks(n, k))} × ${tail} = ${commas(factorial(n))} orders of all ${word(n)}. That is ${pickFactors(n, n).join(' × ')}, written ${n}! and read “${word(n)} factorial”.`,
      marks: { key: extra },
      vars: { runners: n, orders: factorial(n) },
      checkpoint: {
        question: `A ${ORDINALS[n]} runner joins. How many orders of all of them are there now?`,
        ...numberChoices(factorial(n + 1), [factorial(n) + n + 1, 2 * factorial(n)]),
      },
    });
    yield t.frame({
      line: 5,
      note: `A new runner multiplies the count by ${n + 1}: 1st place now has ${n + 1} choices, and whoever wins, the other ${word(n)} finish in any of the ${commas(factorial(n))} orders, so ${n + 1}! = ${commas(factorial(n + 1))}. And every podium starts exactly ${factorial(n - k)} of the ${n}! full orders (the ways to rank the rest), so podiums = ${n}! ÷ ${n - k}! = ${commas(orderedPicks(n, k))}.`,
      vars: { runners: n, podiums: orderedPicks(n, k), orders: factorial(n) },
    });
  } else {
    yield t.frame({
      line: 5,
      note: `A new runner multiplies the count by ${n + 1}: 1st place now has ${n + 1} choices, and whoever wins, the other ${word(n)} finish in any of the ${commas(factorial(n))} orders, so ${n + 1}! = ${commas(factorial(n + 1))}. Factorials grow fast: 10! is already ${commas(factorial(10))}.`,
      vars: { runners: n, orders: factorial(n) },
    });
  }
}

// ───────────────────────────── story 3: teams ─────────────────────────────

const initials = (i: number, j: number) => `${PEOPLE[i][0]}${PEOPLE[j][0]}`;

function* pairs(n: number): Generator<Frame<GridState>> {
  const t = new GridTracer([]);
  t.addTable({
    label: 'Ordered picks: the first pick’s row, the second pick’s column',
    corner: '1st╲2nd',
    rows: PEOPLE.slice(0, n).map((label) => ({ label })),
    cols: PEOPLE.slice(0, n).map((label) => ({ label })),
  });
  t.addList({ id: 'count', label: 'Count', empty: 'Nothing counted yet' });
  const off: CellRef[] = [];
  const above: CellRef[] = [];
  const below: CellRef[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (i !== j) {
        off.push([i, j]);
        (i < j ? above : below).push([i, j]);
      }
  const ordered = n * (n - 1);
  const teams = ordered / 2;

  yield t.frame({
    line: 6,
    note: `Pick a first person (a row), then a second (a column): each cell is one ordered pick of ${word(n)} people.`,
    vars: { people: n },
    checkpoint: {
      question: 'Which cells can never be a pick?',
      choices: ['The first row and the first column', 'The diagonal, where the row and the column name the same person', 'None: every cell is a pick'],
      answer: 1,
    },
  });

  for (let i = 0; i < n; i++) t.setStyle([i, i], 'block');
  yield t.frame({
    line: 7,
    note: `Nobody can be picked twice, so the ${n} cells whose row and column are one person are walls.`,
    vars: { people: n, walls: n },
    checkpoint: { question: 'How many ordered picks are left?', ...numberChoices(ordered, [n * n, n + n - 1]) },
  });

  for (const [i, j] of off as [number, number][]) t.set([i, j], initials(i, j));
  t.addItem('count', { id: 'ordered', text: `${n} × ${n - 1} = ${ordered} ordered` });
  yield t.frame({
    line: 7,
    note: `${n} choices for the first pick and ${n - 1} for the second: ${n} × ${n - 1} = ${ordered} ordered picks, one in each open cell. The letters are the two people’s initials, first pick first.`,
    marks: { key: off },
    vars: { people: n, ordered },
    checkpoint: {
      question: `A team of two has no order: ${PEOPLE[0]} with ${PEOPLE[1]} is ${PEOPLE[1]} with ${PEOPLE[0]}. How many cells hold each team?`,
      ...numberChoices(2, [1, n - 1]),
    },
  });

  const ab: CellRef = [0, 1];
  const ba: CellRef = [1, 0];
  yield t.frame({
    line: 8,
    note: `${initials(0, 1)} and ${initials(1, 0)} are one team, seen from either side of the wall. Every team sits in a pair of mirror-image cells, one above the wall and one below.`,
    marks: { compare: [ab, ba] },
    arrows: [{ from: ab, to: ba, mark: 'compare', bend: 0.6 }],
    vars: { people: n, ordered },
    checkpoint: { question: 'So how many teams of two are there?', ...numberChoices(teams, [ordered, (n * (n + 1)) / 2]) },
  });

  for (const ref of below) t.setStyle(ref, 'shade');
  t.addItem('count', { id: 'teams', text: `÷ 2 = ${teams} teams`, mark: 'found' });
  yield t.frame({
    line: 8,
    note: `Keep one copy of each team, the cell above the wall, and drop its mirror below: ${ordered} ÷ 2 = ${teams} teams of two. That is “${n} choose 2”, written C(${n}, 2).`,
    marks: { found: above },
    vars: { people: n, ordered, teams },
    checkpoint: { question: 'Now teams of three. In how many different orders can the same three people be picked?', ...numberChoices(6, [3, 2]) },
  });

  const trios = orderedPicks(n, 3);
  yield t.frame({
    line: 8,
    note: `A team of three can be picked in 3 × 2 × 1 = 3! = 6 orders, so ${pickFactors(n, 3).join(' × ')} = ${trios} ordered picks make ${trios} ÷ 6 = ${trios / 6} teams of three. Every choice of k appears in k! orders: C(n, k) = n × (n−1) × … (k factors) ÷ k!.`,
    marks: { found: above },
    vars: { people: n, teams, trios: trios / 6 },
  });
}

// ───────────────────────────── story 4: Pascal's triangle ─────────────────────────────

const Cn = (n: number, k: number) => `C(${n}, ${k})`;

/** The middle cell of row n a value question asks about: the first middle cell whose slips differ from the answer and each other. */
function valueQuestionAt(n: number): number | null {
  if (n < 3) return null;
  for (const k of [Math.floor(n / 2), Math.ceil(n / 2)]) {
    const s = pascalSlips(n, k);
    const wrong = new Set([s.wrongNeighbours, s.leftAndUp, s.product].filter((x) => x !== choose(n, k)));
    if (wrong.size >= 2) return k;
  }
  return null;
}

/** Rows whose edges frame asks which two cells C(n, 1) adds. */
export const WHICH_ROWS = [2, 5];

function* pascalStory(N: number): Generator<Frame<GridState>> {
  const t = new GridTracer([]);
  const SUM = N + 1;
  t.addTable({
    label: 'C(n, k): the ways to choose k of n things',
    corner: 'n╲k',
    rows: Array.from({ length: N + 1 }, (_, n) => ({ label: String(n) })),
    cols: [...Array.from({ length: N + 1 }, (_, k) => ({ label: String(k) })), { label: 'sum' }],
  });
  const P = pascal(N);
  for (let n = 0; n <= N; n++)
    for (let k = n + 1; k <= N; k++) {
      t.set([n, k], 0);
      t.setStyle([n, k], 'shade');
    }

  // Each question is about the frame that follows it; work out the frames first, then attach.
  type Step = { n: number; k: number | null };
  const steps: Step[] = [];
  for (let n = 0; n <= N; n++) {
    steps.push({ n, k: null });
    for (let k = 1; k < n; k++) steps.push({ n, k });
  }
  // asked.get(i) is the question on step i's frame, about step i + 1. The first one set for a step wins.
  const asked = new Map<number, Checkpoint>();
  const put = (i: number, c: Checkpoint) => {
    if (i >= 0 && i + 1 < steps.length && !asked.has(i)) asked.set(i, c);
  };
  steps.forEach((s, i) => {
    // On a row's edges frame: which two cells will its first inside cell, C(n, 1), add?
    if (s.k === null && WHICH_ROWS.includes(s.n)) {
      const n = s.n;
      put(i, {
        question: `Which two cells does ${Cn(n, 1)} add?`,
        choices: [`${Cn(n - 1, 0)} and ${Cn(n - 1, 1)}`, `${Cn(n - 1, 1)} and ${Cn(n - 1, 2)}`, `${Cn(n, 0)} and ${Cn(n - 1, 1)}`],
        answer: 0,
      });
    }
  });
  steps.forEach((s, i) => {
    if (s.k === null) return;
    // The value of a middle cell, asked one frame before it fills.
    if (s.k === valueQuestionAt(s.n)) {
      const sl = pascalSlips(s.n, s.k);
      put(i - 1, { question: `What is ${Cn(s.n, s.k)}?`, ...numberChoices(P[s.n][s.k], [sl.wrongNeighbours, sl.leftAndUp, sl.product]) });
    }
    // The row's sum, asked one frame before its last cell (which writes the sum).
    if (s.n >= 4 && s.k === s.n - 1) {
      const sum = 2 ** s.n;
      put(i - 1, { question: `Once row ${s.n} is finished, what will it add up to?`, ...numberChoices(sum, [sum - 1, sum / 2 + sum / 4]) });
    }
  });

  yield t.frame({
    line: 9,
    note: 'Row n will list C(n, k) for k from 0 up to n. Right of the diagonal k is more than n, and there is no way to choose more things than you have, so those cells hold 0.',
    vars: { rows: N + 1 },
    checkpoint: { question: 'How many ways are there to choose nothing from nothing, C(0, 0)?', choices: ['0', '1'], answer: 1 },
  });

  let first = true;
  for (let i = 0; i < steps.length; i++) {
    const { n, k } = steps[i];
    const next = asked.get(i);
    if (k === null) {
      t.set([n, 0], 1);
      t.set([n, n], 1);
      const edges: CellRef[] = n === 0 ? [[0, 0]] : [[n, 0], [n, n]];
      let note: string;
      if (n === 0) note = `${Cn(0, 0)} = 1: from nothing there is exactly one choice, to take nothing. The last column adds up each row.`;
      else if (n === 1) note = `From one thing, take none or take it: ${Cn(1, 0)} = ${Cn(1, 1)} = 1.`;
      else note = `${Cn(n, 0)} = ${Cn(n, n)} = 1: one way to take none of the ${n}, and one way to take them all.`;
      if (n <= 1) {
        t.set([n, SUM], 2 ** n);
        note += ` Row ${n} adds up to ${2 ** n}.`;
      }
      yield t.frame({ line: 9, note, marks: { key: edges }, vars: { n }, ...(next && { checkpoint: next }) });
      continue;
    }
    const v = P[n][k];
    const [a, b] = [P[n - 1][k - 1], P[n - 1][k]];
    t.set([n, k], v);
    const from: CellRef[] = [[n - 1, k - 1], [n - 1, k]];
    let note = first
      ? `${Cn(n, k)} = ${Cn(n - 1, k - 1)} + ${Cn(n - 1, k)} = ${a} + ${b} = ${v}: every cell adds the cell above it on the left and the cell straight above. Why: set one of the n things aside. A choice of k either takes it, and picks k − 1 more from the other n − 1 (above left), or leaves it, and picks all k from the other n − 1 (straight above).`
      : `${Cn(n, k)} = ${Cn(n - 1, k - 1)} + ${Cn(n - 1, k)} = ${a} + ${b} = ${v}.`;
    first = false;
    if (k === n - 1) {
      t.set([n, SUM], 2 ** n);
      note += ` Row ${n} is done, and it adds up to ${2 ** n}: twice row ${n - 1}, since every cell of row ${n - 1} is added into two cells below it.`;
    }
    yield t.frame({
      line: 10,
      note,
      marks: { key: [[n, k]], compare: from },
      arrows: from.map((f) => ({ from: f, to: [n, k] as CellRef, mark: 'compare' as const })),
      vars: { n, k, [`${Cn(n, k)}`]: v },
      ...(next && { checkpoint: next }),
    });
  }

  const sums: CellRef[] = Array.from({ length: N + 1 }, (_, n) => [n, SUM] as const);
  yield t.frame({
    line: 11,
    note: `Every row adds up to a power of 2: ${Array.from({ length: N + 1 }, (_, n) => commas(2 ** n)).join(', ')}. Row n counts every group you can take from n things (every subset), sorted by size, and each thing is either in or out: 2 × 2 × … × 2 = 2ⁿ groups.`,
    marks: { found: sums },
    vars: { rows: N + 1, [`2^${N}`]: 2 ** N },
  });
}

function* run(input: CountingInput): Generator<Frame<GridState>> {
  if (input.story === 'outfits') yield* outfits(input.tops, input.bottoms, input.shoes);
  else if (input.story === 'orders') yield* orders(input.n, input.k);
  else if (input.story === 'pairs') yield* pairs(input.n);
  else yield* pascalStory(input.rows);
}

// ───────────────────────────── custom text ─────────────────────────────

const within = (x: number, [lo, hi]: readonly [number, number]) => Number.isInteger(x) && x >= lo && x <= hi;

/**
 * Places for n runners: 2 up to n − 2, or all n. With one runner left over the
 * podiums already are the full orders (× 1! changes nothing), so that story
 * would have nothing to show.
 */
export const placesAllowed = (n: number, k: number) => Number.isInteger(k) && (k === n || (k >= 2 && k <= n - 2));

export function parseCounting(text: string): { value: CountingInput } | { error: string } {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  let m = /^outfits (\d+) ?[×x*] ?(\d+) ?[×x*] ?(\d+)$/.exec(t);
  if (m) {
    const [tops, bottoms, shoes] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!within(tops, LIMITS.tops) || !within(bottoms, LIMITS.bottoms) || !within(shoes, LIMITS.shoes))
      return { error: `Use ${LIMITS.tops[0]}–${LIMITS.tops[1]} tops, ${LIMITS.bottoms[0]}–${LIMITS.bottoms[1]} bottoms and ${LIMITS.shoes[0]}–${LIMITS.shoes[1]} pairs of shoes.` };
    return { value: { story: 'outfits', tops, bottoms, shoes } };
  }
  m = /^orders (\d+) of (\d+)$/.exec(t);
  if (m) {
    const [k, n] = [Number(m[1]), Number(m[2])];
    if (!within(n, LIMITS.runners) || !placesAllowed(n, k))
      return { error: `Use ${LIMITS.runners[0]}–${LIMITS.runners[1]} runners, and from 2 places up to two fewer than the runners, or a place for every runner.` };
    return { value: { story: 'orders', n, k } };
  }
  m = /^pairs of (\d+)$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    if (!within(n, LIMITS.team)) return { error: `Use ${LIMITS.team[0]}–${LIMITS.team[1]} people.` };
    return { value: { story: 'pairs', n } };
  }
  m = /^pascal to row (\d+)$/.exec(t);
  if (m) {
    const rows = Number(m[1]);
    if (!within(rows, LIMITS.pascal)) return { error: `Use a last row from ${LIMITS.pascal[0]} to ${LIMITS.pascal[1]}.` };
    return { value: { story: 'pascal', rows } };
  }
  return { error: 'Try “outfits 3 × 4 × 2”, “orders 3 of 5”, “pairs of 5” or “pascal to row 6”.' };
}

export function formatCounting(input: CountingInput): string {
  if (input.story === 'outfits') return `outfits ${input.tops} × ${input.bottoms} × ${input.shoes}`;
  if (input.story === 'orders') return `orders ${input.k} of ${input.n}`;
  if (input.story === 'pairs') return `pairs of ${input.n}`;
  return `pascal to row ${input.rows}`;
}

const custom: NonNullable<InputSpec<CountingInput>['custom']> = {
  label: 'A story: outfits tops × bottoms × shoes, orders k of n, pairs of n, or pascal to row n',
  placeholder: 'e.g. orders 3 of 6',
  parse: parseCounting,
  format: formatCounting,
};

const example = (id: string, label: string, input: CountingInput) => ({ id, label, make: () => input, sized: false });

export const counting = defineAlgorithm<CountingInput, GridState>({
  kind: 'algorithm',
  slug: 'counting',
  view: 'grid',
  input: {
    examples: [
      example('outfits', 'Outfits: 3 tops × 4 bottoms × 2 shoes', { story: 'outfits', tops: 3, bottoms: 4, shoes: 2 }),
      example('orders', 'A podium: 3 places from 5 runners', { story: 'orders', n: 5, k: 3 }),
      example('factorial', 'Every order of 4 runners: 4!', { story: 'orders', n: 4, k: 4 }),
      example('pairs', 'Teams of two from 5 people', { story: 'pairs', n: 5 }),
      example('pascal', 'Pascal’s triangle to row 6', { story: 'pascal', rows: 6 }),
    ],
    custom,
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'A cell still to fill (solid: not allowed; pale: dropped or 0)' },
    { mark: 'key', label: 'Just filled in' },
    { mark: 'compare', label: 'The cells it reads, or a mirrored pair' },
    { mark: 'found', label: 'The pick made, or what is kept' },
  ],
  run,
  content: {
    idea: 'Count without listing. Choices made one after another multiply (3 soups × 7 mains = 21 dinners); picking k of n in order gives n × (n − 1) × … (k factors), and all n gives n!; ignoring order divides by k!, because each choice of k appears in k! orders. Pascal’s triangle builds every C(n, k) by adding the two numbers above it.',
    invariant: 'Each cell of Pascal’s triangle is C(n, k) = C(n − 1, k − 1) + C(n − 1, k): a choice of k from n either takes one chosen thing or leaves it. The edges are 1, the cells right of the diagonal are 0, and row n adds up to 2ⁿ.',
    whenToUse: 'Before working out a chance as “ways it happens ÷ all the ways”, for counting the leaves of a search tree (2ⁿ subsets, n! orders), and whenever a formula needs C(n, k): binomial chances, pass@k, paths on a grid.',
    traits: [
      { label: 'AND multiplies, OR adds', good: true },
      { label: 'Order matters: n × (n − 1) × …; it doesn’t: ÷ k!', good: true },
      { label: 'n! and 2ⁿ grow faster than any listing can keep up with', good: null },
    ],
    experiments: [
      { example: 'outfits', prompt: 'Predict each count before the table fills: does a new top add one outfit or a whole row? Then try “outfits 5 × 2 × 3” in the input box.' },
      { example: 'orders', prompt: 'Watch the walls appear as runners are placed: each place has one fewer choice than the last. Compare the podiums with the orders of all five.' },
      { example: 'factorial', prompt: 'The last place never has a choice. Guess what one more runner does to the count before you step on.' },
      { example: 'pairs', prompt: 'Find each team’s mirror image across the wall. Why does keeping the cells above it count every team exactly once?' },
      { example: 'pascal', prompt: 'Before each cell fills, say which two cells it adds. Then watch the sum column: what happens to it from one row to the next?' },
    ],
  },
});
