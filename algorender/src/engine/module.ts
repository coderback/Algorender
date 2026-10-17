import type { Frame } from './types';
import type { MarkKey, Tone } from '@/viz/marks';

/**
 * Which renderer draws a module's state. Each kind maps to one component in
 * src/viz/views.tsx, and the module's state type must match that view.
 */
export type ViewKind = 'array' | 'grid' | 'graph' | 'tree' | 'linear' | 'hash' | 'text' | 'memory' | 'plot';

// ───────────────────────────── inputs ─────────────────────────────

/** A named way to build an input, e.g. "Random", "Sorted", "Graph with a negative edge". */
export type InputExample<I> = {
  id: string;
  label: string;
  make: (opts: { seed: number; size: number }) => I;
  /** False for fixed examples (e.g. a hand-placed graph) that ignore the size slider; the slider hides for them. */
  sized?: boolean;
};

/**
 * Everything the input panel needs. The first example is the default. When
 * `size` is set, examples receive the chosen size and should honour it, unless
 * they set `sized: false`; otherwise examples ignore it.
 */
export type InputSpec<I> = {
  examples: readonly [InputExample<I>, ...InputExample<I>[]];
  size?: { label: string; min: number; max: number; default: number };
  custom?: {
    label: string;
    placeholder: string;
    parse: (text: string) => { value: I } | { error: string };
    format: (input: I) => string;
  };
  /**
   * Direct manipulation: the input after the learner drags the view's handle
   * `handle` to the point `to`. The explorer records the trace again, keeps
   * the current frame and stores the result as custom text, so `custom` must
   * be set and must round-trip what this returns.
   */
  drag?: (input: I, handle: string, to: readonly [number, number]) => I;
};

// ───────────────────────────── shared ─────────────────────────────

export type StatSpec = { key: string; label: string };

/**
 * A legend row: a mark with its default label, a mark with a label specific to
 * this module, or the label for unmarked elements (e.g. "Unvisited").
 */
export type LegendEntry = MarkKey | { mark: MarkKey; label: string } | { neutral: string } | { tone: Tone; label: string };

export type Content = {
  /** The hook: what it does, in plain words. Shown under the title. */
  idea: string;
  /** What stays true throughout. Spotting it is the key to understanding (and proving) it. */
  invariant: string;
  whenToUse: string;
  /** Short facts, e.g. { label: 'Stable', good: true }. good: null is neutral (neither a strength nor a weakness). */
  traits: readonly { label: string; good: boolean | null }[];
  /** Inputs worth trying, each with what to look for. `example` is an InputExample id. */
  experiments: readonly { example: string; prompt: string }[];
};

// ──────────────────────────── algorithms ───────────────────────────

/** An algorithm runs once over an input; the learner replays its trace. */
export type AlgorithmModule<I, S> = {
  kind: 'algorithm';
  slug: string;
  view: ViewKind;
  input: InputSpec<I>;
  pseudocode: readonly string[];
  stats: readonly StatSpec[];
  legend: readonly LegendEntry[];
  run: (input: I) => Generator<Frame<S>>;
  content: Content;
};

// ──────────────────────────── structures ───────────────────────────

export type ArgSpec<M = unknown> =
  | { name: string; label: string; type: 'int'; min: number; max: number; default?: number }
  | { name: string; label: string; type: 'text'; maxLength: number; placeholder?: string }
  /** Pick one of the model's current options (e.g. an existing vertex), shown as a dropdown. */
  | { name: string; label: string; type: 'choice'; options: (model: M) => readonly string[] };

export type Args = Record<string, number | string>;

/** One operation on a data structure (push, insert, search…). Returns the new model. */
export type OperationSpec<M, S> = {
  id: string;
  label: string;
  args: readonly ArgSpec<M>[];
  pseudocode: readonly string[];
  /**
   * Why the operation can't run (e.g. "The stack is empty", "There is no edge
   * A–D"), or null if it can. `args` is undefined while the form's inputs don't
   * parse yet, so checks that only need the model should not depend on it.
   * Prefer a narrated run over disabling when the attempt itself teaches
   * something (e.g. searching for a missing key).
   */
  disabledReason?: (model: M, args?: Args) => string | null;
  /** Must not mutate `model`: models are kept for undo and URL replay. */
  run: (model: M, args: Args) => Generator<Frame<S>, M>;
};

/** A data structure the learner changes with operations; each operation is its own trace. */
export type StructureModule<M, S> = {
  kind: 'structure';
  slug: string;
  view: ViewKind;
  /** Starting states. The first is the default; `seed` lets an example be random but reproducible. */
  initial: readonly [{ id: string; label: string; make: (seed: number) => M }, ...{ id: string; label: string; make: (seed: number) => M }[]];
  /** Idle view of a model, shown before any operation runs. */
  snapshot: (model: M) => S;
  operations: readonly [OperationSpec<M, S>, ...OperationSpec<M, S>[]];
  stats: readonly StatSpec[];
  legend: readonly LegendEntry[];
  content: Content;
};

// Identity helpers: they check a module against its own concrete input/state
// types, so registries can hold modules of different types.
export const defineAlgorithm = <I, S>(m: AlgorithmModule<I, S>) => m;
export const defineStructure = <M, S>(m: StructureModule<M, S>) => m;

/* eslint-disable @typescript-eslint/no-explicit-any -- registries hold modules of mixed input/state types */
export type AnyAlgorithm = AlgorithmModule<any, any>;
export type AnyStructure = StructureModule<any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */
export type AnyVisualiser = AnyAlgorithm | AnyStructure;
