// Property tests for counting (B5 of the math and ML path): the counts match
// brute-force enumeration, Pascal's triangle is C(n, k) and its rows add up to
// 2ⁿ, every story's questions are answered by the frame after them, and no
// note gives its own question's answer away.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { cell, expectGoodTrace, expectLegendMatchesMarks, expectShortPseudocode, list, table, traceOf } from '@/viz/grid/testing';
import type { GridState } from '@/viz/grid/types';
import {
  choose,
  chooseByOrders,
  commas,
  counting,
  factorial,
  formatCounting,
  LIMITS,
  orderedPicks,
  parseCounting,
  pascal,
  pascalSlips,
  pickOrder,
  placesAllowed,
  rowSum,
  type CountingInput,
} from './counting';

const trace = (input: CountingInput) => traceOf(counting, input).frames as Frame<GridState>[];
const answer = (f: Frame<GridState>) => f.checkpoint!.choices[f.checkpoint!.answer];
const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

/** Every input the custom text accepts. */
const ALL: CountingInput[] = [
  ...range(...LIMITS.tops).flatMap((tops) =>
    range(...LIMITS.bottoms).flatMap((bottoms) => range(...LIMITS.shoes).map((shoes): CountingInput => ({ story: 'outfits', tops, bottoms, shoes }))),
  ),
  ...range(...LIMITS.runners).flatMap((n) => range(2, n).filter((k) => placesAllowed(n, k)).map((k): CountingInput => ({ story: 'orders', n, k }))),
  ...range(...LIMITS.team).map((n): CountingInput => ({ story: 'pairs', n })),
  ...range(...LIMITS.pascal).map((rows): CountingInput => ({ story: 'pascal', rows })),
];

/** Every ordered pick of k distinct items from n, listed. */
function listOrders(n: number, k: number): number[][] {
  if (k === 0) return [[]];
  return listOrders(n, k - 1).flatMap((o) => range(0, n - 1).filter((x) => !o.includes(x)).map((x) => [...o, x]));
}
/** Every subset of n items with exactly k members, listed by bitmask. */
const subsetsOfSize = (n: number, k: number) => range(0, 2 ** n - 1).filter((m) => m.toString(2).split('').filter((b) => b === '1').length === k).length;

/** Plain numbers in a text: not ordinals (2nd) and not glued to letters. */
const numbersIn = (text: string) => [...text.replace(/,(?=\d{3})/g, '').matchAll(/(?<![\w.])\d+(?![\w.]*[a-z])/gi)].map((m) => Number(m[0]));
const filled = (state: GridState, id = 'main') => {
  const t = table(state, id);
  return t.rows.reduce((s, r) => s + t.cells[r.id].filter((c) => c !== '').length, 0);
};
const listText = (state: GridState) => list(state, 'count').items.map((it) => it.text);

describe('the maths', () => {
  it('ordered picks and factorials match a listing', () => {
    for (let n = 0; n <= 6; n++) {
      expect(factorial(n)).toBe(listOrders(n, n).length);
      for (let k = 0; k <= n; k++) expect(orderedPicks(n, k), `${k} of ${n}`).toBe(listOrders(n, k).length);
    }
    expect(factorial(0)).toBe(1);
    expect(factorial(10)).toBe(3_628_800);
  });

  it('C(n, k) counts subsets, equals ordered picks ÷ k!, and Pascal’s rows add up to 2ⁿ', () => {
    for (let n = 0; n <= 10; n++) {
      for (let k = 0; k <= n; k++) {
        expect(choose(n, k), `C(${n}, ${k})`).toBe(subsetsOfSize(n, k));
        expect(chooseByOrders(n, k)).toBe(choose(n, k));
        expect(choose(n, k)).toBe(choose(n, n - k));
      }
      expect(rowSum(n)).toBe(2 ** n);
      expect(choose(n, n + 1)).toBe(0);
      expect(choose(n, -1)).toBe(0);
    }
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 30 }), (n, k) => {
        expect(choose(n, k)).toBe(choose(n - 1, k - 1) + choose(n - 1, k));
      }),
    );
  });

  it('each slip in a Pascal cell gives a different number from the rule', () => {
    const s = pascalSlips(4, 2);
    expect([choose(4, 2), s.wrongNeighbours, s.leftAndUp, s.product]).toEqual([6, 4, 7, 9]);
    expect(commas(3_628_800)).toBe('3,628,800');
  });
});

