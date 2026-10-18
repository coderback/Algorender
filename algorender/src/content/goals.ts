// Study-plan goals: each names the concepts it aims at. A plan
// (src/progress/plan.ts) adds everything they build on, drops what the learner
// already knows, and schedules the rest. Concept ids are checked against
// src/content/concepts.yaml by content.test.ts.

export type Goal = {
  id: string;
  title: string;
  summary: string;
  /** The concepts the goal is reached at, in the order to learn them; their prerequisites come along, each just before it is needed. */
  concepts: readonly string[];
};

export const goals: readonly Goal[] = [
  {
    id: 'interviews',
    title: 'Coding interviews',
    summary: 'The patterns behind most interview problems, each with practice problems judged in your language.',
    concepts: [
      'hash-tables',
      'two-pointers',
      'sliding-window',
      'binary-search',
      'linked-lists',
      'monotonic-stack',
      'intervals',
      'binary-search-trees',
      'heaps',
      'bfs-dfs',
      'topological-sort',
      'shortest-paths',
      'union-find',
      'tries',
      'greedy',
      'backtracking',
      'sequence-dp',
    ],
  },
  {
    id: 'dsa-foundations',
    title: 'Data structures and algorithms',
    summary: 'A steady first course: how to measure algorithms, the core structures, sorting, searching, graphs and dynamic programming.',
    concepts: ['recursion', 'linked-lists', 'stacks-queues', 'quick-sort', 'merge-sort', 'binary-search', 'hash-tables', 'binary-search-trees', 'heaps', 'shortest-paths', 'dynamic-programming'],
  },
  {
    id: 'ml-foundations',
    title: 'Machine learning foundations',
    summary: 'The math and the classic models: from vectors and gradients to regression, trees, clustering and neural networks.',
    concepts: ['information-theory', 'optimizers', 'linear-regression', 'logistic-regression', 'decision-trees', 'clustering', 'neural-networks'],
  },
  {
    id: 'deep-learning',
    title: 'Deep learning and LLMs',
    summary: 'How modern models work: convolution, attention, tokens and sampling, and diffusion, with the foundations they need.',
    concepts: ['convolution', 'attention', 'language-models', 'diffusion'],
  },
];

export const getGoal = (id: string) => goals.find((g) => g.id === id);
