// Mock interviews' rules (REVAMP_PLAN.md 6f): the phases of a coding round
// and a system-design round and their suggested times, the dimensions a
// debrief scores, the caps hints put on them, what "meets the bar" means, the
// Big-O options a learner picks from, and the words that would give a
// problem's pattern away. Pure, so the server enforces them, the pages label
// with them and the projections read them (src/progress/), all from one
// place. What only design rounds need (variants, their scores and giveaway
// words) is in ./design.ts.

import type { PatternId } from '@/problems/patterns';

// ── Phases and time ─────────────────────────────────────────────────────────

export const LENGTHS = [30, 45, 60] as const;
export type RoundLength = (typeof LENGTHS)[number];
export const DEFAULT_LENGTH: RoundLength = 45;

/** A coding round on a practice problem, or a system-design round on a case study's interview variant. */
export const FORMATS = ['coding', 'design'] as const;
export type Format = (typeof FORMATS)[number];

export const PHASES = ['clarify', 'approach', 'code', 'test', 'debrief'] as const;
export type Phase = (typeof PHASES)[number];
/** The phases the learner works in; the debrief comes once the round has ended. */
export type WorkPhase = Exclude<Phase, 'debrief'>;

/** A design round: requirements, estimates, the design on the canvas, a deep dive into a failure, then the debrief. */
export const DESIGN_PHASES = ['requirements', 'estimate', 'design', 'deepdive', 'debrief'] as const;
export type DesignPhase = (typeof DESIGN_PHASES)[number];
export type DesignWorkPhase = Exclude<DesignPhase, 'debrief'>;

/** A phase of either kind of round. */
export type RoundPhase = Phase | DesignPhase;
export type RoundWorkPhase = WorkPhase | DesignWorkPhase;

export const PHASE_INFO: Record<RoundPhase, { label: string; doing: string }> = {
  clarify: { label: 'Clarify', doing: 'Read the problem and ask about anything it leaves open.' },
  approach: { label: 'Approach', doing: 'Say how you’ll solve it, and its time and space complexity.' },
  code: { label: 'Code', doing: 'Write it, and run the examples.' },
  test: { label: 'Test', doing: 'List the cases you’d test, then submit every test.' },
  requirements: { label: 'Requirements', doing: 'Read the brief and ask about anything it leaves open.' },
  estimate: { label: 'Estimate', doing: 'Estimate the numbers the design has to handle.' },
  design: { label: 'Design', doing: 'Build it on the canvas, check it against the targets, and explain it.' },
  deepdive: { label: 'Deep dive', doing: 'Something goes wrong: say what happens and why, and change the design.' },
  debrief: { label: 'Debrief', doing: 'Scores, evidence and what to work on.' },
};

/** The phases of a round of this format, the debrief last. */
export const phasesOf = (format: Format): readonly RoundPhase[] => (format === 'design' ? DESIGN_PHASES : PHASES);
/** The phases the learner works in. */
export const workPhasesOf = (format: Format) => phasesOf(format).filter((p) => p !== 'debrief') as RoundWorkPhase[];

/** Each working phase's share of a 45-minute round: coding 5, 10, 20 and 5 minutes, design 5, 5, 20 and 10, each with 5 to spare. */
const SHARE: Record<RoundWorkPhase, number> = {
  clarify: 5 / 45,
  approach: 10 / 45,
  code: 20 / 45,
  test: 5 / 45,
  requirements: 5 / 45,
  estimate: 5 / 45,
  design: 20 / 45,
  deepdive: 10 / 45,
};

/** Suggested minutes per working phase for a round of `limit` minutes. */
export function suggestedMinutes(limit: number): Record<WorkPhase, number>;
export function suggestedMinutes(limit: number, format: Format): Partial<Record<RoundWorkPhase, number>>;
export function suggestedMinutes(limit: number, format: Format = 'coding'): Partial<Record<RoundWorkPhase, number>> {
  return Object.fromEntries(workPhasesOf(format).map((p) => [p, Math.round(SHARE[p] * limit)]));
}

/** The phase after this one in its round, or null at the debrief. */
export function nextPhase(phase: RoundPhase): RoundPhase | null {
  const list: readonly RoundPhase[] = phase !== 'debrief' && (DESIGN_PHASES as readonly string[]).includes(phase) ? DESIGN_PHASES : PHASES;
  return list[list.indexOf(phase) + 1] ?? null;
}

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

