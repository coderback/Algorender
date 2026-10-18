import { defineAlgorithm, type InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { createPaging, pagingStep, POLICY_NAMES, type PagingState, type ReplacementPolicy } from '@/systems/paging';
import { GridTracer } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';

// Page replacement on the classic table: the reference string across, the
// frames down, a fault row underneath. The policy (FIFO, LRU, OPT, Clock) is
// part of the input, so the same string can be compared policy by policy.
// The simulation is src/systems/paging.ts; this module narrates it.

export type PagingInput = { policy: ReplacementPolicy; frames: number; refs: number[] };

export const MAX_REFS = 20;
export const MAX_FRAMES = 6;
const MAX_PAGE = 9;

const pseudocode = [
  'for each page p in the references:',
  '  if p is in a frame: hit',
  '    note that p was used',
  '  else: fault',
  '    if a frame is free: load p there',
  '    else: v ← victim(policy)',
  '      replace v with p',
  '',
  'victim, by policy:',
  '  FIFO: the page loaded longest ago',
  '  LRU: the page used longest ago',
  '  OPT: the page next used furthest',
  '       ahead (or never again)',
  '  Clock: sweep the hand, clearing',
  '         use bits, to the first 0',
];

const VICTIM_LINE: Record<ReplacementPolicy, number> = { fifo: 9, lru: 10, opt: 11, clock: 13 };
const HIT_OR_FAULT = ['Hit', 'Fault'];
const FAULT_ROW = 'fault';
const frameRow = (f: number) => `f${f}`;

/** Why the policy picked its victim, in words. */
function victimReason(policy: ReplacementPolicy, victim: number, before: PagingState, future: readonly number[]): string {
  switch (policy) {
    case 'fifo':
      return `FIFO replaces ${victim}, the page loaded longest ago (at reference ${before.loadedAt[before.frames.indexOf(victim)]}), however much it is still used.`;
    case 'lru':
      return `LRU replaces ${victim}, the page used longest ago (at reference ${before.usedAt[before.frames.indexOf(victim)]}): the past is its guess for the future.`;
    case 'opt': {
      const next = future.indexOf(victim);
      return next < 0
        ? `OPT replaces ${victim}: it is never used again, so losing it costs nothing.`
        : `OPT replaces ${victim}: of the pages held, it is needed again furthest ahead (${next + 1} references from now).`;
    }
    case 'clock':
      return `Clock replaces ${victim}: the hand reached its frame with the use bit clear, so it hasn't been used since the hand last passed.`;
  }
}

function* run({ policy, frames: k, refs }: PagingInput): Generator<Frame<GridState>> {
  const t = new GridTracer(['references', 'faults', 'hits']);
  const name = POLICY_NAMES[policy];
  t.addTable({
    label: `${name} with ${k} ${k === 1 ? 'frame' : 'frames'}`,
    corner: 'Page →',
    rows: [
      ...Array.from({ length: k }, (_, f) => ({ id: frameRow(f), label: `Frame ${f + 1}`, ...(policy === 'clock' && { sub: 'use 0' }) })),
      { id: FAULT_ROW, label: 'Fault?' },
    ],
    cols: refs.map((p) => ({ label: String(p) })),
  });
  const rowOf = (f: number) => f;
  const faultRow = k;
  const clockHeaders = (s: PagingState) => {
    if (policy !== 'clock') return;
    s.useBits.forEach((bit, f) => t.setRowHeader(rowOf(f), { label: `Frame ${f + 1}`, sub: `use ${bit ? 1 : 0}` }));
  };
  const handMark = (s: PagingState) => (policy === 'clock' ? { key: [{ row: rowOf(s.hand) }] } : {});

  let state = createPaging(policy, k);
  yield t.frame({
    note: `${refs.length} page references arrive one by one, and ${k} ${k === 1 ? 'frame' : 'frames'} of memory can hold pages. A page in memory is a hit; any other is a fault, which costs a slow trip to disk. ${name} decides which page to give up.`,
    marks: handMark(state),
  });

  for (let i = 0; i < refs.length; i++) {
    const page = refs[i];
    const future = refs.slice(i + 1);
    const before = state;
    const { state: after, step } = pagingStep(state, page, future);
    const vars = { page, held: before.frames.map((f) => (f == null ? '–' : f)).join(' '), faults: before.faults, hits: before.hits };
    t.count('references');

    yield t.frame({
      line: 1,
      note: `Reference ${i + 1}: page ${page}. Is it in one of the frames?`,
      marks: { compare: [{ col: i }], ...handMark(before) },
      vars,
      checkpoint: { question: `Page ${page}: hit or fault?`, choices: HIT_OR_FAULT, answer: step.hit ? 0 : 1 },
    });

    // The column under this reference shows memory after it.
    const fill = () => {
      after.frames.forEach((f, row) => t.set([rowOf(row), i], f == null ? '' : f));
      clockHeaders(after);
    };

    if (step.hit) {
      fill();
      t.set([faultRow, i], '✓');
      t.mark([faultRow, i], 'found');
      t.count('hits');
      state = after;
      yield t.frame({
        line: policy === 'lru' || policy === 'clock' ? 2 : 1,
        note:
          policy === 'lru'
            ? `Hit: page ${page} is in frame ${step.frame + 1}. LRU records the use, so ${page} is now the most recently used.`
            : policy === 'clock'
              ? `Hit: page ${page} is in frame ${step.frame + 1}. Its use bit is set, giving it a second chance when the hand comes round.`
              : `Hit: page ${page} is already in frame ${step.frame + 1}. ${policy === 'fifo' ? 'FIFO ignores uses: only load order matters.' : 'Nothing has to move.'}`,
        marks: { found: [[rowOf(step.frame), i]], ...handMark(after) },
        vars: { ...vars, hits: after.hits },
      });
      continue;
    }

    t.set([faultRow, i], 'F');
    t.mark([faultRow, i], 'reject');
    t.count('faults');
    if (step.evicted == null) {
      fill();
      state = after;
      yield t.frame({
        line: 4,
        note: `Fault: page ${page} isn't in memory, but frame ${step.frame + 1} is free, so it is loaded there.`,
        marks: { write: [[rowOf(step.frame), i]], ...handMark(after) },
        vars: { ...vars, faults: after.faults },
      });
      continue;
    }

    const held = before.frames.filter((f): f is number => f != null);
    const choices = [...held].sort((a, b) => a - b).map(String);
    yield t.frame({
      line: 5,
      note: `Fault: page ${page} isn't in memory, and all ${k} frames are full. ${name} must give one page up.`,
      marks: { reject: [[faultRow, i]], ...handMark(before) },
      vars: { ...vars, faults: after.faults },
      ...(held.length > 1 && { checkpoint: { question: `Which page does ${name} replace?`, choices, answer: choices.indexOf(String(step.evicted)) } }),
    });

    fill();
    state = after;
    const swept = step.passedOver.length > 0 ? ` On the way, the hand cleared the use bits of ${step.passedOver.map((f) => `frame ${f + 1}`).join(', ')}.` : '';
    yield t.frame({
      line: VICTIM_LINE[policy],
      note: `${victimReason(policy, step.evicted, before, future)}${swept} Page ${page} takes frame ${step.frame + 1}.`,
      marks: { write: [[rowOf(step.frame), i]], ...(i > 0 && { reject: [[rowOf(step.frame), i - 1]] }), ...handMark(after) },
      vars: { ...vars, faults: after.faults, replaced: step.evicted },
    });
  }

  const rate = Math.round((100 * state.faults) / Math.max(1, refs.length));
  yield t.frame({
    note: `${name} faulted ${state.faults} times in ${refs.length} references (${rate}%) and hit ${state.hits} times. Try the same string with another policy, or with more frames.`,
    vars: { faults: state.faults, hits: state.hits },
  });
}

const POLICIES = Object.keys(POLICY_NAMES) as ReplacementPolicy[];

const custom: NonNullable<InputSpec<PagingInput>['custom']> = {
  label: `Policy, frames and pages (fifo, lru, opt or clock; 1–${MAX_FRAMES} frames; up to ${MAX_REFS} pages 0–${MAX_PAGE})`,
  placeholder: 'e.g. lru 3: 7 0 1 2 0 3 0 4',
  parse: (text) => {
    const m = /^\s*([a-z]+)\s+(\d+)\s*:\s*(.*)$/i.exec(text);
    if (!m) return { error: 'Write the policy, the number of frames, a colon, then the pages, e.g. lru 3: 7 0 1 2.' };
    const policy = m[1].toLowerCase() as ReplacementPolicy;
    if (!POLICIES.includes(policy)) return { error: `"${m[1]}" isn't a policy: use fifo, lru, opt or clock.` };
    const frames = Number(m[2]);
    if (frames < 1 || frames > MAX_FRAMES) return { error: `Use 1 to ${MAX_FRAMES} frames.` };
    const parts = m[3].split(/[\s,]+/).filter(Boolean);
    if (parts.length === 0) return { error: 'List at least one page after the colon.' };
    if (parts.length > MAX_REFS) return { error: `Use at most ${MAX_REFS} pages.` };
    const refs: number[] = [];
    for (const part of parts) {
      if (!/^\d+$/.test(part) || Number(part) > MAX_PAGE) return { error: `"${part}" isn't a page: use whole numbers from 0 to ${MAX_PAGE}.` };
      refs.push(Number(part));
    }
    return { value: { policy, frames, refs } };
  },
  format: ({ policy, frames, refs }) => `${policy} ${frames}: ${refs.join(' ')}`,
};

/** References with locality: mostly pages near the last one, sometimes a jump. */
function randomRefs(seed: number, size: number): number[] {
  const rng = createRng(seed);
  const refs: number[] = [];
  let at = Math.floor(rng() * 6);
  for (let i = 0; i < size; i++) {
    at = rng() < 0.7 ? Math.max(0, Math.min(MAX_PAGE, at + Math.floor(rng() * 3) - 1)) : Math.floor(rng() * 8);
    refs.push(at);
  }
  return refs;
}

const TEXTBOOK = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
const LOOP = [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4];
const fixed = (id: string, label: string, input: PagingInput) => ({ id, label, sized: false, make: () => ({ ...input, refs: [...input.refs] }) });

export const pageReplacement = defineAlgorithm<PagingInput, GridState>({
  kind: 'algorithm',
  slug: 'page-replacement',
  view: 'grid',
  input: {
    examples: [
      fixed('lru', 'LRU, 3 frames', { policy: 'lru', frames: 3, refs: TEXTBOOK }),
      fixed('fifo', 'FIFO, 3 frames', { policy: 'fifo', frames: 3, refs: TEXTBOOK }),
      fixed('opt', 'OPT (the ideal), 3 frames', { policy: 'opt', frames: 3, refs: TEXTBOOK }),
      fixed('clock', 'Clock, 3 frames', { policy: 'clock', frames: 3, refs: TEXTBOOK }),
      fixed('belady-3', 'Bélády: FIFO, 3 frames', { policy: 'fifo', frames: 3, refs: BELADY }),
      fixed('belady-4', 'Bélády: FIFO, 4 frames', { policy: 'fifo', frames: 4, refs: BELADY }),
      fixed('loop-lru', 'A loop one page too big: LRU', { policy: 'lru', frames: 3, refs: LOOP }),
      fixed('loop-opt', 'A loop one page too big: OPT', { policy: 'opt', frames: 3, refs: LOOP }),
      { id: 'random', label: 'Random (with locality), LRU', make: ({ seed, size }) => ({ policy: 'lru', frames: 3, refs: randomRefs(seed, size) }) },
    ],
    size: { label: 'References', min: 6, max: MAX_REFS, default: 12 },
    custom,
  },
  pseudocode,
  stats: [
    { key: 'references', label: 'References' },
    { key: 'faults', label: 'Page faults' },
    { key: 'hits', label: 'Hits' },
  ],
  legend: [
    { neutral: 'Page held in a frame' },
    { mark: 'compare', label: 'Page being referenced' },
    { mark: 'found', label: 'Hit' },
    { mark: 'write', label: 'Page just loaded' },
    { mark: 'reject', label: 'Fault, or the page replaced' },
    { mark: 'key', label: 'Clock hand' },
  ],
  run,
  content: {
    idea: 'Memory holds only a few pages of a program; the rest wait on disk. When a page is needed and memory is full, one page must go. Each policy is a different guess at which page won’t be needed soon, and the number of faults (trips to disk) is the price of guessing wrong.',
    invariant: 'The frames always hold the most recent fault’s page and at most one copy of any page; a page leaves only when a fault needs its frame and memory is full.',
    whenToUse: 'Page replacement is how virtual memory, database buffer pools and CPU caches decide what to keep. LRU, or Clock as its cheap approximation, is the usual choice; OPT can’t run (it needs the future) but measures how far a policy is from perfect.',
    traits: [
      { label: 'OPT is the fewest faults possible', good: true },
      { label: 'FIFO can get worse with more memory', good: false },
      { label: 'LRU needs a timestamp per use', good: null },
      { label: 'Clock: one bit per page', good: true },
    ],
    experiments: [
      { example: 'belady-3', prompt: 'Nine faults with 3 frames. Now try Bélády with 4 frames: FIFO faults ten times with more memory.' },
      { example: 'loop-lru', prompt: 'Four pages looping through three frames: LRU always throws out the page needed next. Compare the loop under OPT.' },
      { example: 'opt', prompt: 'OPT faults 7 times. Compare FIFO (10), LRU (9) and Clock (9) on the same string.' },
    ],
  },
});
