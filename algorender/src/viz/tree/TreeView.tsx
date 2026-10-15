'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import { MARKS, type MarkKey } from '@/viz/marks';
import { layoutTree, type Box, type Metrics } from './layout';
import type { NodeId, TreeNode, TreeState } from './types';

/** Room around the tree for glyphs above the root and the probe beside a node. */
const PAD_X = 28;
const PAD_TOP = 30;
const PAD_BOTTOM = 10;
const MIN_WIDTH = 220;
/** Largest on-screen scale, so a small tree doesn't balloon on a wide screen. */
const MAX_SCALE = 1.25;
/** Tallest the drawing gets; a deeper tree is scaled down to fit. */
const MAX_HEIGHT = 560;
/** Gap between the tree and the heap's array strip. */
const STRIP_GAP = 34;

const TWEEN: CSSProperties = { transitionDuration: 'var(--tween, 300ms)' };

/** Marks dark enough to need white text on top of them; the rest take dark text. */
const DARK: ReadonlySet<MarkKey> = new Set<MarkKey>(['compare', 'swap', 'sorted', 'visited', 'found', 'path', 'reject']);
const ink = (mark: MarkKey | undefined) => (mark && DARK.has(mark) ? 'fill-white' : 'fill-gray-900');

type Placed = { id: NodeId; node: TreeNode; box: Box; x: number; y: number };

/**
 * Draws a tree as SVG. The layout is recomputed from the tree's shape in every
 * frame, and every node, key, edge and array cell is keyed by a stable id, so
 * a rotation, a sift or a B-tree split animates each element from where it was
 * to where it is now instead of jumping. The drawing scales to the available
 * width (nothing scrolls sideways) and centres on the tree, so growth on one
 * side slides the rest smoothly rather than shifting it.
 */
