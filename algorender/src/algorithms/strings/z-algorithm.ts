import { defineAlgorithm } from '@/engine/module';
import { TextTracer, type CellRef } from '@/viz/text/tracer';
import type { TextState } from '@/viz/text/types';
import { COMPARISONS, matchInput, quote, type MatchInput } from './shared';

const pseudocode = [
  'zSearch(P, T):',
  '  S ← P + "$" + T;  N ← |S|',
  '  l ← 0;  r ← 0     (Z-box is [l, r))',
  '  for k from 1 to N − 1:',
  '    z ← 0',
  '    if k < r: z ← min(r − k, Z[k − l])',
  '    while k + z < N and',
  '          S[z] = S[k + z]:',
  '      z ← z + 1',
  '    Z[k] ← z',
  '    if k + z > r: l ← k;  r ← k + z',
  '    if z = m: report k − m − 1',
];

const L = { glue: 1, box: 2, fresh: 4, copy: 5, test: 6, grow: 8, write: 9, move: 10, report: 11 } as const;

const S_ROW = 'S';
const PREFIX = 'prefix';
const Z_ROW = 'z';

const cells = (row: string, from: number, to: number): CellRef[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => [row, from + k] as const);

/** Distinct numeric options, ascending, always including the answer. */
function numberChoices(answer: number, others: readonly number[]) {
  const values = [...new Set([answer, ...others])].slice(0, 4).sort((a, b) => a - b);
  return { choices: values.map((v) => `${v} letter${v === 1 ? '' : 's'}`), answer: values.indexOf(answer) };
}

