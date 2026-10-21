import { describe, expect, it } from 'vitest';
import { cx } from './cx';

describe('cx', () => {
  it('lets a caller override a primitive for the same property', () => {
    expect(cx('flex flex-col gap-3.5 rounded-card p-6', 'flex-row gap-7 rounded-[36px] p-8')).toBe('flex flex-row gap-7 rounded-[36px] p-8');
    expect(cx('inline-flex bg-sunken', 'hidden sm:inline-flex')).toBe('bg-sunken hidden sm:inline-flex');
    expect(cx('rounded-card', 'rounded-tile')).toBe('rounded-tile');
  });

  it('keeps the theme’s sizes apart from its colours', () => {
    expect(cx('font-display text-title-card', 'text-track-lilac-title')).toBe('font-display text-title-card text-track-lilac-title');
    expect(cx('text-eyebrow text-ink-muted uppercase')).toBe('text-eyebrow text-ink-muted uppercase');
    expect(cx('text-sm', 'text-number-tile')).toBe('text-number-tile');
    expect(cx('bg-sunken text-ink-soft', 'bg-surface')).toBe('text-ink-soft bg-surface');
  });
});
