// The patterns problems are grouped by, in the order /practice lists them.
// Each names the signal that points to it, which pattern drills ask learners to
// spot, and the concept and visualiser that teach it.

export const PATTERN_IDS = [
  'hashing',
  'two-pointers',
  'sliding-window',
  'prefix-sum',
  'stack',
  'monotonic-stack',
  'binary-search',
  'linked-list',
  'trees',
  'trie',
  'heap',
  'backtracking',
  'graphs',
  'topological-sort',
  'union-find',
  'shortest-paths',
  'dp-1d',
  'dp-2d',
  'greedy',
  'intervals',
  'bit-manipulation',
  'math',
] as const;

export type PatternId = (typeof PATTERN_IDS)[number];

export type Pattern = {
  id: PatternId;
  title: string;
  /** What in a problem points to this pattern, in one sentence. */
  signal: string;
  /** A concept in src/content/concepts.yaml. */
  concept?: string;
  /** A visualiser slug. */
  visualiser?: string;
};

/**
 * Patterns learners mistake for each other, the wrong options pattern drills
 * offer first: telling near neighbours apart is what the drill trains.
 */
export const CONFUSED_WITH: Record<PatternId, PatternId[]> = {
  hashing: ['two-pointers', 'sliding-window', 'prefix-sum', 'heap'],
  'two-pointers': ['sliding-window', 'binary-search', 'hashing'],
  'sliding-window': ['two-pointers', 'prefix-sum', 'dp-1d'],
  'prefix-sum': ['sliding-window', 'hashing', 'dp-1d'],
  stack: ['monotonic-stack', 'linked-list', 'heap'],
  'monotonic-stack': ['stack', 'two-pointers', 'heap'],
  'binary-search': ['two-pointers', 'greedy', 'heap'],
  'linked-list': ['two-pointers', 'stack', 'hashing'],
  trees: ['graphs', 'backtracking', 'dp-1d'],
  trie: ['hashing', 'trees', 'backtracking'],
  heap: ['greedy', 'binary-search', 'hashing'],
  backtracking: ['dp-1d', 'graphs', 'trees'],
  graphs: ['trees', 'backtracking', 'union-find', 'topological-sort'],
  'topological-sort': ['graphs', 'union-find', 'greedy'],
  'union-find': ['graphs', 'topological-sort', 'hashing'],
  'shortest-paths': ['graphs', 'dp-2d', 'heap'],
  'dp-1d': ['greedy', 'backtracking', 'dp-2d'],
  'dp-2d': ['dp-1d', 'backtracking', 'graphs'],
  greedy: ['dp-1d', 'heap', 'intervals'],
  intervals: ['greedy', 'heap', 'two-pointers'],
  'bit-manipulation': ['math', 'hashing'],
  math: ['two-pointers', 'bit-manipulation', 'dp-2d'],
};