function* run({ text, pattern }: MatchInput) {
  const m = pattern.length;
  const S = `${pattern}$${text}`;
  const N = S.length;
  const t = new TextTracer({
    columns: N,
    stats: ['comparisons', 'reused'],
    results: { label: 'Matches in T at', empty: 'none yet' },
  });
  const faint = (ch: string) => ch === '$';
  /** Pointer to the next letter of the slid prefix, unless it has run off the end of S. */
  const zAt = (k: number, z: number) => (k + z < N ? ([PREFIX, z] as const) : null);
  t.addRow(S_ROW, 'S = P + $ + T', S, { pointers: true, rangeLabels: true, faint });
  t.addRow(PREFIX, 'Start of S, slid to k', `${pattern}$`, { offset: 1, pointers: true, faint });
  t.addRow(Z_ROW, 'Z', ['–', ...Array<string>(N - 1).fill('')], { kind: 'numbers' });

  yield t.frame({
    note: `For each position k of S, Z[k] counts how many letters starting at k agree with the start of S. Wherever Z[k] = ${m}, the length of P, the whole pattern starts there.`,
  });
  yield t.frame({
    line: L.glue,
    note: `Glue P, a separator $ and T into one string S of N = ${N} letters. The $ appears nowhere else, so no Z value can run past the pattern into T: Z ≤ ${m} everywhere after the $.`,
    vars: { m, N },
  });

  let l = 0;
  let r = 0;
  const Z = Array<number>(N).fill(0);
  const found: number[] = [];
  const boxRanges = (k?: number) => [
    ...(r > l ? [{ row: S_ROW, from: l, to: r - 1, tone: 'active' as const, label: 'Z-box' }] : []),
    ...(k != null && k < r ? [{ row: S_ROW, from: 0, to: r - l - 1, tone: 'left' as const }] : []),
  ];
  yield t.frame({
    line: L.box,
    note: 'The Z-box [l, r) will remember the match of S’s start that reaches furthest right, because inside it the letters are already known. It starts empty.',
    vars: { l, r },
  });

  for (let k = 1; k < N; k++) {
    t.setOffset(PREFIX, k);
    let z = 0;
    if (k < r) {
      const mirror = k - l;
      const known = Math.min(r - k, Z[mirror]);
      yield t.frame({
        line: L.copy,
        note: `k = ${k} is inside the Z-box [${l}, ${r}), and the box copies S[0..${r - l - 1}]. So S from k looks like S from k − l = ${mirror}, where Z[${mirror}] = ${Z[mirror]}.`,
        marks: { key: [[Z_ROW, mirror]] },
        ranges: boxRanges(k),
        pointers: { k: [S_ROW, k], 'k−l': [S_ROW, mirror] },
        vars: { k, l, r, 'Z[k−l]': Z[mirror] },
        checkpoint: { question: `How many letters at ${k} are known to match without comparing?`, ...numberChoices(known, [Z[mirror], r - k, 0]) },
      });
      z = known;
      t.count('reused', z);
      yield t.frame({
        line: L.copy,
        note:
          Z[mirror] < r - k
            ? `z = min(r − k, Z[k − l]) = min(${r - k}, ${Z[mirror]}) = ${z}. The match at ${mirror} stopped inside the box, so this one stops at the same place: the next comparison is bound to fail.`
            : `z = min(r − k, Z[k − l]) = min(${r - k}, ${Z[mirror]}) = ${z}: everything up to the box's end is known to match, but nothing is known beyond r, so keep comparing from there.`,
        marks: { visited: [...cells(S_ROW, k, k + z - 1), ...cells(PREFIX, 0, z - 1)], key: [[Z_ROW, mirror]] },
        ranges: boxRanges(k),
        pointers: { k: [S_ROW, k], z: zAt(k, z) },
        vars: { k, l, r, z },
      });
    } else {
      yield t.frame({
        line: L.fresh,
        note: `k = ${k} is ${r > l ? `outside the Z-box [${l}, ${r})` : 'not inside any Z-box yet'}, so nothing is known about it: start from z = 0 and compare.`,
        ranges: boxRanges(),
        pointers: { k: [S_ROW, k], z: zAt(k, 0) },
        vars: { k, l, r, z },
      });
    }

    for (;;) {
      if (k + z >= N) {
        yield t.frame({
          line: L.test,
          note: `Reached the end of S, so stop at z = ${z}.`,
          marks: { visited: [...cells(S_ROW, k, k + z - 1), ...cells(PREFIX, 0, z - 1)] },
          ranges: boxRanges(),
          pointers: { k: [S_ROW, k] },
          vars: { k, l, r, z },
        });
        break;
      }
      const a = S[z];
      const b = S[k + z];
      t.count('comparisons');
      if (a === b) {
        z++;
        yield t.frame({
          line: L.grow,
          note: `S[${z - 1}] = S[${k + z - 1}] = '${a}': z = ${z}.`,
          marks: { visited: [...cells(S_ROW, k, k + z - 1), ...cells(PREFIX, 0, z - 1)] },
          ranges: boxRanges(),
          pointers: { k: [S_ROW, k], z: zAt(k, z) },
          vars: { k, l, r, z },
        });
        continue;
      }
      yield t.frame({
        line: L.test,
        note: `S[${z}] = '${a}' but S[${k + z}] = '${b}': stop at z = ${z}.`,
        marks: {
          visited: [...cells(S_ROW, k, k + z - 1), ...cells(PREFIX, 0, z - 1)],
          reject: [[S_ROW, k + z], [PREFIX, z]],
        },
        ranges: boxRanges(),
        pointers: { k: [S_ROW, k], z: zAt(k, z) },
        vars: { k, l, r, z },
      });
      break;
    }

    Z[k] = z;
    t.setText(Z_ROW, k, String(z));
    // An empty match (z = 0) would only make an empty box, which tells later positions nothing.
    const moves = z > 0 && k + z > r;
    yield t.frame({
      line: L.write,
      note: z > 0 ? `Z[${k}] = ${z}: ${quote(S.slice(k, k + z))} at position ${k} matches the start of S.` : `Z[${k}] = 0: S[${k}] differs from S[0].`,
      marks: { write: [[Z_ROW, k]] },
      ranges: boxRanges(),
      pointers: { k: [S_ROW, k] },
      vars: { k, l, r, z },
      ...(z > 0 && r > 0 && {
        checkpoint: {
          question: `The Z-box is [${l}, ${r}). Does it move to this match?`,
          choices: ['Yes: this match reaches further right', 'No: the box already reaches as far'],
          answer: moves ? 0 : 1,
        },
      }),
    });

    if (moves) {
      const oldR = r;
      l = k;
      r = k + z;
      yield t.frame({
        line: L.move,
        note:
          oldR > 0
            ? `k + z = ${r} passes the old end r = ${oldR}, so the Z-box becomes [${l}, ${r}): the match of S's start that now reaches furthest right.`
            : `This is the first match of S's start, so it becomes the Z-box: [${l}, ${r}).`,
        ranges: boxRanges(),
        pointers: { k: [S_ROW, k] },
        vars: { k, l, r, z },
      });
    }

    if (z === m) {
      const at = k - m - 1;
      found.push(at);
      t.mark('found', ...cells(S_ROW, k, k + m - 1));
      t.addResult(String(at));
      yield t.frame({
        line: L.report,
        note: `Z[${k}] = ${m}, the whole pattern: P starts at S[${k}], which is position ${k} − ${m} − 1 = ${at} of T.`,
        ranges: boxRanges(),
        pointers: { k: [S_ROW, k] },
        vars: { k, l, r, z },
      });
    }
  }

  t.setResults(found.map(String), 'none');
  const { comparisons, reused } = t.stats;
  yield t.frame({
    note: `Done: ${found.length === 0 ? 'no match' : found.length === 1 ? `one match, at ${found[0]}` : `${found.length} matches, at ${found.join(', ')}`}. ${comparisons} letter comparisons for N = ${N} positions (at most 2N: a comparison either fails, once per k, or pushes r right), and ${reused} letters reused from the Z-box instead.`,
    ranges: boxRanges(),
    vars: { comparisons, reused },
  });
}

