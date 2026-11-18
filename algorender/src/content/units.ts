// The units of the language tracks (the language tracks' proposal, §1a): each
// a short run of topics, a topic being a concept on the track with a short
// lesson (theory, a predict-the-output check) and a strip of auto-checked
// tasks (src/content/tasks). A unit's last topic asks the learner to explain
// its idea back; the others don't, so a topic stays about five minutes of
// reading (assessment.test.ts).
//
// Every concept on a language track belongs to exactly one unit, and a unit
// never needs a concept from a later one (units.test.ts). Topics still
// planned are listed too, so a unit fills in as its batch lands. Client-safe.

export type Unit = {
  track: string;
  /** 1, 2, 3… in the order of the track. */
  n: number;
  title: string;
  /** Its topics, in the order to learn them. */
  concepts: readonly string[];
};

export const units: readonly Unit[] = [
  { track: 'python', n: 1, title: 'Basics', concepts: ['py-first-program', 'py-variables', 'py-numbers', 'py-strings-intro', 'py-input', 'py-booleans'] },
  { track: 'python', n: 2, title: 'Control flow', concepts: ['py-if', 'py-while', 'py-for-range', 'py-break-continue', 'py-nested-loops'] },
  { track: 'python', n: 3, title: 'Functions', concepts: ['py-functions', 'py-parameters', 'py-scope', 'py-recursion', 'py-lambdas'] },
  { track: 'python', n: 4, title: 'Collections', concepts: ['py-lists', 'py-references', 'py-tuples', 'py-dicts', 'py-sets', 'py-comprehensions', 'py-sorting'] },
  { track: 'python', n: 5, title: 'Strings', concepts: ['py-string-methods', 'py-formatting', 'py-regex'] },
  { track: 'python', n: 6, title: 'Errors', concepts: ['py-exceptions', 'py-raising'] },
  { track: 'python', n: 7, title: 'Classes', concepts: ['py-classes', 'py-dunder', 'py-inheritance', 'py-dataclasses', 'py-duck-typing'] },
  { track: 'python', n: 8, title: 'Files', concepts: ['py-files', 'py-csv-json', 'py-pathlib'] },
  { track: 'python', n: 9, title: 'Modules', concepts: ['py-modules', 'py-stdlib'] },
  { track: 'python', n: 10, title: 'Iteration', concepts: ['py-iterators', 'py-generators', 'py-itertools'] },
  { track: 'python', n: 11, title: 'Testing', concepts: ['py-asserts', 'py-test-functions', 'py-edge-cases'] },
  { track: 'python', n: 12, title: 'Idioms', concepts: ['py-enumerate-zip', 'py-unpacking', 'py-context-managers', 'py-decorators', 'py-type-hints', 'py-pythonic'] },
];

/** The unit a concept belongs to, if it is on a language track. */
export function unitOf(concept: string): Unit | undefined {
  return units.find((u) => u.concepts.includes(concept));
}

/** Whether a concept is the last topic of its unit (the one that asks for an explanation). */
export function endsUnit(concept: string): boolean {
  const u = unitOf(concept);
  return !!u && u.concepts[u.concepts.length - 1] === concept;
}

/** A track's topics in the order of its units: the "Python from zero" goal's targets. */
export function trackTopics(track: string): string[] {
  return units.filter((u) => u.track === track).flatMap((u) => u.concepts);
}
