/**
 * Every lesson, with the metadata pages and tests need. The body lives in
 * src/content/lessons/<slug>.mdx and follows the learning loop: hook → key
 * parts → see it → predict → check → recap (see src/components/lesson).
 */
export type LessonMeta = {
  slug: string;
  title: string;
  /** The concept in src/content/concepts.yaml this lesson teaches. */
  concept: string;
  summary: string;
  minutes: number;
};

export const lessons: readonly LessonMeta[] = [
  {
    slug: 'recursion',
    title: 'Recursion: watch the call stack',
    concept: 'recursion',
    summary: 'Step through recursive code line by line and see every call get its own frame, wait, and return.',
    minutes: 15,
  },
  {
    slug: 'binary-search',
    title: 'Binary search: halve it until you find it',
    concept: 'binary-search',
    summary: 'Why one comparison can rule out half of a sorted array, and how to never get the boundaries wrong.',
    minutes: 15,
  },
  {
    slug: 'two-pointers',
    title: 'Two pointers: from n² pairs to n steps',
    concept: 'two-pointers',
    summary: 'Use the order of a sorted array to rule out a value with every comparison.',
    minutes: 12,
  },
  {
    slug: 'memoization',
    title: 'Memoization: stop solving the same problem twice',
    concept: 'memoization',
    summary: 'See plain recursion explode, then tame it with a table of answers you have already found.',
    minutes: 15,
  },
  {
    slug: 'dijkstra',
    title: "Dijkstra's algorithm: settle the closest node first",
    concept: 'shortest-paths',
    summary: 'Shortest paths by greedily settling nodes in order of distance, and the one assumption that makes it work.',
    minutes: 20,
  },
  {
    slug: 'sorting-in-code',
    title: 'Bubble sort in code: read it, run it, change it',
    concept: 'quadratic-sorts',
    summary: 'Predict what real code does, run it to check, then change it and write a sort of your own, in Python, JavaScript or TypeScript.',
    minutes: 25,
  },
  {
    slug: 'linear-transformations',
    title: 'Matrices move space',
    concept: 'vectors-matrices',
    summary: 'Read a matrix by its columns: where î and ĵ land decides where every vector goes, and the determinant scales area.',
    minutes: 15,
  },
  {
    slug: 'eigenvectors',
    title: 'Eigenvectors: the directions a matrix only stretches',
    concept: 'eigenvectors',
    summary: 'Sweep a vector around the circle to find where A·v lines up with v, and see why rotations have none.',
    minutes: 15,
  },
  {
    slug: 'gradient-descent',
    title: 'Gradient descent: how models learn',
    concept: 'gradient-descent',
    summary: 'From the slope at a point to walking downhill on a loss surface, and why the step size matters so much.',
    minutes: 20,
  },
  {
    slug: 'bayes',
    title: "Bayes' rule: a 90% test that is usually wrong",
    concept: 'probability',
    summary: 'Draw everyone as a square to see why the prior matters as much as the evidence, and how to update twice.',
    minutes: 15,
  },
  {
    slug: 'central-limit-theorem',
    title: 'The central limit theorem: why averages make bells',
    concept: 'sampling-clt',
    summary: 'Average samples from lopsided or two-humped populations and watch a bell appear, with a spread of σ/√n.',
    minutes: 12,
  },
  {
    slug: 'entropy',
    title: 'Entropy and KL divergence: information in bits',
    concept: 'information-theory',
    summary: 'Measure surprise in bits, then see what believing the wrong distribution costs, the loss every classifier minimises.',
    minutes: 15,
  },
  {
    slug: 'backpropagation',
    title: 'Backpropagation: the chain rule on a graph',
    concept: 'chain-rule',
    summary: 'Watch gradients flow back through a computation graph, then write the engine yourself, micrograd style.',
    minutes: 30,
  },
  {
    slug: 'linear-regression',
    title: 'Linear regression: shrink the squares',
    concept: 'linear-regression',
    summary: 'A model, a loss and gradient descent: fit a line by shrinking squared residuals you can see, and drag the data.',
    minutes: 15,
  },
  {
    slug: 'neural-networks',
    title: 'Neural networks: why one neuron isn’t enough',
    concept: 'neural-networks',
    summary: 'See a single neuron fail on XOR, then watch hidden units bend the boundary as the network trains.',
    minutes: 20,
  },
  {
    slug: 'svd',
    title: 'SVD: a picture as a sum of simple pieces',
    concept: 'svd',
    summary: 'Rebuild pictures one rank-1 piece at a time, and see why a few pieces carry most of an image but none of the noise.',
    minutes: 15,
  },
  {
    slug: 'floating-point',
    title: 'Floating point: why 0.1 + 0.2 isn’t 0.3',
    concept: 'floating-point',
    summary: 'Read a float32 bit by bit: sign, exponent and fraction, the gaps between floats, and why == is a trap.',
    minutes: 15,
  },
  {
    slug: 'logistic-regression',
    title: 'Logistic regression: a line that gives probabilities',
    concept: 'logistic-regression',
    summary: 'A sigmoid neuron trained on cross-entropy: watch the boundary swing into place, then fail honestly on XOR.',
    minutes: 15,
  },
  {
    slug: 'k-means',
    title: 'k-means: find groups nobody labelled',
    concept: 'clustering',
    summary: 'Assign points, move centres, repeat: why k-means always stops, and why it can stop in the wrong place.',
    minutes: 12,
  },
  {
    slug: 'decision-trees',
    title: 'Decision trees and boosting: twenty questions, then many small fixes',
    concept: 'decision-trees',
    summary: 'Grow a tree by Gini splits, watch it overfit, then add up small trees fitted to the residuals.',
    minutes: 20,
  },
  {
    slug: 'convolution',
    title: 'Convolution: how networks see edges',
    concept: 'convolution',
    summary: 'Slide a 3×3 kernel over a picture to find its edges, then see what ReLU and max-pooling keep, and why the same 9 weights work everywhere.',
    minutes: 15,
  },
  {
    slug: 'attention',
    title: 'Attention: every token looks at every other',
    concept: 'attention',
    summary: 'Queries, keys and values: score with dot products, softmax into weights, blend the values, mask the future, and cache keys while generating.',
    minutes: 20,
  },
  {
    slug: 'language-models',
    title: 'How a language model writes',
    concept: 'language-models',
    summary: 'Learn tokens with byte-pair encoding, turn logits into one next word with temperature, top-k and top-p, and see why generation caches keys and values.',
    minutes: 20,
  },
  {
    slug: 'q-learning',
    title: 'Reinforcement learning: learning from rewards',
    concept: 'reinforcement-learning',
    summary: 'Watch an agent learn a gridworld from rewards alone: Q-values, the discount, and why exploring matters.',
    minutes: 20,
  },
  {
    slug: 'diffusion',
    title: 'Diffusion: generating by removing noise',
    concept: 'diffusion',
    summary: 'Noise a shape away into a blob, then watch a trained denoiser turn fresh noise back into it, one small step at a time.',
    minutes: 15,
  },
  {
    slug: 'cpu-scheduling',
    title: 'CPU scheduling: who runs next?',
    concept: 'cpu-scheduling',
    summary: 'One CPU, many processes: first come first served, shortest job first, round robin and priorities, and the waiting each one causes.',
    minutes: 15,
  },
  {
    slug: 'caching',
    title: 'Caching: LRU, LFU and page replacement',
    concept: 'caching',
    summary: 'Why hit rate decides speed, how an LRU cache evicts in O(1), and what FIFO, LRU, Clock and OPT do with pages of memory.',
    minutes: 20,
  },
  {
    slug: 'consistent-hashing',
    title: 'Consistent hashing',
    concept: 'consistent-hashing',
    summary: 'Spread a cache over servers so that adding or removing one moves only about 1/N of the keys, with a hash ring and virtual nodes.',
    minutes: 15,
  },
  {
    slug: 'queueing',
    title: 'Queueing and tail latency',
    concept: 'queueing',
    summary: 'Why a busy server is slow long before it is full, why p99 matters more than the average, and how a token bucket keeps traffic in check.',
    minutes: 20,
  },
  {
    slug: 'concurrency',
    title: 'Race conditions, locks and deadlock',
    concept: 'concurrency',
    summary: 'How two threads running count++ lose an update, how locks and atomic instructions fix it, and how locks taken in different orders deadlock.',
    minutes: 20,
  },
  {
    slug: 'storage-engines',
    title: 'Storage engines: B+ trees and LSM trees',
    concept: 'storage-engines',
    summary: 'The two ways databases keep data on disk: a B+ tree finds any key in a few page reads and scans ranges along its leaves; an LSM tree turns writes into appends and merges them later.',
    minutes: 20,
  },
  {
    slug: 'logical-clocks',
    title: 'Logical clocks: ordering without a shared clock',
    concept: 'logical-clocks',
    summary: 'Lamport timestamps give every event a number that respects cause and effect; vector clocks also tell you when two events are concurrent.',
    minutes: 15,
  },
  {
    slug: 'consensus',
    title: 'Consensus with Raft',
    concept: 'consensus',
    summary: 'How a cluster of servers agrees on one log while machines crash and the network splits: terms, elections, replication and the majority rule that keeps committed entries safe.',
    minutes: 25,
  },
];

export function getLesson(slug: string): LessonMeta | undefined {
  return lessons.find((l) => l.slug === slug);
}