describe('counting', () => {
  it('plays every example, keeps its legend, and fits the code panel', () => {
    for (const ex of counting.input.examples) expectGoodTrace(counting, trace(ex.make({ seed: 0, size: 0 }) as CountingInput));
    expectLegendMatchesMarks(counting);
    expectShortPseudocode(counting);
  });

  it('plays every input the text box accepts, and its text round-trips', () => {
    for (const input of ALL) {
      const frames = trace(input);
      expectGoodTrace(counting, frames);
      const text = formatCounting(input);
      expect(parseCounting(text), text).toEqual({ value: input });
      // Every story asks at least three questions, so a Predict challenge on any preset has some to ask.
      expect(frames.filter((f) => f.checkpoint).length, text).toBeGreaterThanOrEqual(input.story === 'orders' && input.k === 2 ? 2 : 3);
    }
    for (const bad of ['outfits 1 × 4 × 2', 'outfits 3 × 7 × 2', 'outfits 3 × 4 × 4', 'orders 1 of 5', 'orders 6 of 5', 'orders 4 of 5', 'orders 2 of 3', 'orders 3 of 8', 'pairs of 4', 'pairs of 8', 'pascal to row 3', 'pascal to row 10', 'choose 5 2'])
      expect(parseCounting(bad), bad).toHaveProperty('error');
    expect(parseCounting('Outfits 3x4x2')).toEqual({ value: { story: 'outfits', tops: 3, bottoms: 4, shoes: 2 } });
  });

  it('never gives a question’s answer away in the note of the frame that asks it', () => {
    const PHRASES: Record<string, string[]> = { 'The diagonal, where the row and the column name the same person': ['diagonal', 'same person', 'one person'] };
    for (const input of ALL) {
      const known = Object.values(input).filter((v): v is number => typeof v === 'number');
      for (const f of trace(input)) {
        if (!f.checkpoint) continue;
        const said = answer(f);
        const where = `${formatCounting(input)}: "${f.checkpoint.question}" (${said}) in "${f.note}"`;
        if (/^[\d,]+$/.test(said)) {
          const value = Number(said.replace(/,/g, ''));
          if (!numbersIn(f.checkpoint.question).includes(value) && !known.includes(value)) expect(numbersIn(f.note), where).not.toContain(value);
        } else if (said.startsWith('C(')) expect(f.note.includes(said), where).toBe(false);
        else {
          expect(PHRASES[said], said).toBeDefined();
          for (const phrase of PHRASES[said]) expect(f.note.includes(phrase), where).toBe(false);
        }
      }
    }
  });

  it('outfits: the next frame shows each answer, and the count is tops × bottoms × shoes', () => {
    for (const input of ALL) {
      if (input.story !== 'outfits') continue;
      const { tops: a, bottoms: b, shoes: c } = input;
      const frames = trace(input);
      frames.forEach((f, i) => {
        if (!f.checkpoint) return;
        const next = frames[i + 1].state;
        const tables = next.parts.filter((p) => p.kind === 'table').map((p) => p.id);
        const total = tables.reduce((s, id) => s + filled(next, id), 0);
        expect(Number(answer(f).replace(/,/g, '')), f.checkpoint.question).toBe(total);
      });
      const last = frames.at(-1)!.state;
      expect(listText(last).at(-1)).toBe(`= ${a * b * c}`);
      // Each outfit is numbered once, 1 to a·b·c.
      const numbers = last.parts.flatMap((p) => (p.kind === 'table' ? p.rows.flatMap((r) => p.cells[r.id].map(Number)) : [])).sort((x, y) => x - y);
      expect(numbers).toEqual(range(1, a * b * c));
      expect(frames.filter((f) => f.checkpoint).map(answer)).toEqual([b, 2 * b, ...(a > 2 ? [a * b] : []), a * b * c].map(String));
    }
  });

  it('orders: each place has one fewer choice, and the count is n × (n − 1) × …', () => {
    for (const input of ALL) {
      if (input.story !== 'orders') continue;
      const { n, k } = input;
      const frames = trace(input);
      const picks = pickOrder(n);
      // Place p's row: the runners already placed are walls, the rest are ticked, and the pick is marked.
      const last = frames.at(-1)!.state;
      const t = table(last);
      expect(t.rows.length).toBe(k === n ? n : n);
      t.rows.forEach((r, p) => {
        const ticks = t.cells[r.id].filter((c) => c === '✓').length;
        expect(ticks).toBe(n - p);
        expect(t.marks[`${r.id}:${picks[p]}`]).toBe('found');
        for (const j of picks.slice(0, p)) expect(t.styles[`${r.id}:${j}`]).toBe('block');
      });
      frames.forEach((f, i) => {
        if (!f.checkpoint) return;
        const next = frames[i + 1];
        const q = f.checkpoint.question;
        const said = answer(f).replace(/,/g, '');
        const m = /take (\d)\w\w place/.exec(q);
        if (m) {
          const p = Number(m[1]) - 1;
          expect(cell(next.state, p, picks[p])).toBe('✓');
          expect(table(next.state).cells[table(next.state).rows[p].id].filter((c) => c === '✓').length).toBe(Number(said));
        } else if (/joins/.test(q)) {
          expect(Number(said)).toBe(factorial(n + 1));
          expect(next.note).toContain(`${n + 1}! = ${commas(factorial(n + 1))}`);
        } else expect(listText(next.state).at(-1), q).toBe(`= ${commas(Number(said))}`);
      });
      expect(answer(frames.find((f) => /In all/.test(f.checkpoint?.question ?? ''))!)).toBe(commas(orderedPicks(n, k)));
      if (k < n) expect(answer(frames.find((f) => /are ranked/.test(f.checkpoint?.question ?? ''))!)).toBe(commas(factorial(n)));
    }
  });

  it('teams: the walls are the diagonal, each team sits twice, and the kept cells are C(n, 2)', () => {
    for (const input of ALL) {
      if (input.story !== 'pairs') continue;
      const { n } = input;
      const frames = trace(input);
      const t1 = table(frames[1].state);
      expect(Object.entries(t1.styles).filter(([, s]) => s === 'block').map(([key]) => key).sort()).toEqual(range(0, n - 1).map((i) => `r${i}:${i}`).sort());
      expect(answer(frames[1])).toBe(String(n * (n - 1)));
      expect(filled(frames[2].state)).toBe(n * (n - 1));
      // Each team's two cells: AB and its mirror BA.
      const t2 = table(frames[2].state);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) expect(t2.cells[`r${i}`][j]).toBe([...t2.cells[`r${j}`][i]].reverse().join(''));
      expect(answer(frames[2])).toBe('2');
      expect(Object.values(table(frames[3].state).marks).filter((m) => m === 'compare').length).toBe(2);
      expect(answer(frames[3])).toBe(String(choose(n, 2)));
      expect(Object.values(table(frames[4].state).marks).filter((m) => m === 'found').length).toBe(choose(n, 2));
      expect(answer(frames[4])).toBe('6');
      expect(frames[5].note).toContain(`= 3! = 6 orders`);
      expect(frames[5].note).toContain(`${choose(n, 3)} teams of three`);
    }
  });

  it('Pascal: every cell is the two above it added, the arrows come from those cells, and rows add up to 2ⁿ', () => {
    for (const input of ALL) {
      if (input.story !== 'pascal') continue;
      const N = input.rows;
      const P = pascal(N);
      const frames = trace(input);
      const last = frames.at(-1)!.state;
      for (let n = 0; n <= N; n++) {
        for (let k = 0; k <= N; k++) expect(cell(last, n, k), `C(${n}, ${k})`).toBe(String(k <= n ? P[n][k] : 0));
        expect(cell(last, n, N + 1)).toBe(String(2 ** n));
      }
      frames.forEach((f, i) => {
        const t = table(f.state);
        // A frame filling C(n, k) draws exactly its two arrows, from (n − 1, k − 1) and (n − 1, k).
        const m = /^C\((\d), (\d)\) = C/.exec(f.note);
        if (m && t.arrows.length > 0) {
          const [n, k] = [Number(m[1]), Number(m[2])];
          expect(t.arrows.map((a) => `${a.from.row}:${a.from.col}>${a.to.row}:${a.to.col}`).sort()).toEqual([`r${n - 1}:${k - 1}>r${n}:${k}`, `r${n - 1}:${k}>r${n}:${k}`].sort());
        }
        if (!f.checkpoint) return;
        const next = frames[i + 1];
        const q = f.checkpoint.question;
        const said = answer(f);
        let w: RegExpExecArray | null;
        if ((w = /^What is C\((\d), (\d)\)\?$/.exec(q))) {
          expect(cell(next.state, Number(w[1]), Number(w[2]))).toBe(said);
          expect(next.note.startsWith(`C(${w[1]}, ${w[2]}) = `)).toBe(true);
        } else if ((w = /^Which two cells does C\((\d), 1\) add\?$/.exec(q))) {
          const n = Number(w[1]);
          expect(said).toBe(`C(${n - 1}, 0) and C(${n - 1}, 1)`);
          expect(table(next.state).arrows.map((a) => a.from).sort((x, y) => x.col - y.col)).toEqual([{ row: `r${n - 1}`, col: 0 }, { row: `r${n - 1}`, col: 1 }]);
        } else if ((w = /^Once row (\d) is finished/.exec(q))) {
          expect(cell(next.state, Number(w[1]), N + 1)).toBe(said);
          expect(cell(f.state, Number(w[1]), N + 1)).toBe('');
        } else {
          expect(q).toMatch(/nothing from nothing/);
          expect(cell(next.state, 0, 0)).toBe(said);
        }
      });
    }
  });
});