export const PATTERNS: Record<PatternId, Pattern> = {
  hashing: {
    id: 'hashing',
    title: 'Hashing',
    signal: 'You need to find, count or match things fast: a hash map or set trades memory for constant-time lookups.',
    concept: 'hash-tables',
    visualiser: 'hash-table',
  },
  'two-pointers': {
    id: 'two-pointers',
    title: 'Two pointers',
    signal: 'Sorted input, pairs, or comparing the two ends: two indices move towards each other (or in step), each move ruling out a whole set of options.',
    concept: 'two-pointers',
    visualiser: 'two-pointers',
  },
  'sliding-window': {
    id: 'sliding-window',
    title: 'Sliding window',
    signal: 'The best contiguous run (a substring or subarray) under some rule: grow the window on the right, shrink it on the left when it breaks the rule.',
    concept: 'sliding-window',
    visualiser: 'sliding-window',
  },
  'prefix-sum': {
    id: 'prefix-sum',
    title: 'Prefix sums',
    signal: 'Many questions about range totals: running totals turn any range into one subtraction.',
    concept: 'arrays',
    visualiser: 'array',
  },
  stack: {
    id: 'stack',
    title: 'Stack',
    signal: 'Nesting, matching pairs, or undoing the most recent thing first: last in, first out.',
    concept: 'stacks-queues',
    visualiser: 'stack',
  },
  'monotonic-stack': {
    id: 'monotonic-stack',
    title: 'Monotonic stack',
    signal: 'The next greater (or smaller) item for every position: keep a stack in order and pop what each new item beats.',
    concept: 'monotonic-stack',
    visualiser: 'monotonic-stack',
  },
  'binary-search': {
    id: 'binary-search',
    title: 'Binary search',
    signal: 'Sorted data, or a yes/no question about the answer that flips exactly once: halve the range at every step.',
    concept: 'binary-search',
    visualiser: 'binary-search',
  },
  'linked-list': {
    id: 'linked-list',
    title: 'Linked list',
    signal: 'Rewire nodes in place: a dummy head, fast and slow pointers, and pointer updates in the right order.',
    concept: 'linked-lists',
    visualiser: 'linked-list',
  },
  trees: {
    id: 'trees',
    title: 'Trees',
    signal: "A node's answer comes from its children's answers: recurse depth-first, or go level by level with a queue.",
    concept: 'binary-search-trees',
    visualiser: 'binary-tree',
  },
  trie: {
    id: 'trie',
    title: 'Trie',
    signal: 'Many words that share prefixes: a tree of characters answers prefix questions in the length of the word.',
    concept: 'tries',
    visualiser: 'trie',
  },
  heap: {
    id: 'heap',
    title: 'Heap',
    signal: 'Again and again you need the smallest or largest item, or the top k: a priority queue gives it in log time.',
    concept: 'heaps',
    visualiser: 'heap',
  },
  backtracking: {
    id: 'backtracking',
    title: 'Backtracking',
    signal: 'List every combination, arrangement or path that obeys a rule: choose, explore, then undo the choice.',
    concept: 'backtracking',
    visualiser: 'subsets',
  },
  graphs: {
    id: 'graphs',
    title: 'Graphs',
    signal: 'Things connected to things, including cells of a grid: breadth-first for fewest steps, depth-first to explore or count regions.',
    concept: 'bfs-dfs',
    visualiser: 'breadth-first-search',
  },
  'topological-sort': {
    id: 'topological-sort',
    title: 'Topological sort',
    signal: 'Tasks with prerequisites: take whatever has nothing left in front of it, and a cycle means it can’t be done.',
    concept: 'topological-sort',
    visualiser: 'topological-sort',
  },
  'union-find': {
    id: 'union-find',
    title: 'Union-find',
    signal: 'Groups that merge as connections arrive: union-find answers "same group?" in near-constant time.',
    concept: 'union-find',
    visualiser: 'union-find',
  },
  'shortest-paths': {
    id: 'shortest-paths',
    title: 'Shortest paths',
    signal: 'Cheapest route through weighted connections: Dijkstra with a heap when no weight is negative.',
    concept: 'shortest-paths',
    visualiser: 'dijkstra',
  },
  'dp-1d': {
    id: 'dp-1d',
    title: 'Dynamic programming (1D)',
    signal: 'The answer for n builds from answers for smaller n, and choices overlap: one table indexed by position.',
    concept: 'dynamic-programming',
    visualiser: 'house-robber',
  },
  'dp-2d': {
    id: 'dp-2d',
    title: 'Dynamic programming (2D)',
    signal: 'Two strings, or a grid, and the answer for a pair of positions builds from neighbouring pairs: a 2D table.',
    concept: 'sequence-dp',
    visualiser: 'longest-common-subsequence',
  },
  greedy: {
    id: 'greedy',
    title: 'Greedy',
    signal: 'A locally best choice can be shown to be safe: sort or scan once and commit to each choice.',
    concept: 'greedy',
    visualiser: 'activity-selection',
  },
  intervals: {
    id: 'intervals',
    title: 'Intervals',
    signal: 'Ranges that may overlap: sort by start, then merge, count or compare neighbours.',
    concept: 'intervals',
    visualiser: 'merge-intervals',
  },
  'bit-manipulation': {
    id: 'bit-manipulation',
    title: 'Bit manipulation',
    signal: 'Numbers as bits: XOR cancels pairs, shifts and masks read or set single bits.',
  },
  math: {
    id: 'math',
    title: 'Math and matrices',
    signal: 'Number properties or 2D layout: work digit by digit, or move matrix cells by index arithmetic.',
    concept: 'arrays',
  },
};