export function TreeView({ state }: { state: TreeState }) {
  const reduce = useReducedMotion();
  const layout = layoutTree(state);
  const m = layout.metrics;
  const strip = state.strip;
  const stripCell = strip ? Math.min(34, m.round) : 0;
  const stripW = strip ? strip.ids.length * stripCell : 0;

  const treeW = state.root == null ? 0 : layout.maxX - layout.minX;
  const treeH = state.root == null ? 0 : layout.maxY - layout.minY;
  const W = Math.max(treeW, stripW, MIN_WIDTH - 2 * PAD_X) + 2 * PAD_X;
  const stripTop = PAD_TOP + treeH + (state.root == null ? 0 : STRIP_GAP);
  const H = strip ? stripTop + stripCell + 22 + PAD_BOTTOM : PAD_TOP + treeH + PAD_BOTTOM;
  const cx = (layout.minX + layout.maxX) / 2;

  const placed: Placed[] = Object.entries(layout.boxes).map(([id, box]) => ({
    id,
    node: state.nodes[id],
    box,
    x: box.x - cx,
    y: box.y - layout.minY + PAD_TOP,
  }));
  const at = new Map(placed.map((p) => [p.id, p]));
  const onPath = new Set(state.pathEdges);
  const instant = reduce ? { duration: 0 } : undefined;

  const edges = placed.flatMap((child) => {
    const parentId = layout.parent[child.id];
    if (parentId == null) return [];
    const parent = at.get(parentId)!;
    const slot = parent.node.children.indexOf(child.id);
    const fromBox = parent.node.shape === 'box';
    return [
      {
        child,
        x1: fromBox ? parent.x - parent.box.left + m.pad + slot * m.cellW : parent.x,
        y1: fromBox ? parent.y + parent.box.h / 2 : parent.y,
        x2: child.x,
        y2: child.node.shape === 'box' ? child.y - child.box.h / 2 : child.y,
      },
    ];
  });

  const cells = placed.flatMap(({ id, node, box, x, y }) =>
    node.cells.map((cell, i) => ({
      cell,
      nodeId: id,
      box: node.shape === 'box',
      x: node.shape === 'box' ? x - box.left + m.pad + (i + 0.5) * m.cellW : x,
      y,
    })),
  );

  const probeAt = state.probe ? at.get(state.probe.at) : undefined;
  const probe = probeAt && state.probe ? probeSpot(probeAt, placed, state.probe.label, W) : null;

  return (
    <section aria-label="Tree" className="flex flex-col gap-3">
      <p className="sr-only">{state.description}</p>
      {state.root == null && (
        <p className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400" aria-hidden>
          {state.emptyLabel}
        </p>
      )}
      {(state.root != null || (strip && strip.ids.length > 0)) && (
        <svg
          viewBox={`${-W / 2} 0 ${W} ${H}`}
          className="mx-auto block h-auto w-full overflow-visible"
          style={{ maxWidth: W * MAX_SCALE, maxHeight: MAX_HEIGHT }}
          aria-hidden
        >
          <g>
            <AnimatePresence initial={false}>
              {edges.map((e) => {
                const hot = onPath.has(e.child.id);
                return (
                  <motion.line
                    key={`e:${e.child.id}`}
                    initial={{ opacity: 0, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }}
                    animate={{ opacity: 1, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, strokeWidth: hot ? 3.5 : 2 }}
                    exit={{ opacity: 0 }}
                    transition={instant}
                    strokeLinecap="round"
                    className={`transition-colors ${hot ? 'stroke-mark-done' : 'stroke-gray-300'}`}
                    style={TWEEN}
                  />
                );
              })}
            </AnimatePresence>
          </g>

          <g>
            <AnimatePresence initial={false}>
              {edges
                .filter((e) => e.child.node.edgeLabel)
                .map((e) => (
                  <EdgeLabel
                    key={`l:${e.child.id}`}
                    x={(e.x1 + e.x2) / 2}
                    y={(e.y1 + e.y2) / 2}
                    label={e.child.node.edgeLabel!}
                    hot={onPath.has(e.child.id)}
                  />
                ))}
            </AnimatePresence>
          </g>

          <g>
            <AnimatePresence initial={false}>
              {placed.map((p) =>
                p.node.shape === 'box' ? (
                  <BoxNode key={`n:${p.id}`} p={p} mark={state.marks[p.id]} instant={instant} />
                ) : (
                  <RoundNode key={`n:${p.id}`} p={p} mark={state.marks[p.id] ?? cellMark(state, p.node)} />
                ),
              )}
            </AnimatePresence>
          </g>

          <g>
            <AnimatePresence initial={false}>
              {cells.map((c) => {
                const mark = state.marks[c.cell.id] ?? (c.box ? undefined : state.marks[c.nodeId]);
                return <KeyCell key={`c:${c.cell.id}`} label={c.cell.label} x={c.x} y={c.y} box={c.box} mark={mark} m={m} />;
              })}
            </AnimatePresence>
          </g>

          <AnimatePresence initial={false}>
            {probe && <Probe key="probe" label={state.probe!.label} left={probe.left} y={probe.y} width={probe.width} />}
          </AnimatePresence>

          {strip && strip.ids.length > 0 && (
            <Strip state={state} ids={strip.ids} label={strip.label} top={stripTop} cell={stripCell} />
          )}
        </svg>
      )}
      {state.output && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm" aria-label={state.output.label}>
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{state.output.label}</span>
          {state.output.items.length === 0 ? (
            <span className="text-xs text-gray-400">none yet</span>
          ) : (
            state.output.items.map((item, i) => (
              // The list only grows at the end, so positions are stable keys.
              <span key={i} className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-800 ring-1 ring-emerald-200">
                {item}
              </span>
            ))
          )}
        </div>
      )}
    </section>
  );
}

/** A round node's mark may be set on its key instead of the node. */
function cellMark(state: TreeState, node: TreeNode): MarkKey | undefined {
  return node.cells.length ? state.marks[node.cells[0].id] : undefined;
}

