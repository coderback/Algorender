// Mock interviews' rules (REVAMP_PLAN.md 6f): the phases of a coding round
// and their suggested times, the dimensions a debrief scores, the caps hints
// put on them, what "meets the bar" means, the Big-O options a learner picks
// from, and the words that would give a problem's pattern away. Pure, so the
// server enforces them, the pages label with them and the projections read
// them (src/progress/), all from one place.

import type { PatternId } from '@/problems/patterns';

// ── Phases and time ─────────────────────────────────────────────────────────

export const LENGTHS = [30, 45, 60] as const;
export type RoundLength = (typeof LENGTHS)[number];
export const DEFAULT_LENGTH: RoundLength = 45;

export const PHASES = ['clarify', 'approach', 'code', 'test', 'debrief'] as const;
export type Phase = (typeof PHASES)[number];
/** The phases the learner works in; the debrief comes once the round has ended. */
export type WorkPhase = Exclude<Phase, 'debrief'>;

export const PHASE_INFO: Record<Phase, { label: string; doing: string }> = {
  clarify: { label: 'Clarify', doing: 'Read the problem and ask about anything it leaves open.' },
  approach: { label: 'Approach', doing: 'Say how you’ll solve it, and its time and space complexity.' },
  code: { label: 'Code', doing: 'Write it, and run the examples.' },
  test: { label: 'Test', doing: 'List the cases you’d test, then submit every test.' },
  debrief: { label: 'Debrief', doing: 'Scores, evidence and what to work on.' },
};

/** Each working phase's share of a 45-minute round (5, 10, 20 and 5 minutes, with 5 to spare). */
const SHARE: Record<WorkPhase, number> = { clarify: 5 / 45, approach: 10 / 45, code: 20 / 45, test: 5 / 45 };

/** Suggested minutes per working phase for a round of `limit` minutes. */
export function suggestedMinutes(limit: number): Record<WorkPhase, number> {
  return { clarify: Math.round(SHARE.clarify * limit), approach: Math.round(SHARE.approach * limit), code: Math.round(SHARE.code * limit), test: Math.round(SHARE.test * limit) };
}

/** The phase after this one, or null at the debrief. */
export const nextPhase = (phase: Phase): Phase | null => PHASES[PHASES.indexOf(phase) + 1] ?? null;

/** Minutes left are announced only at these marks, not every second. */
export const ANNOUNCE_AT = [5, 1] as const;

// ── What a phase needs ──────────────────────────────────────────────────────

/** An approach shorter than this isn't one yet. */
export const APPROACH_MIN_WORDS = 15;
export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** The cases the learner would test, one per line. */
export const edgeCaseList = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
    .filter(Boolean);

/** Big-O options for the stated time and space complexity, slowest last. `rank` orders them; 'other' has none. */
export const COMPLEXITIES = [
  { id: 'O(1)', rank: 0 },
  { id: 'O(log n)', rank: 1 },
  { id: 'O(√n)', rank: 2 },
  { id: 'O(n)', rank: 3 },
  { id: 'O(n log n)', rank: 4 },
  { id: 'O(n²)', rank: 5 },
  { id: 'O(n³)', rank: 6 },
  { id: 'O(2ⁿ)', rank: 7 },
  { id: 'O(n!)', rank: 8 },
  { id: 'other', rank: null },
] as const satisfies readonly { id: string; rank: number | null }[];
export type ComplexityId = (typeof COMPLEXITIES)[number]['id'];
export const COMPLEXITY_IDS = COMPLEXITIES.map((c) => c.id) as [ComplexityId, ...ComplexityId[]];
export const complexityLabel = (id: ComplexityId) => (id === 'other' ? 'Something else (say which in your approach)' : id);

/**
 * Where a problem's own complexity (free text such as "O(n log k) to start")
 * sits among the options, read from its first O(…); null when it is in other
 * terms (O(m × n), O(V + E)) and can't be compared.
 */
