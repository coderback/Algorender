import type { HeapObject, MemValue } from '@/workspace/protocol';

/**
 * A memory diagram, Python-Tutor style: the call stack on the left, objects on
 * the right, arrows from names to the objects they refer to. Frames and
 * objects keep their ids across a run, so they animate in place.
 */
export type MemoryState = {
  frames: {
    id: string;
    fn: string;
    locals: { name: string; value: MemValue; changed: boolean }[];
    /** The innermost frame, where the current line is. */
    active: boolean;
    /** Set on the step a function returns. */
    returning?: MemValue;
  }[];
  heap: {
    object: HeapObject;
    /** Its contents differ from the previous step. */
    changed: boolean;
    /** It first appears on this step. */
    fresh: boolean;
  }[];
  /** Everything printed so far, one entry per print. */
  output: string[];
};
