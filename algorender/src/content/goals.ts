// Study-plan goals: each names the concepts it aims at. A plan
// (src/progress/plan.ts) adds everything they build on, drops what the learner
// already knows, and schedules the rest. Concept ids are checked against
// src/content/concepts.yaml by content.test.ts.

import { trackTopics } from './units';

export type Goal = {
  id: string;
  title: string;
  summary: string;
  /** The concepts the goal is reached at, in the order to learn them; their prerequisites come along, each just before it is needed. */
  concepts: readonly string[];
  /** The goal aims at interviews: its plan keeps time each week for a mock interview (src/progress/plan.ts). */
  interviews?: boolean;
};

export const goals: readonly Goal[] = [
  {
    id: 'interviews',
    title: 'Coding interviews',
    summary: 'The patterns behind most interview problems, each with practice problems judged in your language.',
    interviews: true,
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
  {
    // The zero-to-hero path: its targets are mostly planned, and plans leave
    // planned concepts out (goalConcepts in src/progress/plan.ts), so the goal
    // grows on its own as each batch makes its concepts available.
    id: 'ml-zero-to-hero',
    title: 'Machine learning from zero',
    summary:
      'From school math to transformers, diffusion, interpretability and graph networks: each idea seen, predicted and built from scratch. You need to be able to write a loop and a function in Python or JavaScript.',
    concepts: [
      'projections-least-squares',
      'autograd',
      'neural-networks',
      'classification-metrics',
      'regularisation',
      'k-nearest-neighbours',
      'pca',
      'gaussian-mixtures-em',
      'svm-kernels',
      'random-forests',
      'residual-networks',
      'gpt-from-scratch',
      'linear-probes-steering',
      'activation-patching',
      'sparse-autoencoders',
      'diffusion-in-depth',
      'scaling-efficiency',
      'fine-tuning-lora',
      'llm-evaluation',
      'preference-tuning',
      'message-passing-gnns',
    ],
  },
  {
    // The Python track, every topic in the order of its units. Plans leave
    // planned topics out, so the goal grows as each batch of topics lands.
    id: 'python-from-zero',
    title: 'Python from zero',
    summary: 'Programming from the very first line: values and names, decisions and loops, functions, lists and dictionaries, each run line by line so you can watch what it does.',
    concepts: trackTopics('python'),
  },
];

export const getGoal = (id: string) => goals.find((g) => g.id === id);
