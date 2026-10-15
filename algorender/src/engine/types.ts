// Core types for the record → replay engine.
//
// An algorithm is a pure generator that yields one Frame per meaningful event.
// Running it to completion records a Trace; the player then renders any frame
// by index, so stepping back, scrubbing and deep links are just array lookups.

export type VarValue = string | number | boolean | null;

/**
 * A question about what happens in the NEXT frame, asked in Predict mode before
 * the learner may step past this frame. The frame's own note must not give the
 * answer away.
 */
export type Checkpoint = {
  question: string;
  choices: readonly string[];
  /** Index into `choices`. */
  answer: number;
};

export type Frame<S> = {
  /** Snapshot of everything the view needs. Shares unchanged parts with the previous frame. */
  state: S;
  /** Index into the pseudo-code, or null when no line applies. */
  line: number | null;
  /** One-sentence narration of what this step does and why. Also announced to screen readers. */
  note: string;
  /** Variables shown in the inspector. */
  vars: Record<string, VarValue>;
  /** Running counters (comparisons, swaps, writes, …). */
  stats: Record<string, number>;
  checkpoint?: Checkpoint;
};

export type Trace<S> = {
  frames: Frame<S>[];
  /** True when the run hit the frame cap and was cut short. */
  truncated: boolean;
};