export function complexityRank(text: string): number | null {
  const m = /O\(([^)]*)\)/.exec(text);
  if (!m) return null;
  const inner = m[1].replace(/\s+/g, '').replace(/[·×*]/g, '');
  if (inner === '1') return 0;
  if (/^log/.test(inner)) return 1;
  if (inner === '√n' || inner === 'sqrt(n)') return 2;
  if (inner === 'n') return 3;
  if (/^nlog[a-z]$/.test(inner)) return 4;
  if (inner === 'n²' || inner === 'n^2') return 5;
  if (inner === 'n³' || inner === 'n^3') return 6;
  if (/^n?2ⁿ$|^n?2\^n$/.test(inner)) return 7;
  if (/^n?n!$/.test(inner)) return 8;
  return null;
}

/** Whether a stated bound is slower than the reference's: what lets the interviewer ask "can you do better?". */
export function slowerThanReference(stated: ComplexityId, reference: string): boolean {
  const mine = COMPLEXITIES.find((c) => c.id === stated)?.rank ?? null;
  const theirs = complexityRank(reference);
  return mine != null && theirs != null && mine > theirs;
}

// ── Hints ───────────────────────────────────────────────────────────────────

/** Interview hints are the tutor's ladder, capped at level 3: no partial fix in an interview. */
export const MAX_HINT = 3;

// ── Scoring ─────────────────────────────────────────────────────────────────

export type Score = 1 | 2 | 3 | 4;
export const SCORE_LABELS: Record<Score, string> = { 1: 'Not yet', 2: 'Partly', 3: 'Meets the bar', 4: 'Strong' };

export const DIMENSIONS = [
  {
    id: 'correctness',
    label: 'Correctness',
    by: 'code',
    rubric: 'Scored from the last submission: every test passing in one or two submissions is strong, passing after more meets the bar, at least half passing is partly.',
  },
  {
    id: 'approach',
    label: 'Approach',
    by: 'model',
    rubric: 'Found an approach that works within the constraints and said why it works, before coding. Each hint lowers the most this can score.',
  },
  {
    id: 'analysis',
    label: 'Complexity analysis',
    by: 'model',
    rubric: 'The time and space complexity stated match the code as written, with a reason for each.',
  },
  {
    id: 'testing',
    label: 'Testing',
    by: 'model',
    rubric: 'Listed the cases that matter for these constraints (empty or smallest input, duplicates, extremes, no answer) before submitting.',
  },
  {
    id: 'communication',
    label: 'Communication',
    by: 'model',
    rubric: 'Asked about what the problem leaves open, explained the thinking out loud, and answered the interviewer’s questions directly.',
  },
] as const;
export type DimensionId = (typeof DIMENSIONS)[number]['id'];
export const MODEL_DIMENSIONS = DIMENSIONS.filter((d) => d.by === 'model').map((d) => d.id) as Exclude<DimensionId, 'correctness'>[];
export const dimensionLabel = (id: string) => DIMENSIONS.find((d) => d.id === id)?.label ?? id;

/** The highest approach score after hints: one hint caps it at 3, two at 2, three at 1. */
export const hintCap = (hints: number): Score => Math.max(1, Math.min(4, 4 - hints)) as Score;

/** One submission inside a round: how many tests ran and how many failed. */
export type Submission = { tests: number; failed: number };

/** Correctness, from the submissions alone (code, never the model). */
export function correctnessScore(submissions: readonly Submission[]): Score {
  const last = submissions.at(-1);
  if (!last || last.tests === 0) return 1;
  if (last.failed === 0) return submissions.length <= 2 ? 4 : 3;
  return (last.tests - last.failed) / last.tests >= 0.5 ? 2 : 1;
}

/** Whether the round ended passing: the last submission passed every test. */
export const endedPassing = (submissions: readonly Submission[]) => {
  const last = submissions.at(-1);
  return !!last && last.tests > 0 && last.failed === 0;
};

