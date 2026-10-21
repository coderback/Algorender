'use client';

import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { cx } from '@/components/ui/cx';
import type { MarkKey } from '@/viz/marks';
import { fillFor, MarkBadge } from '@/viz/parts';

const TWEEN: CSSProperties = { transitionDuration: 'var(--tween, 300ms)' };

/**
 * One element (a value, a key) keyed by a stable id: filled in its mark's
 * colour (the neutral bar colour when unmarked) with the mark's glyph in a
 * corner badge (V2). It shares a layoutId with
 * itself across containers, so moving between slots, holders and buckets
 * animates as real movement.
 */
export function ValueBox({ id, label, mark, className = '' }: { id: string; label: ReactNode; mark?: MarkKey; className?: string }) {
  // Callers may position the box absolutely inside a slot; otherwise it is relative, for its badge.
  const position = /\babsolute\b/.test(className) ? '' : 'relative';
  return (
    <motion.div
      layout="position"
      layoutId={id}
      className={cx(position, 'flex items-center justify-center rounded-[10px] font-mono font-semibold tabular-nums transition-colors', fillFor(mark), className)}
      style={TWEEN}
    >
      <span className="relative truncate px-1 leading-none">{label}</span>
      <MarkBadge mark={mark} />
    </motion.div>
  );
}
