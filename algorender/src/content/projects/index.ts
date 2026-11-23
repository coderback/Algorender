// Milestone projects: an ordered ladder of code exercises that builds one real
// thing from scratch (least squares, micrograd, a char GPT…), closing a stage
// of the math and ML path (src/content/stages.ts). A project is done when
// every part's write (or bug) stage has passed, which is a projection of
// `exercise.passed` events (src/progress/projects.ts), so it needs no event of
// its own. Its parts usually run their tests in judge mode on the project
// budget (Exercise.judge in src/content/exercises/shared.ts).
//
// Client-safe and small: Play and the study plan read it. It must not import
// the exercises themselves; projects.test.ts checks the parts exist.
//
// The first, least squares from scratch (M1), arrived with batch B3: its
// parts are in src/content/exercises/least-squares.ts. The second, micrograd
// from scratch (M2), arrived with B4: its first two parts are the "build
// micrograd" exercises in ml.ts, the rest are in autograd.ts. The third, a
// classifier judged honestly (M3), arrived with B7: softmax regression trained
// with minibatch SGD, a confusion matrix and k-fold cross-validation, its parts
// in softmax-classifier.ts.

export type Project = {
  slug: string;
  title: string;
  /** One line for cards and the plan. */
  summary: string;
  /** The stage of the math and ML path it closes (its milestone). */
  stage: number;
  /** Its parts, in order: code exercise slugs, each done once its write (or bug) stage passes. */
  parts: readonly string[];
  /** The concepts it builds: finishing it reaches the implement level in each. */
  concepts: readonly string[];
  /** Where to see the finished thing working (a visualiser, usually). */
  showcase: { href: string; label: string };
  /** About how long it takes, for the study plan (3–5 h). */
  hours: number;
};

export const projects: readonly Project[] = [
  {
    slug: 'least-squares',
    title: 'Least squares from scratch',
    summary: 'Transpose, multiply and solve with your own code, then fit the best line and parabola through data.',
    stage: 1,
    parts: ['normal-equations', 'solve-system', 'least-squares-fit', 'fit-curves'],
    concepts: ['matrix-multiplication', 'determinants-inverses', 'projections-least-squares'],
    showcase: { href: '/visualisers/least-squares', label: 'Fit a line and a parabola' },
    hours: 4,
  },
  {
    slug: 'micrograd',
    title: 'Micrograd from scratch',
    summary: 'Write an autograd engine: each operation’s local gradient, backward in topological order, more operations, a numerical check, then train a neuron with it.',
    stage: 2,
    parts: ['value-backward', 'topological-backward', 'value-ops', 'gradient-check', 'train-neuron'],
    concepts: ['chain-rule', 'autograd'],
    showcase: { href: '/visualisers/autograd?preset=train', label: 'Train a neuron with autograd' },
    hours: 4,
  },
  {
    slug: 'softmax-classifier',
    title: 'A classifier, judged honestly',
    summary: 'Train softmax regression on three classes with your own minibatch SGD, count its answers into a confusion matrix, then score it with k-fold cross-validation on points it never saw.',
    stage: 3,
    parts: ['softmax-step', 'train-softmax', 'confusion-matrix', 'cross-validate'],
    concepts: ['softmax-regression', 'classification-metrics', 'overfitting-bias-variance'],
    showcase: { href: '/visualisers/softmax?preset=regions', label: 'Softmax regression’s three class regions' },
    hours: 5,
  },
];

export const getProject = (slug: string) => projects.find((p) => p.slug === slug);

/** The project that closes a stage, if it has one yet. */
export const projectForStage = (stage: number, list: readonly Project[] = projects) => list.find((p) => p.stage === stage);
