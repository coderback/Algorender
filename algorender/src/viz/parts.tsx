import type { ReactNode } from 'react';
import { cx } from '@/components/ui/cx';

// The stage system's shared pieces (docs/redesign V0): every view draws its
// pointers, ranges, nodes, edges and cells from these, so one stage reads like
// every other. Marks (colours and glyphs) stay in marks.ts; this file is the
// shape around them.

/** Variables that point at something (i, j, lo, mid, current): an ink pill. */
export const POINTER_PILL = 'inline-block rounded-full bg-primary px-1.5 font-mono text-[11px] leading-[18px] font-semibold whitespace-nowrap text-on-primary';

export function Pointer({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(POINTER_PILL, className)}>{children}</span>;
}

/** A cell: 40px where there is room, 10px radius. */
export const CELL_RADIUS = 'rounded-[10px]';

/** An empty slot (a hole in an array, an unfilled table cell, a free queue slot). */
export const EMPTY_SLOT = 'rounded-[10px] border-2 border-dashed border-line-strong';

/** A value that was ruled out: it stays in place on paper grey, its text dimmed. */
export const RULED_OUT = 'bg-line-soft text-ink-muted';

/** A filled cell with no mark: white on the stage well with a hairline. */
export const PLAIN_CELL = 'bg-surface text-ink ring-1 ring-line ring-inset';

/** A small caption over a row, a lane or a panel ("array", "buffer", "front"). */
export const CAPTION = 'text-xs font-medium text-ink-muted';

/** Nodes in SVG: idle nodes are white with a grey ring; a state fills them (see marks.ts). */
export const NODE_IDLE_SVG = 'fill-surface stroke-line-strong';
export const NODE_RING = 2.5;

/** Edges: idle 2.5px grey, active 5px in its mark's colour. */
export const EDGE_IDLE = 2.5;
export const EDGE_ACTIVE = 5;
export const EDGE_IDLE_SVG = 'stroke-line-strong';

/**
 * A range under cells (a search window, a sorted run, a partition): a soft
 * bracket in the range's colour with its label under it.
 */
export function Bracket({ label, line, text }: { label?: string; line: string; text: string }) {
  return (
    <div className="flex min-w-0 flex-col items-stretch">
      <span className={cx('h-2 rounded-b-[8px] border-2 border-t-0', line)} />
      {label && <span className={cx('truncate pt-0.5 text-center text-[11px] font-semibold', text)}>{label}</span>}
    </div>
  );
}