/** Meets the bar: every dimension at least 3, no level-3 hint, and the round ended passing. */
export function meetsBar(scores: readonly { dimension: string; score: number }[], hints: number, passed: boolean): boolean {
  return passed && hints < MAX_HINT && scores.length > 0 && scores.every((s) => s.score >= 3);
}

export const scoreOf = (scores: readonly { dimension: string; score: number }[], dimension: DimensionId) => scores.find((s) => s.dimension === dimension)?.score ?? 0;

// ── Giveaways ───────────────────────────────────────────────────────────────

/**
 * Words that name each pattern's technique. The interviewer may not say one
 * until the learner has (or the problem's own statement does): naming the
 * pattern is most of a hint.
 */
export const GIVEAWAY_TERMS: Record<PatternId, readonly string[]> = {
  hashing: ['hashing', 'hash map', 'hashmap', 'hash table', 'hash set', 'hashset', 'dictionary', 'lookup table'],
  'two-pointers': ['two pointers', 'two pointer', 'left and right pointers'],
  'sliding-window': ['sliding window', 'window'],
  'prefix-sum': ['prefix sum', 'prefix sums', 'running sum', 'cumulative sum'],
  stack: ['stack'],
  'monotonic-stack': ['monotonic stack', 'monotonic', 'stack'],
  'binary-search': ['binary search', 'bisect', 'bisection'],
  'linked-list': ['fast and slow', 'slow and fast', 'tortoise and hare', 'dummy node', 'runner'],
  trees: ['depth first', 'breadth first', 'dfs', 'bfs', 'level order', 'inorder', 'in order traversal', 'preorder', 'postorder'],
  trie: ['trie', 'prefix tree'],
  heap: ['heap', 'min heap', 'max heap', 'priority queue', 'heapq'],
  backtracking: ['backtracking', 'backtrack'],
  graphs: ['depth first', 'breadth first', 'dfs', 'bfs', 'flood fill'],
  'topological-sort': ['topological sort', 'topological order', 'topological', 'kahn', 'in degree', 'indegree'],
  'union-find': ['union find', 'disjoint set', 'disjoint sets', 'dsu'],
  'shortest-paths': ['dijkstra', 'bellman ford', 'shortest path'],
  'dp-1d': ['dynamic programming', 'dp', 'memoization', 'memoisation', 'memoize', 'memoise', 'tabulation'],
  'dp-2d': ['dynamic programming', 'dp', 'memoization', 'memoisation', 'memoize', 'memoise', 'tabulation'],
  greedy: ['greedy', 'greedily'],
  intervals: ['sweep line', 'sort by start', 'sort by end', 'sorted by start', 'sorted by end'],
  'bit-manipulation': ['xor', 'bitmask', 'bit manipulation', 'bitwise'],
  math: [],
};

/** Lower case, hyphens and underscores as spaces, runs of space as one: "Two-Pointer" and "two  pointer" read alike. */
const norm = (text: string) => ` ${text.toLowerCase().replace(/[-_]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;

const says = (normed: string, term: string) => normed.includes(` ${norm(term).trim()} `);

/**
 * The first pattern word a reply says that neither the learner nor the
 * problem's statement has said, or null. `learner` is everything the learner
 * has written in the round (messages, approach, cases, code).
 */
export function giveaway(reply: string, patterns: readonly PatternId[], learner: string, statement: string): string | null {
  const r = norm(reply);
  const known = norm(`${learner}\n${statement}`);
  for (const p of patterns) for (const term of GIVEAWAY_TERMS[p]) if (says(r, term) && !says(known, term)) return term;
  return null;
}

/** The pattern words nobody has said yet in `known` (the learner's words and the statement): what the interviewer must not say first. */
export function unsaidTerms(patterns: readonly PatternId[], known: string): string[] {
  const k = norm(known);
  return [...new Set(patterns.flatMap((p) => GIVEAWAY_TERMS[p]))].filter((t) => !says(k, t));
}
