import type { RangeTone } from './types';

/** Background tint, bracket and label colour for highlighted spans of an array. */
export const RANGE_TONES: Record<RangeTone, { tint: string; bracket: string; text: string }> = {
  active: { tint: 'bg-blue-50', bracket: 'border-blue-300', text: 'text-blue-700' },
  left: { tint: 'bg-sky-50', bracket: 'border-sky-400', text: 'text-sky-700' },
  right: { tint: 'bg-amber-50', bracket: 'border-amber-400', text: 'text-amber-700' },
  done: { tint: 'bg-emerald-50', bracket: 'border-emerald-400', text: 'text-emerald-700' },
};
