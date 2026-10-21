'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useId } from 'react';
import { cx } from '@/components/ui/cx';
import { MARKS, type MarkKey } from '@/viz/marks';
import { fillFor, MarkBadge, Pointer, STAGE_CAPTION } from '@/viz/parts';
import type { ListNode, ListState } from './types';
import { useWidth } from './useWidth';

// Geometry in CSS pixels. Nodes are [value | next] boxes; rows wrap to the width.
const NODE_W = 82;
const VALUE_W = 50;
const NODE_H = 44;
const GAP = 36;
/** Room above a row for pointer labels (head, cur…), stacked upwards. */
const LABELS_H = 40;
/** Room below a row for detached nodes (being linked in or just unlinked) and their labels. */
const BELOW_H = 84;
const ROW_H = LABELS_H + NODE_H + BELOW_H;
/** How far below its row a detached node sits. */
const DROP = NODE_H + 26;
const LABEL_STEP = 21;

type Pos = { x: number; y: number; lowered: boolean };

/**
 * A singly linked list: node boxes positioned explicitly (so rows can wrap and
 * detached nodes can hang below the row) with SVG next-pointer arrows computed
 * from the same positions. Arrows always have the same shape (six points), so
 * Motion can tween them as pointers are rewired.
 */
export function ListView({ state }: { state: ListState }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [ref, width] = useWidth<HTMLDivElement>();

  const span = Math.max(1, state.order.length, ...state.detached.map((d) => Math.floor(d.at) + 1));
  const fit = Math.max(2, Math.floor((width + GAP) / (NODE_W + GAP)));
  const cols = Math.min(span, fit);
  const rows = Math.ceil(span / cols);
  const contentW = cols * (NODE_W + GAP) - GAP;
  const offsetX = Math.max(0, (width - contentW) / 2);
  const height = rows * ROW_H;

  const place = (col: number, lowered: boolean): Pos => {
    const row = Math.min(rows - 1, Math.max(0, Math.floor(col / cols)));
    const c = Math.min(cols - 1, Math.max(0, col - row * cols));
    return { x: offsetX + c * (NODE_W + GAP), y: row * ROW_H + LABELS_H + (lowered ? DROP : 0), lowered };
  };
  const pos = new Map<string, Pos>();
  state.order.forEach((id, k) => id && pos.set(id, place(k, false)));
  for (const d of state.detached) pos.set(d.id, place(d.at, true));

  const nodes = Object.values(state.nodes).filter((n) => pos.has(n.id));
  const arrows = nodes.flatMap((n) => (n.next && pos.has(n.next) ? [{ from: n.id, d: route(pos.get(n.id)!, pos.get(n.next)!) }] : []));
  const linkMarks = [...new Set(Object.values(state.linkMarks))];

  // Pointer labels: stacked above a row node, or below a detached one.
  const stacked = new Map<string, number>();
  const labels = state.pointers.flatMap((p) => {
    if (!p.target || !pos.has(p.target)) return [];
    const k = stacked.get(p.target) ?? 0;
    stacked.set(p.target, k + 1);
    const at = pos.get(p.target)!;
    return [{ label: p.label, x: at.x, y: at.lowered ? at.y + NODE_H + 4 + k * LABEL_STEP : at.y - 22 - k * LABEL_STEP, below: at.lowered }];
  });
  const nullPointers = state.pointers.filter((p) => p.target == null);

  return (
    <div ref={ref} className="w-full">
      <p className="sr-only">{describe(state)}</p>
      {/* Drawn once the width is known (before the first paint), so nodes don't animate in from a provisional layout. */}
      {width > 0 && (
        <div aria-hidden>
          <p className={STAGE_CAPTION}>{state.summary}</p>
          <div className="flex h-7 flex-wrap items-center gap-x-4 font-mono text-[11px] text-ink-muted">
            {nullPointers.map((p) => (
              <span key={p.label}>
                <Pointer>{p.label}</Pointer> = null
              </span>
            ))}
          </div>
          <div className="relative w-full overflow-hidden" style={{ height }}>
            {state.order.length === 0 && state.detached.length === 0 && (
              <div className="absolute inset-x-0 grid place-items-center text-sm text-ink-muted" style={{ top: LABELS_H, height: NODE_H }}>
                empty list
              </div>
            )}
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <defs>
                <Arrowhead id={`${uid}-neutral`} className="fill-ink-faint" />
                {linkMarks.map((m) => (
                  <Arrowhead key={m} id={`${uid}-${m}`} className={MARKS[m].fill} />
                ))}
              </defs>
              <AnimatePresence initial={false}>
                {arrows.map((a) => {
                  const mark = state.linkMarks[a.from];
                  return (
                    <motion.path
                      key={a.from}
                      initial={{ opacity: 0, d: a.d }}
                      animate={{ opacity: 1, d: a.d }}
                      exit={{ opacity: 0 }}
                      fill="none"
                      strokeWidth={mark ? 3.5 : 2.5}
                      strokeLinejoin="round"
                      markerEnd={`url(#${uid}-${mark ?? 'neutral'})`}
                      className={`transition-colors ${mark ? MARKS[mark].stroke : 'stroke-ink-faint'}`}
                    />
                  );
                })}
              </AnimatePresence>
            </svg>
            <AnimatePresence initial={false}>
              {nodes.map((n) => {
                const p = pos.get(n.id)!;
                return (
                  <motion.div
                    key={n.id}
                    className="absolute top-0 left-0"
                    initial={{ opacity: 0, scale: 0.8, x: p.x, y: p.y }}
                    animate={{ opacity: 1, scale: 1, x: p.x, y: p.y }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <NodeBox node={n} mark={state.marks[n.id]} linkMark={state.linkMarks[n.id]} />
                  </motion.div>
                );
              })}
              {labels.map((l) => (
                <motion.div
                  key={`ptr-${l.label}`}
                  className="absolute top-0 left-0 flex justify-center"
                  style={{ width: VALUE_W }}
                  initial={{ opacity: 0, x: l.x, y: l.y }}
                  animate={{ opacity: 1, x: l.x, y: l.y }}
                  exit={{ opacity: 0 }}
                >
                  <Pointer>{l.below ? `↑ ${l.label}` : `${l.label} ↓`}</Pointer>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

function NodeBox({ node, mark, linkMark }: { node: ListNode; mark: MarkKey | undefined; linkMark: MarkKey | undefined }) {
  return (
    // A node is its value (filled in its mark) and its next pointer (white, with a dot where the arrow leaves).
    <div className="relative flex font-mono" style={{ width: NODE_W, height: NODE_H }}>
      <span className={cx('grid place-items-center rounded-l-[12px] text-sm font-semibold tabular-nums transition-colors', fillFor(mark))} style={{ width: VALUE_W }}>
        {node.value}
      </span>
      <span className="grid flex-1 place-items-center rounded-r-[12px] bg-surface ring-1 ring-line ring-inset">
        {node.next ? (
          <span className={`h-2 w-2 rounded-full ${linkMark ? MARKS[linkMark].bg : 'bg-ink-muted'}`} />
        ) : (
          <span className="text-xs text-ink-muted">∅</span>
        )}
      </span>
      <MarkBadge mark={mark} />
    </div>
  );
}

function Arrowhead({ id, className }: { id: string; className: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M0,1 L10,5 L0,9 z" className={className} />
    </marker>
  );
}

/**
 * A next-pointer from a node's dot to its target, as a six-point polyline:
 * straight along a row, otherwise out to the right, across, and into the
 * target from above or below.
 */
function route(s: Pos, t: Pos): string {
  const sx = s.x + VALUE_W + (NODE_W - VALUE_W) / 2;
  const sy = s.y + NODE_H / 2;
  let pts: [number, number][];
  if (Math.abs(t.y - s.y) < 1 && t.x > s.x) {
    const ex = t.x - 1;
    const ey = t.y + NODE_H / 2;
    pts = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => [sx + (ex - sx) * f, sy + (ey - sy) * f]);
  } else {
    const out = s.x + NODE_W + 10;
    const ex = t.x + VALUE_W / 2;
    let midY: number;
    let ey: number;
    if (t.y > s.y + 1) {
      // Target lower: hanging below this row, or the first node of the next row.
      ey = t.y - 1;
      midY = t.y - s.y >= ROW_H - 1 ? t.y - LABELS_H + 2 : (s.y + NODE_H + t.y) / 2;
    } else {
      // Target higher (a detached node pointing back into the row), or level but to the left.
      ey = t.y + NODE_H + 1;
      midY = t.y < s.y - 1 ? (t.y + NODE_H + s.y) / 2 : s.y + NODE_H + 14;
    }
    pts = [
      [sx, sy],
      [out, sy],
      [out, midY],
      [(out + ex) / 2, midY],
      [ex, midY],
      [ex, ey],
    ];
  }
  return `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`;
}

function describe(state: ListState): string {
  const head = state.pointers.find((p) => p.label === 'head')?.target ?? null;
  const chain: string[] = [];
  const seen = new Set<string>();
  for (let cur = head; cur && !seen.has(cur); cur = state.nodes[cur].next) {
    seen.add(cur);
    chain.push(String(state.nodes[cur].value));
  }
  const parts = [`${state.summary}.`, `From head: ${[...chain, 'null'].join(' → ')}.`];
  const loose = Object.values(state.nodes).filter((n) => !seen.has(n.id));
  if (loose.length) parts.push(`Not reachable from head: ${loose.map((n) => `${n.value}${n.next ? ` (points at ${state.nodes[n.next]?.value})` : ''}`).join(', ')}.`);
  const named = state.pointers.filter((p) => p.label !== 'head');
  if (named.length) parts.push(named.map((p) => `${p.label} = ${p.target ? state.nodes[p.target]?.value : 'null'}`).join(', ') + '.');
  return parts.join(' ');
}
