import { defineStructure, type Args, type ArgSpec, type OperationSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { BloomTracer } from '@/viz/hash/tracer';
import type { HashState } from '@/viz/hash/types';
import { listText, plural, polyHash } from './shared';

/**
 * A Bloom filter: m bits and k hash functions. `added` is the true set, which a
 * real filter doesn't keep; the demo keeps it only to label false positives
 * honestly. `negatives` counts tests of items never added, `falsePositives`
 * how many of those wrongly came back "probably present".
 */
export type BloomModel = { bits: readonly (0 | 1)[]; added: readonly string[]; negatives: number; falsePositives: number };

export const BLOOM_BITS = 16;
/** One base per hash function: hᵢ is the same polynomial string hash with a different base. */
export const BLOOM_BASES = [31, 37, 41] as const;
export const BLOOM_K = BLOOM_BASES.length;
export const ITEM_MAX_LENGTH = 6;

const SUB = ['₁', '₂', '₃', '₄', '₅'];
export const DEFINITELY_NOT = 'Definitely not present';
export const PROBABLY = 'Probably present';

/** The bit positions an item maps to, one per hash function (two functions may pick the same bit). */
export const positionsOf = (item: string) => BLOOM_BASES.map((b) => polyHash(item, b) % BLOOM_BITS);

/** Expected false-positive rate after n distinct items: (1 − e^(−kn/m))^k. */
export const expectedFpRate = (n: number) => (1 - Math.exp((-BLOOM_K * n) / BLOOM_BITS)) ** BLOOM_K;

const STATS = ['hashes', 'checked', 'set'];
type Gen = Generator<Frame<HashState>, BloomModel>;

const tracerFor = (m: BloomModel) => new BloomTracer(BLOOM_K, { ...m, stats: STATS });

const calcLines = (item: string) =>
  BLOOM_BASES.map((b, i) => `h${SUB[i]}("${item}") = ${polyHash(item, b)} mod ${BLOOM_BITS} = ${polyHash(item, b) % BLOOM_BITS}`);

const distinct = (ps: readonly number[]) => [...new Set(ps)];

const positionsNote = (ps: readonly number[]) => {
  const unique = distinct(ps);
  return unique.length < ps.length
    ? `The ${BLOOM_K} hash functions give positions ${listText(ps)}: two of them agree, so only ${plural(unique.length, 'distinct bit')}.`
    : `The ${BLOOM_K} hash functions give positions ${listText(ps)}.`;
};

/** Items are trimmed and 1–6 characters: the item argument's own limits enforce it, so a bad one can only come from a direct call, which changes nothing. */
const itemOf = (args: Args) => String(args.item ?? '').trim();
const badItem = (item: string) => !item || item.length > ITEM_MAX_LENGTH;
const ITEM_ARG: ArgSpec = { name: 'item', label: 'Item', type: 'text', maxLength: ITEM_MAX_LENGTH, placeholder: 'item, e.g. cat' };

const addCode = ['add(x):', '  P ← { hᵢ(x) mod m : i = 1 … k }', '  for each p in P:', '    bits[p] ← 1'];

function* add(m: BloomModel, args: Args): Gen {
  const item = itemOf(args);
  if (badItem(item)) return m;
  const t = tracerFor(m);
  const ps = positionsOf(item);
  t.setItem(item);
  yield t.frame({
    line: 0,
    note: `Add "${item}". A Bloom filter stores no items at all, only bits: "${item}" will switch on the bits its ${BLOOM_K} hash functions choose.`,
    vars: { x: item },
  });
  t.setCalc(calcLines(item));
  t.count('hashes', BLOOM_K);
  yield t.frame({
    line: 1,
    note: `${positionsNote(ps)} Each hash function is the same polynomial string hash with a different base (${BLOOM_BASES.join(', ')}).`,
    marks: { compare: ps },
    vars: { x: item, P: ps.join(', ') },
  });
  const set: number[] = [];
  for (const p of distinct(ps)) {
    const was = t.bit(p);
    t.setBit(p);
    if (was === 0) t.count('set');
    set.push(p);
    yield t.frame({
      line: 3,
      note:
        was === 0
          ? `bits[${p}] ← 1.`
          : `bits[${p}] is already 1, set by an earlier item. Items share bits, and that sharing is where false positives come from.`,
      marks: { write: [p], compare: distinct(ps).filter((q) => !set.includes(q)) },
      vars: { x: item, p },
    });
  }
  const again = m.added.includes(item);
  t.addToSet(item);
  yield t.frame({
    note: again
      ? `"${item}" had been added before, so nothing changed. The filter can't tell: it never stores items.`
      : `"${item}" is now recorded only as bits ${listText(distinct(ps))}. The filter can't list its items, and can't remove one: clearing a bit could erase other items too.`,
    marks: { found: distinct(ps) },
    vars: { x: item, n: again ? m.added.length : m.added.length + 1 },
  });
  return { ...m, bits: m.bits.map((b, i) => (ps.includes(i) ? 1 : b)), added: again ? m.added : [...m.added, item] };
}

const testCode = [
  'test(x):',
  '  P ← { hᵢ(x) mod m : i = 1 … k }',
  '  for each p in P:',
  '    if bits[p] = 0:',
  '      return "definitely not"',
  '  return "probably present"',
];

function* test(m: BloomModel, args: Args): Gen {
  const item = itemOf(args);
  if (badItem(item)) return m;
  const t = tracerFor(m);
  const ps = positionsOf(item);
  const ds = distinct(ps);
  const allSet = ds.every((p) => m.bits[p] === 1);
  const reallyAdded = m.added.includes(item);
  t.setItem(item);
  yield t.frame({ line: 0, note: `Test "${item}": look at the same bits add would have set.`, vars: { x: item } });
  t.setCalc(calcLines(item));
  t.count('hashes', BLOOM_K);
  yield t.frame({
    line: 1,
    note: `${positionsNote(ps)} Look at those bits.`,
    marks: { compare: ds },
    vars: { x: item, P: ps.join(', ') },
    checkpoint: { question: `What will test("${item}") answer?`, choices: [DEFINITELY_NOT, PROBABLY], answer: allSet ? 1 : 0 },
  });

  const ones: number[] = [];
  for (const p of ds) {
    t.count('checked');
    const rest = ds.filter((q) => q !== p && !ones.includes(q));
    if (m.bits[p] === 0) {
      t.setVerdict({ text: DEFINITELY_NOT, mark: 'reject' });
      t.recordNegative(false);
      yield t.frame({
        line: 4,
        note: `bits[${p}] = 0. Had "${item}" been added, this bit would be 1, so "${item}" is definitely not in the set: no false negatives, ever. The remaining bits needn't be checked.`,
        marks: { reject: [p], found: ones },
        vars: { x: item, p, result: 'definitely not' },
      });
      return { ...m, negatives: m.negatives + 1 };
    }
    ones.push(p);
    yield t.frame({
      line: 3,
      note: `bits[${p}] = 1, as it would be if "${item}" had been added. Keep checking.`,
      marks: { found: ones, compare: rest },
      vars: { x: item, p },
    });
  }

  t.setVerdict({ text: PROBABLY, mark: 'found' });
  yield t.frame({
    line: 5,
    note: reallyAdded
      ? `All ${plural(ds.length, 'bit')} are 1: "probably present". This time it's right: "${item}" was added.`
      : `All ${plural(ds.length, 'bit')} are 1, so the filter answers "probably present". It can't be sure: other items may have set these bits.`,
    marks: { found: ds },
    vars: { x: item, result: 'probably present' },
  });
  if (reallyAdded) return m;

  // A false positive: say honestly which added items set those bits.
  const sources = ds.map((p) => {
    const by = m.added.find((a) => positionsOf(a).includes(p));
    return by ? `bit ${p} by "${by}"` : `bit ${p}`;
  });
  t.recordNegative(true);
  t.setVerdict({ text: 'False positive', mark: 'reject' });
  yield t.frame({
    line: 5,
    note: `But "${item}" was never added: a false positive. Its bits were all set by other items (${listText(sources)}). The fuller the filter, the more often this happens.`,
    marks: { found: ds },
    vars: { x: item, result: 'probably present', falsePositive: true },
  });
  return { ...m, negatives: m.negatives + 1, falsePositives: m.falsePositives + 1 };
}

const addOp: OperationSpec<BloomModel, HashState> = { id: 'add', label: 'Add', args: [ITEM_ARG], pseudocode: addCode, run: add };

const empty = (): BloomModel => ({ bits: Array<0 | 1>(BLOOM_BITS).fill(0), added: [], negatives: 0, falsePositives: 0 });
const build = (items: readonly string[]) => items.reduce((m, item) => recordOperation(add(m, { item })).result, empty());

const WORDS = ['cat', 'dog', 'owl', 'emu', 'fox', 'bee', 'ant', 'yak', 'cow', 'pig', 'hen', 'elk', 'bat', 'ram', 'eel', 'gnu'];

export const bloomFilterStructure = defineStructure<BloomModel, HashState>({
  kind: 'structure',
  slug: 'bloom-filter',
  view: 'hash',
  initial: [
    { id: 'example', label: 'Three words', make: () => build(['cat', 'dog', 'owl']) },
    { id: 'crowded', label: 'Crowded (8 words)', make: () => build(['cat', 'dog', 'owl', 'emu', 'fox', 'bee', 'ant', 'yak']) },
    { id: 'empty', label: 'Empty', make: empty },
    {
      id: 'random',
      label: 'Random',
      make: (seed) => {
        const rng = createRng(seed);
        const pool = [...WORDS];
        return build(Array.from({ length: 2 + Math.floor(rng() * 4) }, () => pool.splice(Math.floor(rng() * pool.length), 1)[0]));
      },
    },
  ],
  snapshot: (m) => tracerFor(m).frame({ note: '' }).state,
  operations: [addOp, { id: 'test', label: 'Test', args: [ITEM_ARG], pseudocode: testCode, run: test }],
  stats: [
    { key: 'hashes', label: 'Hashes computed' },
    { key: 'checked', label: 'Bits checked' },
    { key: 'set', label: 'Bits switched on' },
  ],
  legend: [
    { neutral: 'Bit (shaded when 1)' },
    { mark: 'compare', label: 'Position chosen by a hash' },
    { mark: 'write', label: 'Bit just set' },
    { mark: 'found', label: 'Bit is 1, as required' },
    { mark: 'reject', label: 'A 0 bit: definitely not present' },
  ],
  content: {
    idea: 'A tiny bit array that answers "have I seen this?" with either "definitely not" or "probably": each item switches on k bits chosen by k hash functions, and a test checks whether all of its k bits are on.',
    invariant: 'Every bit an added item hashes to stays 1 forever, so an added item always tests "probably present": no false negatives. A "probably present" can be wrong (a false positive) when other items happened to set all k bits.',
    whenToUse: 'As a cheap filter in front of something expensive: skipping disk reads for keys that are definitely absent (LSM-tree databases like Cassandra and RocksDB), checking for weak passwords, avoiding duplicate crawls. Never when a wrong "yes" is unacceptable without a follow-up check.',
    traits: [
      { label: 'O(k) add and test, whatever the size', good: true },
      { label: 'Tiny: bits, not items', good: true },
      { label: 'No false negatives', good: true },
      { label: 'False positives possible', good: false },
      { label: "Can't list or delete items", good: false },
    ],
    experiments: [
      { example: 'crowded', prompt: 'Test words you never added, like "pig" or "hen": with half the bits set, some come back "probably present".' },
      { example: 'example', prompt: 'Test "cat", then "cow": a sure "no" needs only one 0 bit.' },
    ],
  },
});