function Glyph({ mark, x, y }: { mark: MarkKey; x: number; y: number }) {
  const meta = MARKS[mark];
  return (
    <g>
      <circle cx={x} cy={y} r={7.5} strokeWidth={1.5} className={`fill-white ${meta.stroke}`} />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={meta.glyph.length > 1 ? 6.5 : 10}
        className={`fill-current font-bold ${meta.text}`}
      >
        {meta.glyph}
      </text>
    </g>
  );
}

function RoundNode({ p, mark }: { p: Placed; mark: MarkKey | undefined }) {
  const r = p.box.h / 2;
  const meta = mark ? MARKS[mark] : null;
  const badges = p.node.badges;
  return (
    <motion.g initial={{ opacity: 0, x: p.x, y: p.y }} animate={{ opacity: 1, x: p.x, y: p.y }} exit={{ opacity: 0 }}>
      {p.node.terminal && <circle r={r + 4} fill="none" strokeWidth={2} className="stroke-gray-700" />}
      <circle
        r={r}
        strokeWidth={meta ? 2.5 : 2}
        className={`transition-colors ${meta ? `${meta.fill} ${meta.stroke}` : 'fill-white stroke-bar'}`}
        style={TWEEN}
      />
      {badges?.top && (
        <text
          x={r + 2}
          y={-r + 5}
          fontSize={10}
          dominantBaseline="central"
          className={`font-mono ${badges.alert ? 'fill-mark-swap font-bold' : 'fill-gray-600'}`}
        >
          {badges.top}
        </text>
      )}
      {badges?.bottom && (
        <text x={r + 2} y={r - 4} fontSize={10} dominantBaseline="central" className="fill-gray-400 font-mono">
          {badges.bottom}
        </text>
      )}
      {mark && <Glyph mark={mark} x={-r * 0.85} y={-r * 0.85} />}
    </motion.g>
  );
}

function BoxNode({ p, mark, instant }: { p: Placed; mark: MarkKey | undefined; instant: { duration: number } | undefined }) {
  const meta = mark ? MARKS[mark] : null;
  const left = p.x - p.box.left;
  const top = p.y - p.box.h / 2;
  return (
    <motion.g initial={{ opacity: 0, x: left, y: top }} animate={{ opacity: 1, x: left, y: top }} exit={{ opacity: 0 }}>
      <motion.rect
        initial={false}
        animate={{ width: p.box.w }}
        transition={instant}
        height={p.box.h}
        rx={6}
        strokeWidth={meta ? 3 : 1.5}
        className={`fill-white transition-colors ${meta ? meta.stroke : 'stroke-gray-400'}`}
        style={TWEEN}
      />
      {mark && <Glyph mark={mark} x={-3} y={-3} />}
    </motion.g>
  );
}

function KeyCell({ label, x, y, box, mark, m }: { label: string; x: number; y: number; box: boolean; mark: MarkKey | undefined; m: Metrics }) {
  const meta = mark ? MARKS[mark] : null;
  const fontSize = label.length > 2 ? m.font - 3 : m.font;
  return (
    <motion.g initial={{ opacity: 0, x, y }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0 }}>
      {box && (
        <rect
          x={-m.cellW / 2 + 1.5}
          y={-m.cellH / 2}
          width={m.cellW - 3}
          height={m.cellH}
          rx={4}
          strokeWidth={1}
          className={`transition-colors ${meta ? `${meta.fill} ${meta.stroke}` : 'fill-white stroke-gray-300'}`}
          style={TWEEN}
        />
      )}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        className={`font-mono font-semibold tabular-nums transition-colors ${ink(mark)}`}
        style={TWEEN}
      >
        {label}
      </text>
      {box && mark && <Glyph mark={mark} x={0} y={-m.cellH / 2 - m.pad - 8} />}
    </motion.g>
  );
}

