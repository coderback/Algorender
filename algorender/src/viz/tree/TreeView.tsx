'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, type CSSProperties } from 'react';
import { useWidth } from '@/viz/linear/useWidth';
import { MARKS, type MarkKey } from '@/viz/marks';
import { labelWidth, layoutTree, rootsOf, type Box, type Metrics, type TreeLayout } from './layout';
import type { NodeId, TableRow, TreeNode, TreeState } from './types';

/** Room around the tree for glyphs above the root and the probe beside a node. */
const PAD_X = 28;
const PAD_TOP = 30;
const PAD_BOTTOM = 10;
/** Search trees and forests have no probe, so they keep less room around them. */
const COMPACT_PAD_X = 14;
const COMPACT_PAD_TOP = 16;
const MIN_WIDTH = 220;
/** Largest on-screen scale, so a small tree doesn't balloon on a wide screen. */
const MAX_SCALE = 1.25;
/** Tallest the drawing gets; a deeper tree is scaled down to fit. */
const MAX_HEIGHT = 560;
/** Gap between the tree and the heap's array strip. */
const STRIP_GAP = 34;
/** Gap above the table, and its cell size. */
const TABLE_GAP = 26;
const TABLE_CELL = 26;
const TABLE_ROW_GAP = 6;
/** A search tree drawn smaller than this on screen is turned sideways if that draws it bigger. */
const MIN_SEARCH_SCALE = 0.8;

const TWEEN: CSSProperties = { transitionDuration: 'var(--tween, 300ms)' };

/** Marks dark enough to need white text on top of them; the rest take dark text. */
const DARK: ReadonlySet<MarkKey> = new Set<MarkKey>(['compare', 'swap', 'sorted', 'visited', 'found', 'path', 'reject']);
const ink = (mark: MarkKey | undefined) => (mark && DARK.has(mark) ? 'fill-white' : 'fill-gray-900');

type Placed = { id: NodeId; node: TreeNode; box: Box; x: number; y: number };
type Point = { x: number; y: number };

/** Where the table sits and how wide its label column is. */
type TableGeometry = { labelW: number; width: number; height: number };

function tableGeometry(rows: readonly TableRow[]): TableGeometry | null {
  if (rows.length === 0) return null;
  const labelW = Math.max(...rows.map((r) => labelWidth(r.label, 10))) + 6;
  const cells = Math.max(...rows.map((r) => r.cells.length));
  return { labelW, width: labelW + cells * TABLE_CELL, height: rows.length * (TABLE_CELL + TABLE_ROW_GAP) - TABLE_ROW_GAP };
}

/** The drawing's size in SVG units, and where the strip and table go. */
function frameOf(state: TreeState, layout: TreeLayout) {
  const m = layout.metrics;
  const compact = state.search === true || state.roots != null;
  const padX = compact ? COMPACT_PAD_X : PAD_X;
  const padTop = compact ? COMPACT_PAD_TOP : PAD_TOP;
  const hasTree = rootsOf(state).length > 0;
  const strip = state.strip;
  const stripCell = strip ? Math.min(34, m.round) : 0;
  const stripW = strip ? strip.ids.length * stripCell : 0;
  const table = tableGeometry(state.table ?? []);

  const treeW = hasTree ? layout.maxX - layout.minX : 0;
  const treeH = hasTree ? layout.maxY - layout.minY : 0;
  const W = Math.max(treeW, stripW, table?.width ?? 0, MIN_WIDTH - 2 * padX) + 2 * padX;
  const stripTop = padTop + treeH + (hasTree ? STRIP_GAP : 0);
  let bottom = strip ? stripTop + stripCell + 22 : padTop + treeH;
  const tableTop = bottom + (hasTree || strip ? TABLE_GAP : 0);
  if (table) bottom = tableTop + table.height;
  return { W, H: bottom + PAD_BOTTOM, padTop, stripTop, stripCell, tableTop, table, hasTree };
}

/**
 * A search tree too wide to read on a narrow screen is drawn sideways (root on
 * the left, leaves in a column), where a phone has room. Other trees always
 * grow downwards.
 */
