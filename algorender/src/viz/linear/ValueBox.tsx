'use client';

import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { MARKS, NEUTRAL, type MarkKey } from '@/viz/marks';

const TWEEN: CSSProperties = { transitionDuration: 'var(--tween, 300ms)' };

/**
 * The mark styling shared by every box in the linear and hash views: a light
 * tint and a solid top band in the mark's colour (the neutral bar colour when
 * unmarked) and the mark's glyph in a corner badge, so colour is never the only
 * cue. Dark text on a light tint stays readable for every mark.
 */
export function MarkSkin({ mark, children }: { mark: MarkKey | undefined; children?: ReactNode }) {
  const meta = mark ? MARKS[mark] : null;
  return (
    <>
      {meta && <span aria-hidden className={`pointer-events-none absolute inset-0 rounded-md opacity-20 transition-colors ${meta.bg}`} style={TWEEN} />}
      <span aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-md transition-colors ${meta ? meta.bg : NEUTRAL.bg}`} style={TWEEN} />
      {children}
      {meta && (
        <span
          aria-hidden
          className={`absolute -top-2 -right-1.5 z-10 grid h-4 min-w-4 place-items-center rounded-full bg-white px-0.5 text-[10px] leading-none font-bold shadow-sm ring-1 ring-gray-200 ${meta.text}`}
        >
          {meta.glyph}
        </span>
      )}
    </>
  );
}

/**
 * One element (a value, a key) keyed by a stable id. It shares a layoutId with
 * itself across containers, so moving between slots, holders and buckets
 * animates as real movement.
 */
export function ValueBox({ id, label, mark, className = '' }: { id: string; label: ReactNode; mark?: MarkKey; className?: string }) {
  // Callers may position the box absolutely inside a slot; otherwise it is relative, for its skin.
  const position = /\babsolute\b/.test(className) ? '' : 'relative';
  return (
    <motion.div
      layout="position"
      layoutId={id}
      className={`${position} flex items-center justify-center rounded-md bg-white font-mono font-semibold tabular-nums text-gray-900 shadow-xs ring-1 ring-inset ${
        mark ? 'ring-gray-400' : 'ring-gray-300'
      } ${className}`}
    >
      <MarkSkin mark={mark}>
        <span className="relative truncate px-1 leading-none">{label}</span>
      </MarkSkin>
    </motion.div>
  );
}