function EdgeLabel({ x, y, label, hot }: { x: number; y: number; label: string; hot: boolean }) {
  return (
    <motion.g initial={{ opacity: 0, x, y }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0 }}>
      <rect
        x={-8}
        y={-9}
        width={16}
        height={18}
        rx={4}
        strokeWidth={hot ? 2 : 1}
        className={`fill-white transition-colors ${hot ? 'stroke-mark-done' : 'stroke-gray-300'}`}
        style={TWEEN}
      />
      <text textAnchor="middle" dominantBaseline="central" fontSize={12} className={`font-mono font-bold ${hot ? 'fill-emerald-800' : 'fill-gray-700'}`}>
        {label}
      </text>
    </motion.g>
  );
}

/**
 * Where the probe sits: beside its node on whichever side has room before the
 * next node on the same level (right first), or above the node when neither
 * side does. Levels are far enough apart that a pill beside a node never
 * reaches another level.
 */
function probeSpot(p: Placed, placed: readonly Placed[], label: string, W: number): { left: number; y: number; width: number } {
  const width = label.length * 7.5 + 12;
  const margin = 5;
  let rightLimit = W / 2;
  let leftLimit = -W / 2;
  for (const o of placed) {
    if (o.box.depth !== p.box.depth || o.id === p.id) continue;
    if (o.x > p.x) rightLimit = Math.min(rightLimit, o.x - o.box.left);
    else leftLimit = Math.max(leftLimit, o.x + o.box.right);
  }
  const rightStart = p.x + p.box.right + margin;
  if (rightLimit - rightStart >= width + margin) return { left: rightStart, y: p.y, width };
  const leftEnd = p.x - p.box.left - margin;
  if (leftEnd - leftLimit >= width + margin) return { left: leftEnd - width, y: p.y, width };
  return { left: p.x - width / 2, y: p.y - p.box.h / 2 - 15, width };
}

/** The key being inserted or searched for, travelling beside the node it is compared with. */
function Probe({ label, left, y, width }: { label: string; left: number; y: number; width: number }) {
  return (
    <motion.g initial={{ opacity: 0, x: left, y }} animate={{ opacity: 1, x: left, y }} exit={{ opacity: 0 }}>
      <rect y={-10} width={width} height={20} rx={10} strokeWidth={2} className={`fill-white ${MARKS.key.stroke}`} />
      <text x={width / 2} textAnchor="middle" dominantBaseline="central" fontSize={12} className="fill-gray-900 font-mono font-bold">
        {label}
      </text>
    </motion.g>
  );
}

/** A heap's array, with the same ids as the tree's nodes, so a swap moves both. */
function Strip({ state, ids, label, top, cell }: { state: TreeState; ids: readonly NodeId[]; label: string; top: number; cell: number }) {
  const left = (-ids.length * cell) / 2;
  const labelOf = (id: NodeId) => state.nodes[id]?.cells[0]?.label ?? '';
  return (
    <g>
      <text x={left} y={top - 8} fontSize={10} className="fill-gray-500 font-semibold uppercase" letterSpacing={1}>
        {label}
      </text>
      <AnimatePresence initial={false}>
        {ids.map((id, i) => {
          const mark = state.marks[id];
          const meta = mark ? MARKS[mark] : null;
          const x = left + (i + 0.5) * cell;
          const y = top + cell / 2;
          return (
            <motion.g key={`s:${id}`} initial={{ opacity: 0, x, y }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0 }}>
              <rect
                x={-cell / 2 + 1}
                y={-cell / 2}
                width={cell - 2}
                height={cell}
                rx={4}
                strokeWidth={meta ? 2 : 1}
                className={`transition-colors ${meta ? `${meta.fill} ${meta.stroke}` : 'fill-white stroke-gray-300'}`}
                style={TWEEN}
              />
              <text textAnchor="middle" dominantBaseline="central" fontSize={12} className={`font-mono font-semibold ${ink(mark)}`}>
                {labelOf(id)}
              </text>
            </motion.g>
          );
        })}
      </AnimatePresence>
      {ids.map((_, i) => (
        // Index labels are fixed positions under the array, so the index is their identity.
        <text key={i} x={left + (i + 0.5) * cell} y={top + cell + 11} textAnchor="middle" fontSize={10} className="fill-gray-400 font-mono">
          {i}
        </text>
      ))}
    </g>
  );
}
