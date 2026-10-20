import type { Exercise } from '@/content/exercises';

// The exercise ladder, apart from the Workspace (a client component) so server
// pages can count an exercise's stages.

export type Stage = 'parsons' | 'fill' | 'write' | 'bug';

export const STAGE_LABEL: Record<Stage, string> = {
  parsons: 'Order the lines',
  fill: 'Fill the gaps',
  write: 'Write it',
  bug: 'Find the bug',
};

/** The fading ladder: arrange the lines, fill gaps that grow, then write it all. A bug hunt has one stage. */
export function stagesFor(exercise: Exercise): Stage[] {
  if (exercise.kind === 'bug') return ['bug'];
  if (exercise.kind === 'modify') return ['write'];
  return ['parsons', ...(exercise.blanks ? (['fill'] as const) : []), 'write'];
}
