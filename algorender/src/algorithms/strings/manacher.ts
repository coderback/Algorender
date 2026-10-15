import { defineAlgorithm } from '@/engine/module';
import { TextTracer, type CellRef } from '@/viz/text/tracer';
import type { TextState } from '@/viz/text/types';
import { COMPARISONS, palindromeInput, quote } from './shared';

const pseudocode = [
  'manacher(s):',
  '  T ← # s[0] # s[1] # … # s[n−1] #',
  '  C ← R ← 0   (rightmost palindrome)',
  '  for i from 0 to |T| − 1:',
  '    p ← 0',
  '    if i < R:',
  '      p ← min(R − i, P[2C − i])',
  '    while T[i − p − 1] = T[i + p + 1]:',
  '      p ← p + 1',
  '    P[i] ← p',
  '    if i + p > R: C ← i;  R ← i + p',
  '  answer: the i with the largest P[i]',
];

const L = { build: 1, init: 2, fresh: 4, inside: 5, mirror: 6, test: 7, grow: 8, write: 9, move: 10, answer: 11 } as const;

const T_ROW = 'T';
const P_ROW = 'P';

const cells = (row: string, from: number, to: number): CellRef[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => [row, from + k] as const);

function* run(s: string) {
  const n = s.length;
  const T = `#${[...s].join('#')}#`;
  const N = T.length;
  const t = new TextTracer({
    columns: N,
    stats: ['comparisons', 'reused'],
    results: { label: 'Longest palindrome', empty: 'none yet' },
  });
  t.addRow(T_ROW, 'T: s with # separators', T, { pointers: true, rangeLabels: true, faint: (ch) => ch === '#' });
  t.addRow(P_ROW, 'P: palindrome radius around each centre', Array<string>(N).fill(''), { kind: 'numbers' });

  /** The part of s covered by the palindrome of radius p around centre i of T. */
  const original = (i: number, p: number) => {
    const start = (i - p) / 2;
    const end = start + p - 1;
    return { start, end, text: s.slice(start, start + p), where: start === end ? `position ${start}` : `positions ${start}–${end}` };
  };

  yield t.frame({
    note: `Manacher's algorithm finds the longest palindrome in ${quote(s)} in linear time. Like the Z-algorithm, it reuses what an earlier match already proved: inside a palindrome, the right side mirrors the left.`,
  });
  yield t.frame({
    line: L.build,
    note: `Put # between and around the letters (|T| = 2·${n} + 1 = ${N}). Now every palindrome, odd or even, has a centre cell, and its radius around that centre equals its length in s.`,
    vars: { n, '|T|': N },
  });

  const P = Array<number>(N).fill(0);
  let C = 0;
  let R = 0;
  let best = -1;
  const rightmost = () => (R > C ? [{ row: T_ROW, from: 2 * C - R, to: R, tone: 'active' as const, label: 'rightmost palindrome' }] : []);
  const around = (i: number, p: number) => ({ key: [[T_ROW, i]] as CellRef[], visited: [...cells(T_ROW, i - p, i - 1), ...cells(T_ROW, i + 1, i + p)] });
  yield t.frame({
    line: L.init,
    note: 'C and R describe the palindrome found so far that reaches furthest right: centred at C, ending at R. Nothing is found yet.',
    vars: { C, R },
  });

  for (let i = 0; i < N; i++) {
    let p = 0;
    if (i < R) {
      const mirror = 2 * C - i;
      const pm = P[mirror];
      const known = Math.min(R - i, pm);
      const options = [...new Set([known, pm, R - i, 0])].slice(0, 4).sort((a, b) => a - b);
      yield t.frame({
        line: L.inside,
        note: `Centre i = ${i} lies inside the palindrome around C = ${C}, which reaches R = ${R}. Mirrored in C, position ${i} becomes 2C − i = ${mirror}, where P[${mirror}] = ${pm}.`,
        marks: { key: [[T_ROW, i]], frontier: [[T_ROW, mirror], [P_ROW, mirror]] },
        ranges: rightmost(),
        pointers: { i: [T_ROW, i], C: [T_ROW, C], mirror: [T_ROW, mirror] },
        vars: { i, C, R, mirror, 'P[mirror]': pm },
        checkpoint: {
          question: `What radius around ${i} is known without comparing?`,
          choices: options.map((v) => `Radius ${v}`),
          answer: options.indexOf(known),
        },
      });
      p = known;
      t.count('reused', p);
      const why =
        pm < R - i
          ? `The mirror's palindrome ends inside the big one, so this one ends at the same place: the next comparison is bound to fail.`
          : pm > R - i
            ? `The mirror's palindrome sticks out past the big one's edge, so this one reaches exactly R and can't grow past it (otherwise the palindrome around C would be longer too).`
            : `It reaches exactly the big palindrome's edge, and nothing is known beyond R, so keep comparing from there.`;
      yield t.frame({
        line: L.mirror,
        note: `p = min(R − i, P[${mirror}]) = min(${R - i}, ${pm}) = ${p}. ${why}`,
        marks: { ...around(i, p), frontier: [[P_ROW, mirror]] },
        ranges: rightmost(),
        pointers: { i: [T_ROW, i], C: [T_ROW, C] },
        vars: { i, C, R, p },
      });
    } else {
      yield t.frame({
        line: L.fresh,
        note: `Centre i = ${i} is ${R > C ? `at or past R = ${R}, the end of the rightmost palindrome,` : 'not inside any palindrome found so far,'} so it has no mirror to borrow from: start from radius p = 0.`,
        marks: { key: [[T_ROW, i]] },
        ranges: rightmost(),
        pointers: { i: [T_ROW, i] },
        vars: { i, C, R, p },
      });
    }

    for (;;) {
      const a = i - p - 1;
      const b = i + p + 1;
      if (a < 0 || b >= N) {
        yield t.frame({
          line: L.test,
          note: `The palindrome already touches the ${a < 0 ? 'start' : 'end'} of T, so it can't grow: radius ${p}.`,
          marks: around(i, p),
          ranges: rightmost(),
          pointers: { i: [T_ROW, i] },
          vars: { i, C, R, p },
        });
        break;
      }
      t.count('comparisons');
      if (T[a] === T[b]) {
        p++;
        yield t.frame({
          line: L.grow,
          note: `T[${a}] = T[${b}] = '${T[a]}': the palindrome grows to radius ${p}.`,
          marks: around(i, p),
          ranges: rightmost(),
          pointers: { i: [T_ROW, i] },
          vars: { i, C, R, p },
        });
        continue;
      }
      yield t.frame({
        line: L.test,
        note: `T[${a}] = '${T[a]}' but T[${b}] = '${T[b]}': stop at radius ${p}.`,
        marks: { ...around(i, p), reject: [[T_ROW, a], [T_ROW, b]] },
        ranges: rightmost(),
        pointers: { i: [T_ROW, i] },
        vars: { i, C, R, p },
      });
      break;
    }

    P[i] = p;
    t.setText(P_ROW, i, String(p));
    const { start, end, text, where } = original(i, p);
    const improves = p > (best < 0 ? -1 : P[best]);
    if (improves) {
      best = i;
      t.setResults(p > 0 ? [`${quote(text)} at ${start}–${end}`] : []);
    }
    const moves = i + p > R;
    yield t.frame({
      line: L.write,
      note:
        p > 0
          ? `P[${i}] = ${p}: ${quote(text)} (${where} of s) is a palindrome centred here.${improves ? ' It is the longest so far.' : ''}`
          : `P[${i}] = 0: no palindrome is centred on this separator.`,
      marks: { ...around(i, p), write: [[P_ROW, i]] },
      ranges: rightmost(),
      pointers: { i: [T_ROW, i] },
      vars: { i, C, R, p },
      ...(p > 0 && {
        checkpoint: {
          question: R > C ? `Does the rightmost palindrome (ending at R = ${R}) change?` : 'Does this become the rightmost palindrome?',
          choices: ['Yes: this one reaches further right', 'No: R already reaches as far'],
          answer: moves ? 0 : 1,
        },
      }),
    });

    if (moves) {
      const oldR = R;
      C = i;
      R = i + p;
      if (p > 0) {
        yield t.frame({
          line: L.move,
          note: `i + P[i] = ${R} passes R = ${oldR}: this palindrome now reaches furthest right, so C = ${C} and R = ${R}. Later centres inside it can borrow from their mirrors.`,
          ranges: rightmost(),
          pointers: { i: [T_ROW, i], C: [T_ROW, C] },
          vars: { i, C, R, p },
        });
      }
    }
  }

  const { start, end, text, where } = original(best, P[best]);
  t.mark('found', ...cells(T_ROW, best - P[best], best + P[best]));
  t.setResults(P[best] > 0 ? [`${quote(text)} at ${start}–${end}`] : [], 'none');
  const { comparisons, reused } = t.stats;
  yield t.frame({
    line: L.answer,
    note: `The largest radius is P[${best}] = ${P[best]}, so the longest palindrome is ${quote(text)}, at ${where} of s. That took ${comparisons} comparisons for ${N} centres: R only ever moves right, so the total work is linear. Mirrors supplied ${reused} more for free.`,
    vars: { comparisons, reused },
  });
}

