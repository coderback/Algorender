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
];

export function getLesson(slug: string): LessonMeta | undefined {
  return lessons.find((l) => l.slug === slug);
}
