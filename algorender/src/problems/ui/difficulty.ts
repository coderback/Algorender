import type { Problem } from '../schema';

/** Difficulty as a pill: the feedback tokens, so each clears contrast in both themes. */
export const DIFFICULTY_STYLE: Record<Problem['difficulty'], { label: string; className: string }> = {
  easy: { label: 'Easy', className: 'bg-good-soft text-good-ink' },
  medium: { label: 'Medium', className: 'bg-warn-soft text-warn-ink' },
  hard: { label: 'Hard', className: 'bg-bad-soft text-bad-ink' },
};