export const manacher = defineAlgorithm<string, TextState>({
  kind: 'algorithm',
  slug: 'manacher',
  view: 'text',
  input: palindromeInput({ examples: ['nested', 'odd', 'even', 'same', 'distinct'], defaultSize: 11 }),
  pseudocode,
  stats: [COMPARISONS, { key: 'reused', label: 'Radius borrowed from mirrors' }],
  legend: [
    { neutral: 'Not examined' },
    { mark: 'key', label: 'Current centre i' },
    { mark: 'frontier', label: 'Mirror of i' },
    { mark: 'visited', label: 'Inside the palindrome at i' },
    { mark: 'reject', label: 'Mismatch: stops growing' },
    { mark: 'write', label: 'P[i] written' },
    { mark: 'found', label: 'Longest palindrome' },
  ],
  run,
  content: {
    idea: 'Expanding a palindrome around every centre takes O(n²) in the worst case. Manacher’s algorithm notices that inside a palindrome the right half mirrors the left, so a centre on the right can start from its mirror’s radius instead of from zero.',
    invariant: 'C and R describe the palindrome that reaches furthest right so far. For any centre i < R, the letters around i mirror those around 2C − i at least up to R, so P[i] ≥ min(R − i, P[2C − i]).',
    whenToUse: 'Finding the longest palindromic substring, or every palindrome’s radius, in O(n). Simpler expand-around-centre code is fine for short strings; Manacher wins when strings are long or full of repeats.',
    traits: [
      { label: 'O(n) time', good: true },
      { label: 'Radius for every centre, not just the longest', good: true },
      { label: 'O(n) extra space', good: null },
    ],
    experiments: [
      { example: 'same', prompt: 'Every centre is inside a huge palindrome. Watch most radii come from mirrors, so comparisons stay linear instead of quadratic.' },
      { example: 'nested', prompt: 'Palindromes inside palindromes: which centres borrow their whole radius from a mirror?' },
      { example: 'distinct', prompt: 'No letter repeats, so every radius is 0 or 1. Do the # separators ever help here?' },
    ],
  },
});
