// Code exercises: the learner writes (or fixes) an algorithm in Python,
// JavaScript or TypeScript, and their own code drives the views (src/workspace).
// The model lives in shared.ts; each file below adds one family.

import { arrayExercises, bugHunts, modifyExercises } from './arrays';
import { gridExercises } from './grids';
import type { Exercise } from './shared';

export * from './shared';
export { arrayArgs, type ArrayInput } from './arrays';

export const exercises: Exercise[] = [...arrayExercises, ...gridExercises, ...modifyExercises, ...bugHunts];

export function getExercise(slug: string): Exercise | undefined {
  return exercises.find((e) => e.slug === slug);
}

/** The write-it-yourself exercise for a visualiser, if there is one. */
export function exerciseForVisualiser(slug: string): Exercise | undefined {
  return exercises.find((e) => e.visualiser === slug && e.kind === 'write');
}