export const zAlgorithm = defineAlgorithm<MatchInput, TextState>({
  kind: 'algorithm',
  slug: 'z-algorithm',
  view: 'text',
  input: matchInput({ examples: ['overlapping', 'repeated', 'naive', 'none'], textMax: 22, defaultSize: 12 }),
  pseudocode,
  stats: [COMPARISONS, { key: 'reused', label: 'Letters reused from the Z-box' }],
  legend: [
    { neutral: 'Not compared' },
    { mark: 'visited', label: 'Agrees with the start of S' },
    { mark: 'reject', label: 'Mismatch' },
    { mark: 'key', label: 'Z value reused' },
    { mark: 'write', label: 'Z value written' },
    { mark: 'found', label: 'Part of a match' },
  ],
  run,
  content: {
    idea: 'For every position of S = P$T, measure how far the letters from there agree with the start of S; wherever the whole pattern agrees, it is a match. The trick: an earlier match (the Z-box) already tells you about the letters inside it, so most work is copied rather than redone.',
    invariant: 'The Z-box [l, r) is the match of S’s start that reaches furthest right so far: S[l..r − 1] = S[0..r − l − 1]. So for any k inside it, S from k agrees with S from k − l at least up to r.',
    whenToUse: 'Linear-time pattern matching that is easy to get right, and string questions of the form “how much does this suffix share with the start?”: periods, borders, compression. It needs O(n + m) extra space for S and Z.',
    traits: [
      { label: 'O(n + m) time', good: true },
      { label: 'O(n + m) extra space', good: null },
      { label: 'Needs a separator found in neither string', good: null },
    ],
    experiments: [
      { example: 'naive', prompt: 'A long run of one letter: watch the Z-box copy most values, so the comparisons stay below 2N.' },
      { example: 'overlapping', prompt: 'Overlapping matches are simply nearby positions where Z = m.' },
      { example: 'none', prompt: 'No Z value reaches m. Which positions come closest?' },
    ],
  },
});
