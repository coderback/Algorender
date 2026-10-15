import type { Mark, RangeTone } from './types';

/** Colour + glyph + wording for each mark. Shared by the bars and the legend. */
export const MARKS: Record<Mark, { label: string; glyph: string; bar: string; text: string }> = {
  compare: { label: 'Comparing', glyph: '◆', bar: 'bg-mark-compare', text: 'text-mark-compare' },
  swap: { label: 'Swapping', glyph: '⇄', bar: 'bg-mark-swap', text: 'text-mark-swap' },
  write: { label: 'Written', glyph: '↓', bar: 'bg-mark-write', text: 'text-mark-write' },
  pivot: { label: 'Pivot', glyph: 'P', bar: 'bg-mark-focus', text: 'text-amber-700' },
  min: { label: 'Smallest so far', glyph: 'min', bar: 'bg-mark-focus', text: 'text-amber-700' },
  key: { label: 'Current value', glyph: '●', bar: 'bg-mark-focus', text: 'text-amber-700' },
  sorted: { label: 'In final place', glyph: '✓', bar: 'bg-mark-sorted', text: 'text-mark-sorted' },
};

export const DEFAULT_BAR = 'bg-bar';

export const RANGE_TONES: Record<RangeTone, { tint: string; bracket: string; text: string }> = {
  active: { tint: 'bg-blue-50', bracket: 'border-blue-300', text: 'text-blue-700' },
  left: { tint: 'bg-sky-50', bracket: 'border-sky-400', text: 'text-sky-700' },
  right: { tint: 'bg-amber-50', bracket: 'border-amber-400', text: 'text-amber-700' },
  done: { tint: 'bg-emerald-50', bracket: 'border-emerald-400', text: 'text-emerald-700' },
};