function chooseLayout(state: TreeState, width: number): TreeLayout {
  const down = layoutTree(state);
  if (!state.search || width <= 0) return down;
  const scale = (layout: TreeLayout) => {
    const { W, H } = frameOf(state, layout);
    return Math.min(MAX_SCALE, width / W, MAX_HEIGHT / H);
  };
  const downScale = scale(down);
  if (downScale >= MIN_SEARCH_SCALE) return down;
  const side = layoutTree(state, { sideways: true });
  return scale(side) > downScale ? side : down;
}

/**
 * Draws a tree as SVG. The layout is recomputed from the tree's shape in every
 * frame, and every node, key, edge and array cell is keyed by a stable id, so
 * a rotation, a sift or a B-tree split animates each element from where it was
 * to where it is now instead of jumping. The drawing scales to the available
 * width (nothing scrolls sideways) and centres on the tree, so growth on one
 * side slides the rest smoothly rather than shifting it.
 *
 * Also draws forests (union-find: trees side by side, edges as arrows up to
 * the parent, the arrays as a table underneath) and search trees (every call
 * laid out up front, revealed as the search reaches it, each new call growing
 * out of its parent).
 */
export function TreeView({ state }: { state: TreeState }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [ref, width] = useWidth<HTMLElement>();
  const layout = chooseLayout(state, width);
  const m = layout.metrics;
  const { W, H, padTop, stripTop, stripCell, tableTop, table, hasTree } = frameOf(state, layout);
  const strip = state.strip;
  const cx = (layout.minX + layout.maxX) / 2;
  const search = state.search === true;

  const all: Placed[] = Object.entries(layout.boxes).map(([id, box]) => ({
    id,
    node: state.nodes[id],
    box,
    x: box.x - cx,
    y: box.y - layout.minY + padTop,
  }));
  const at = new Map(all.map((p) => [p.id, p]));
  const placed = all.filter((p) => !p.node.hidden);
  const onPath = new Set(state.pathEdges);
  const instant = reduce ? { duration: 0 } : undefined;
  /** Where a new node starts: its parent's spot in a growing search tree, its own spot otherwise. */
  const origin = (p: Placed): Point => {
    const parent = search ? at.get(layout.parent[p.id]) : undefined;
    return parent ? { x: parent.x, y: parent.y } : { x: p.x, y: p.y };
  };

  const edges = placed.flatMap((child) => {
    const parentId = layout.parent[child.id];
    if (parentId == null) return [];
    const parent = at.get(parentId)!;
    if (state.parentArrows) {
      // From the child's rim to the parent's rim, so the arrowhead touches the parent.
      const dx = parent.x - child.x;
      const dy = parent.y - child.y;
      const len = Math.hypot(dx, dy) || 1;
      const rc = child.box.h / 2;
      const rp = parent.box.h / 2 + 1.5;
      return [{ child, from: parent, x1: child.x + (dx / len) * rc, y1: child.y + (dy / len) * rc, x2: parent.x - (dx / len) * rp, y2: parent.y - (dy / len) * rp }];
    }
    const slot = parent.node.children.indexOf(child.id);
    const fromBox = parent.node.shape === 'box';
    return [
      {
        child,
        from: parent,
        x1: fromBox ? parent.x - parent.box.left + m.pad + slot * m.cellW : parent.x,
        y1: fromBox ? parent.y + parent.box.h / 2 : parent.y,
        x2: child.x,
        y2: child.node.shape === 'box' ? child.y - child.box.h / 2 : child.y,
      },
    ];
  });

  const labels = edgeLabels(all, placed, layout, search);

  const cells = placed.flatMap((p) =>
    p.node.cells.map((cell, i) => ({
      cell,
      p,
      box: p.node.shape === 'box',
      x: p.node.shape === 'box' ? p.x - p.box.left + m.pad + (i + 0.5) * m.cellW : p.x,
      y: p.y,
    })),
  );

  const probeAt = state.probe ? at.get(state.probe.at) : undefined;
  const probe = probeAt && state.probe ? probeSpot(probeAt, placed, state.probe.label, W) : null;
  const glyphR = search ? 5 : 7.5;

  return (
    <section ref={ref} aria-label="Tree" className="flex flex-col gap-3">
      <p className="sr-only">{state.description}</p>
      {!hasTree && (
        <p className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400" aria-hidden>
          {state.emptyLabel}
        </p>
      )}
      {(hasTree || (strip && strip.ids.length > 0) || table) && (
        <svg
          viewBox={`${-W / 2} 0 ${W} ${H}`}
          className="mx-auto block h-auto w-full overflow-visible"
          style={{ maxWidth: W * MAX_SCALE, maxHeight: MAX_HEIGHT }}
          aria-hidden
        >
          {state.parentArrows && (
            <defs>
              <Arrowhead id={`${uid}-up`} className="fill-gray-400" />
              <Arrowhead id={`${uid}-up-hot`} className="fill-mark-done" />
            </defs>
          )}
          <g>
            <AnimatePresence initial={false}>
              {edges.map((e) => {
                const hot = onPath.has(e.child.id);
                const o = origin(e.child);
                const start = search ? { x1: o.x, y1: o.y, x2: o.x, y2: o.y } : { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 };
                return (
                  <motion.line
                    key={`e:${e.child.id}`}
                    initial={{ opacity: 0, ...start }}
                    animate={{ opacity: 1, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, strokeWidth: hot ? 3.5 : search ? 1.5 : 2 }}
                    exit={{ opacity: 0 }}
                    transition={instant}
                    strokeLinecap="round"
                    markerEnd={state.parentArrows ? `url(#${uid}-${hot ? 'up-hot' : 'up'})` : undefined}
                    className={`transition-colors ${hot ? 'stroke-mark-done' : state.parentArrows ? 'stroke-gray-400' : 'stroke-gray-300'}`}
                    style={TWEEN}
                  />
                );
              })}
            </AnimatePresence>
          </g>

          <g>
            <AnimatePresence initial={false}>
              {labels.map((l) => (
                <EdgeLabel
                  key={`l:${l.p.id}`}
                  x={l.x}
                  y={l.y}
                  from={search ? origin(l.p) : null}
                  label={l.text}
                  width={l.width}
                  height={l.height}
                  font={l.font}
                  hot={onPath.has(l.p.id)}
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
                  <RoundNode key={`n:${p.id}`} p={p} from={origin(p)} glyphR={glyphR} mark={state.marks[p.id] ?? cellMark(state, p.node)} />
                ),
              )}
            </AnimatePresence>
          </g>

          <g>
            <AnimatePresence initial={false}>
              {cells.map((c) => {
                const mark = state.marks[c.cell.id] ?? (c.box ? undefined : state.marks[c.p.id]);
                return <KeyCell key={`c:${c.cell.id}`} label={c.cell.label} x={c.x} y={c.y} from={origin(c.p)} box={c.box} mark={mark} m={m} />;
              })}
            </AnimatePresence>
          </g>

          <AnimatePresence initial={false}>
            {probe && <Probe key="probe" label={state.probe!.label} left={probe.left} y={probe.y} width={probe.width} />}
          </AnimatePresence>

          {strip && strip.ids.length > 0 && <Strip state={state} ids={strip.ids} label={strip.label} top={stripTop} cell={stripCell} />}

          {table && <Table state={state} rows={state.table!} top={tableTop} geometry={table} />}
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

/**
 * Edge labels. A plain tree puts them at the middle of the edge. A search tree
 * puts each beside the child it leads to (above it, or to its left when drawn
 * sideways), and a label with no room for its full text beside its nearest
 * neighbours uses its glyph instead. Hidden calls count as neighbours, so a
 * label's choice never changes as the search grows.
 */
function edgeLabels(all: readonly Placed[], placed: readonly Placed[], layout: TreeLayout, search: boolean) {
  const m = layout.metrics;
  const visible = placed.filter((p) => p.node.edgeLabel && layout.parent[p.id] != null);
  if (!search) {
    const byId = new Map(all.map((p) => [p.id, p]));
    return visible.map((p) => {
      const parent = byId.get(layout.parent[p.id])!;
      const parentY = parent.node.shape === 'box' ? parent.y + parent.box.h / 2 : parent.y;
      const parentX = parent.node.shape === 'box' ? parent.x - parent.box.left + m.pad + parent.node.children.indexOf(p.id) * m.cellW : parent.x;
      const childY = p.node.shape === 'box' ? p.y - p.box.h / 2 : p.y;
      const text = p.node.edgeLabel!;
      return { p, text, x: (parentX + p.x) / 2, y: (parentY + childY) / 2, width: Math.max(16, labelWidth(text, 12)), height: 18, font: 12 };
    });
  }

  const font = m.labelFont;
  const pillH = font + 4;
  // Where every node of each depth sits along the breadth, sorted.
  const along = (p: Placed) => (layout.sideways ? p.y : p.x);
  const byDepth = new Map<number, number[]>();
  for (const p of all) byDepth.set(p.box.depth, [...(byDepth.get(p.box.depth) ?? []), along(p)]);
  for (const spots of byDepth.values()) spots.sort((a, b) => a - b);
  /** Distance to the nearest node of the same depth: the room a label beside this node has. */
  const roomOf = (p: Placed) => {
    const spots = byDepth.get(p.box.depth)!;
    const i = spots.indexOf(along(p));
    return Math.min(i > 0 ? spots[i] - spots[i - 1] : Infinity, i < spots.length - 1 ? spots[i + 1] - spots[i] : Infinity);
  };
  return visible.map((p) => {
    const full = p.node.edgeLabel!;
    const fits = (layout.sideways ? pillH : labelWidth(full, font)) + 2 <= roomOf(p);
    const text = fits || !p.node.edgeGlyph ? full : p.node.edgeGlyph;
    const width = labelWidth(text, font);
    const r = p.box.h / 2;
    return layout.sideways
      ? { p, text, x: p.x - p.box.left - 3 - width / 2, y: p.y, width, height: pillH, font }
      : { p, text, x: p.x, y: p.y - r - 3 - pillH / 2, width, height: pillH, font };
  });
}

/** A round node's mark may be set on its key instead of the node. */
function cellMark(state: TreeState, node: TreeNode): MarkKey | undefined {
  return node.cells.length ? state.marks[node.cells[0].id] : undefined;
}

function Glyph({ mark, x, y, r = 7.5 }: { mark: MarkKey; x: number; y: number; r?: number }) {
  const meta = MARKS[mark];
  return (
    <g>
      <circle cx={x} cy={y} r={r} strokeWidth={r > 6 ? 1.5 : 1.2} className={`fill-white ${meta.stroke}`} />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={((meta.glyph.length > 1 ? 6.5 : 10) * r) / 7.5}
        className={`fill-current font-bold ${meta.text}`}
      >
        {meta.glyph}
      </text>
    </g>
  );
}

function Arrowhead({ id, className }: { id: string; className: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M0,1 L10,5 L0,9 z" className={className} />
    </marker>
  );
}

function RoundNode({ p, from, glyphR, mark }: { p: Placed; from: Point; glyphR: number; mark: MarkKey | undefined }) {
  const r = p.box.h / 2;
  const meta = mark ? MARKS[mark] : null;
  const badges = p.node.badges;
  // A glyph sits on the node's top-left; a small node's glyph overlaps it less. A
  // search tree's keyless dot is too small to share, so its glyph goes inside it.
  const g = glyphR > 6 ? r * 0.85 : r + glyphR * 0.35;
  const inside = glyphR <= 6 && p.node.cells.length === 0;
  return (
    <motion.g initial={{ opacity: 0, x: from.x, y: from.y }} animate={{ opacity: 1, x: p.x, y: p.y }} exit={{ opacity: 0 }}>
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
      {mark && inside && (
        <text textAnchor="middle" dominantBaseline="central" fontSize={meta!.glyph.length > 1 ? r * 0.7 : r * 1.25} className={`font-bold ${ink(mark)}`}>
          {meta!.glyph}
        </text>
      )}
      {mark && !inside && <Glyph mark={mark} x={-g} y={-g} r={glyphR} />}
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

function KeyCell({
  label,
  x,
  y,
  from,
  box,
  mark,
  m,
}: {
  label: string;
  x: number;
  y: number;
  from: Point;
  box: boolean;
  mark: MarkKey | undefined;
  m: Metrics;
}) {
  const meta = mark ? MARKS[mark] : null;
  const fontSize = label.length > 2 ? m.font - 3 : m.font;
  const start = box ? { x, y } : from;
  return (
    <motion.g initial={{ opacity: 0, x: start.x, y: start.y }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0 }}>
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

function EdgeLabel({
  x,
  y,
  from,
  label,
  width,
  height: h,
  font,
  hot,
}: {
  x: number;
  y: number;
  /** Where it grows from, in a search tree; otherwise it fades in where it is. */
  from: Point | null;
  label: string;
  width: number;
  height: number;
  font: number;
  hot: boolean;
}) {
  const start = from ?? { x, y };
  return (
    <motion.g initial={{ opacity: 0, x: start.x, y: start.y }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0 }}>
      <rect
        x={-width / 2}
        y={-h / 2}
        width={width}
        height={h}
        rx={4}
        strokeWidth={hot ? 2 : 1}
        className={`fill-white transition-colors ${hot ? 'stroke-mark-done' : 'stroke-gray-300'}`}
        style={TWEEN}
      />
      <text textAnchor="middle" dominantBaseline="central" fontSize={font} className={`font-mono font-bold ${hot ? 'fill-emerald-800' : 'fill-gray-700'}`}>
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

/**
 * Rows of cells under the tree: union-find's parent[] and rank[], a search's
 * items and current choice. A cell takes its own mark, or else its node's, and
 * a marked cell carries the mark's glyph in its corner.
 */
function Table({ state, rows, top, geometry }: { state: TreeState; rows: readonly TableRow[]; top: number; geometry: TableGeometry }) {
  const left = -geometry.width / 2;
  const nodeMark = (id: NodeId | undefined) => {
    const node = id != null ? state.nodes[id] : undefined;
    return id != null && node ? (state.marks[id] ?? cellMark(state, node)) : undefined;
  };
  return (
    <g>
      {rows.map((row, r) => {
        const y = top + r * (TABLE_CELL + TABLE_ROW_GAP) + TABLE_CELL / 2;
        return (
          <g key={row.id}>
            <text x={left + geometry.labelW - 6} y={y} textAnchor="end" dominantBaseline="central" fontSize={10} className="fill-gray-500 font-mono font-semibold">
              {row.label}
            </text>
            <AnimatePresence initial={false}>
              {row.cells.map((cell, i) => {
                const mark = state.marks[cell.id] ?? nodeMark(cell.node);
                const meta = mark ? MARKS[mark] : null;
                const x = left + geometry.labelW + (i + 0.5) * TABLE_CELL;
                const empty = cell.label === '';
                return (
                  <motion.g key={`t:${cell.id}`} initial={{ opacity: 0, x, y }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0 }}>
                    <rect
                      x={-TABLE_CELL / 2 + 1}
                      y={-TABLE_CELL / 2}
                      width={TABLE_CELL - 2}
                      height={TABLE_CELL}
                      rx={4}
                      strokeWidth={meta ? 2 : 1}
                      strokeDasharray={empty && !meta ? '3 2' : undefined}
                      className={`transition-colors ${meta ? `${meta.fill} ${meta.stroke}` : 'fill-white stroke-gray-300'}`}
                      style={TWEEN}
                    />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={12} className={`font-mono font-semibold ${ink(mark)}`}>
                      {cell.label}
                    </text>
                    {mark && <Glyph mark={mark} x={TABLE_CELL / 2 - 2} y={-TABLE_CELL / 2 + 1} r={4.5} />}
                  </motion.g>
                );
              })}
            </AnimatePresence>
          </g>
        );
      })}
    </g>
  );
}
