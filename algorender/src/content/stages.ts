// The stages of the math and ML path (the zero-to-hero plan): each one teaches
// some math, then the machine learning it unlocks, and ends with a milestone,
// a project that builds something from scratch (src/content/projects) and a
// checkpoint, a short mixed round of questions on the stage
// (/learn/checkpoint/<stage>, src/progress/checkpoint.ts).
//
// Every math and ML concept belongs to exactly one stage (stages.test.ts).
// Concepts still planned are listed too: a checkpoint asks only about the
// ones with lessons, and a study plan only schedules available ones, so each
// stage fills in as its batch lands. Client-safe: the plan and the checkpoint
// page read it.

export type Stage = {
  /** 1–10, in the order of the path. */
  id: number;
  title: string;
  /** What it covers, in a line. */
  summary: string;
  /** Its concepts, roughly in the order the path teaches them. */
  concepts: readonly string[];
};

export const stages: readonly Stage[] = [
  {
    id: 1,
    title: 'Vectors, matrices and least squares',
    summary: 'The math toolkit and linear algebra, ending in the best-fitting line as a projection.',
    concepts: [
      'functions-graphs',
      'exponents-logs',
      'sums-notation',
      'trigonometry',
      'floating-point',
      'vectors',
      'dot-product',
      'norms-distances',
      'vectors-matrices',
      'matrix-multiplication',
      'determinants-inverses',
      'span-basis-rank',
      'change-of-basis',
      'supervised-learning',
      'projections-least-squares',
    ],
  },
  {
    id: 2,
    title: 'Calculus and backpropagation',
    summary: 'Derivatives, the chain rule and Jacobians, ending in an autograd engine of your own.',
    concepts: ['contour-maps', 'derivatives-gradients', 'derivative-rules', 'chain-rule', 'taylor-approximation', 'jacobians', 'autograd', 'gradient-descent', 'optimizers', 'linear-regression'],
  },
  {
    id: 3,
    title: 'Probability, statistics and supervised learning',
    summary: 'Chance, distributions and evidence, then classifiers trained and judged honestly.',
    concepts: [
      'counting-combinatorics',
      'probability-basics',
      'probability',
      'random-variables',
      'law-of-large-numbers',
      'integrals',
      'continuous-distributions',
      'sampling-clt',
      'covariance-correlation',
      'information-theory',
      'maximum-likelihood',
      'estimation-confidence',
      'hypothesis-testing',
      'overfitting-bias-variance',
      'regularisation',
      'logistic-regression',
      'softmax-regression',
      'classification-metrics',
      'k-nearest-neighbours',
      'decision-trees',
      'stochastic-gradient-descent',
      'neural-networks',
    ],
  },
  {
    id: 4,
    title: 'Decompositions and unsupervised learning',
    summary: 'Eigenvectors, curvature and the multivariate Gaussian, then PCA, mixtures, forests and kernels.',
    concepts: [
      'orthogonality',
      'eigenvectors',
      'symmetric-matrices-spectral',
      'svd',
      'hessian-curvature',
      'convexity',
      'constrained-optimisation',
      'gaussian-multivariate',
      'pca',
      'clustering',
      'gaussian-mixtures-em',
      'random-forests',
      'svm-kernels',
      'markov-chains',
    ],
  },
  {
    id: 5,
    title: 'Training deep networks',
    summary: 'Initialisation, loss curves and normalisation, then convolutional and residual networks.',
    concepts: ['activations-initialisation', 'training-dynamics', 'normalisation', 'convolution', 'cnn-architectures', 'residual-networks'],
  },
  {
    id: 6,
    title: 'Attention and a GPT',
    summary: 'Shapes, embeddings and counting models, then attention, the transformer block and a GPT.',
    concepts: ['tensors-shapes', 'embeddings', 'ngram-models', 'attention', 'language-models', 'multi-head-positional', 'transformer-block', 'gpt-from-scratch'],
  },
  {
    id: 7,
    title: 'Inside a transformer',
    summary: 'Geometry in high dimensions, then the residual stream, circuits and sparse features.',
    concepts: ['high-dimensions', 'residual-stream-logit-lens', 'superposition', 'linear-probes-steering', 'induction-heads', 'activation-patching', 'autoencoders', 'sparse-autoencoders'],
  },
  {
    id: 8,
    title: 'Generative models',
    summary: 'Latent variables and the ELBO, variational autoencoders and diffusion.',
    concepts: ['latent-variables-elbo', 'vaes', 'diffusion', 'diffusion-in-depth'],
  },
  {
    id: 9,
    title: 'Language models in practice',
    summary: 'Scaling, fine-tuning and honest evaluation, with bandits, policy gradients and preference tuning.',
    concepts: ['scaling-efficiency', 'fine-tuning-lora', 'llm-evaluation', 'bandits', 'reinforcement-learning', 'policy-gradients', 'preference-tuning', 'retrieval-rag'],
  },
  {
    id: 10,
    title: 'Learning on graphs',
    summary: 'The graph Laplacian and spectral clustering, then message-passing networks.',
    concepts: ['graph-laplacian', 'spectral-graph-theory', 'message-passing-gnns'],
  },
];

export const getStage = (id: number) => stages.find((s) => s.id === id);

/** The stage a concept belongs to, if it is on the math and ML path. */
export const stageOf = (concept: string) => stages.find((s) => s.concepts.includes(concept));