/** A design round's dimensions: three measured by code (./design.ts scores them), two by the model. */
export const DESIGN_DIMENSIONS = [
  {
    id: 'targets',
    label: 'Targets',
    by: 'code',
    rubric: 'Scored from the server’s run of the final design, the deep dive included: every target met within four checks is strong, met after more checks meets the bar, at least half met is partly.',
  },
  {
    id: 'estimation',
    label: 'Estimation',
    by: 'code',
    rubric: 'An estimate within two times of the answer is spot on, within ten times the right order of magnitude. Every estimate spot on is strong.',
  },
  {
    id: 'cost',
    label: 'Cost',
    by: 'code',
    rubric: 'The final design’s monthly cost: close to a lean design that passes is strong, within the budget meets the bar.',
  },
  {
    id: 'tradeoffs',
    label: 'Trade-offs',
    by: 'model',
    rubric: 'Said what each choice gains and what it costs (latency, consistency, money, complexity), and why it suits these requirements, in the design and in the deep dive. Each hint lowers the most this can score.',
  },
  {
    id: 'communication',
    label: 'Communication',
    by: 'model',
    rubric: 'Asked about what the brief leaves open, explained the design and what went wrong in the deep dive out loud, and answered the interviewer’s questions directly.',
  },
] as const;
export type DesignDimensionId = (typeof DESIGN_DIMENSIONS)[number]['id'];
export const DESIGN_MODEL_DIMENSIONS = DESIGN_DIMENSIONS.filter((d) => d.by === 'model').map((d) => d.id) as Extract<DesignDimensionId, 'tradeoffs' | 'communication'>[];

/** A dimension of either kind of round. */
export type AnyDimensionId = DimensionId | DesignDimensionId;
export type Dimension = { readonly id: AnyDimensionId; readonly label: string; readonly by: 'code' | 'model'; readonly rubric: string };
export const dimensionsOf = (format: Format): readonly Dimension[] => (format === 'design' ? DESIGN_DIMENSIONS : DIMENSIONS);
/** The dimensions the model scores (or, when it can't, the learner). */
export const modelDimensionsOf = (format: Format): readonly AnyDimensionId[] => (format === 'design' ? DESIGN_MODEL_DIMENSIONS : MODEL_DIMENSIONS);
/** The dimension hints cap: a coding round's approach, a design round's trade-offs. */
export const cappedDimension = (format: Format): AnyDimensionId => (format === 'design' ? 'tradeoffs' : 'approach');
export const dimensionLabel = (id: string) => [...DIMENSIONS, ...DESIGN_DIMENSIONS].find((d) => d.id === id)?.label ?? id;

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

export const scoreOf = (scores: readonly { dimension: string; score: number }[], dimension: AnyDimensionId) => scores.find((s) => s.dimension === dimension)?.score ?? 0;

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
export const norm = (text: string) => ` ${text.toLowerCase().replace(/[-_]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;

export const says = (normed: string, term: string) => normed.includes(` ${norm(term).trim()} `);

/**
 * The first pattern word a reply says that neither the learner nor the
 * problem's statement has said, or null. `learner` is everything the learner
 * has written in the round (messages, approach, cases, code).
 */
export function giveaway(reply: string, patterns: readonly PatternId[], learner: string, statement: string): string | null {
  return firstUnsaid(reply, patterns.flatMap((p) => GIVEAWAY_TERMS[p]), `${learner}\n${statement}`);
}

/** The first of `terms` a reply says that `known` (the learner's words and the problem's own text) doesn't, or null. */
export function firstUnsaid(reply: string, terms: readonly string[], known: string): string | null {
  const r = norm(reply);
  const k = norm(known);
  return terms.find((term) => says(r, term) && !says(k, term)) ?? null;
}

/** The pattern words nobody has said yet in `known` (the learner's words and the statement): what the interviewer must not say first. */
export function unsaidTerms(patterns: readonly PatternId[], known: string): string[] {
  return unsaidOf(patterns.flatMap((p) => GIVEAWAY_TERMS[p]), known);
}

/** The terms `known` doesn't say yet. */
export function unsaidOf(terms: readonly string[], known: string): string[] {
  const k = norm(known);
  return [...new Set(terms)].filter((t) => !says(k, t));
}
