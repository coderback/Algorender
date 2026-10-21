import type { RangeTone } from './types';

/** Tint, bracket and label colour for highlighted spans (arrays draw the bracket under the cells; strings also tint behind them). */
export const RANGE_TONES: Record<RangeTone, { tint: string; bracket: string; text: string }> = {
  active: { tint: 'bg-accent-soft', bracket: 'border-accent', text: 'text-accent-ink' },
  left: { tint: 'bg-mark-frontier/10', bracket: 'border-mark-frontier', text: 'text-mark-frontier-ink' },
  right: { tint: 'bg-mark-focus/10', bracket: 'border-mark-focus', text: 'text-mark-focus-ink' },
  done: { tint: 'bg-mark-done/10', bracket: 'border-mark-done', text: 'text-mark-done-ink' },
};
