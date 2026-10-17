'use client';

import { motion } from 'motion/react';
import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { useViewEdit, type ViewEdit } from '@/viz/edit';
import { MARKS, TONES, type MarkKey, type Tone } from '@/viz/marks';
import { describe } from './describe';
import { clipLine, fmt, fmtVec, gridReach, planeGeometry, snap, ticks, warpedGrid, type PlaneGeometry } from './geometry';
import type { ContourShape, Handle, LineShape, MatrixPart, PathShape, PlanePart, PlotState, PointShape, ReadoutPart, Shape, Vec, VectorShape } from './types';

/** Largest on-screen width of one plane, so a single plane doesn't balloon on a wide screen. */
const MAX_PLANE_PX = 520;
const ARROW_HEAD = 9;

/**
 * Coordinate planes in SVG, side by side, with matrix and readout panels
 * below. Shapes are keyed by id and tween their coordinates between frames
 * (the stage's MotionConfig sets the duration), so a vector glides to where a
 * matrix sends it and the whole grid warps with it. Handles can be dragged, or
 * moved with the arrow keys, when the module takes dragged input.
 */
export function PlotView({ state }: { state: PlotState }) {
  const planes = state.parts.filter((p): p is PlanePart => p.kind === 'plane');
  const panels = state.parts.filter((p): p is MatrixPart | ReadoutPart => p.kind !== 'plane');
  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only">{describe(state)}</p>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
        {planes.map((p) => (
          <Plane key={p.id} plane={p} />
        ))}
      </div>
      {panels.length > 0 && (
        <div className="flex flex-wrap items-stretch justify-center gap-2" aria-hidden>
          {panels.map((p) => (p.kind === 'matrix' ? <MatrixView key={p.id} part={p} /> : <Readouts key={p.id} part={p} />))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── planes ─────────────────────────────

function Plane({ plane }: { plane: PlanePart }) {
  const g = planeGeometry(plane);
  const clip = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const edit = useViewEdit();
  const interactive = edit != null && plane.handles.length > 0;
  const [said, setSaid] = useState('');

  return (
    <figure className="m-0 min-w-0 flex-1 basis-64" style={{ maxWidth: MAX_PLANE_PX }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${g.w} ${g.h}`}
        className="block h-auto w-full overflow-visible select-none"
        {...(interactive ? { role: 'group', 'aria-label': plane.label } : { 'aria-hidden': true })}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={g.inner.x} y={g.inner.y} width={g.inner.w} height={g.inner.h} />
          </clipPath>
        </defs>
        <g aria-hidden>
          <Background plane={plane} g={g} />
          <g clipPath={`url(#${clip})`}>
            {plane.warp && <WarpedGrid plane={plane} g={g} />}
            {plane.shapes.map((s) => (
              <ShapeView key={s.id} shape={s} plane={plane} g={g} />
            ))}
            {!interactive && plane.handles.map((h) => <HandleDot key={h.id} handle={h} g={g} />)}
          </g>
          <ShapeLabels plane={plane} g={g} />
        </g>
        {interactive &&
          plane.handles.map((h) => <HandleControl key={h.id} handle={h} g={g} svgRef={svgRef} edit={edit} onSay={setSaid} />)}
      </svg>
      {interactive && (
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
      )}
      <figcaption className="mt-1 text-center text-xs text-ink-muted" aria-hidden>
        {plane.label}
      </figcaption>
    </figure>
  );
}

/** Grid lines at round ticks, the axes, and tick labels. Faint when a warped grid is drawn over it. */
function Background({ plane, g }: { plane: PlanePart; g: PlaneGeometry }) {
  const xt = ticks(plane.x);
  const yt = ticks(plane.y);
  // Under a warp, the faint grid is the integer one, so the learner can count where squares went.
  const xs = plane.warp ? integers(plane.x.min, plane.x.max) : xt;
  const ys = plane.warp ? integers(plane.y.min, plane.y.max) : yt;
  const { inner } = g;
  const gridClass = 'stroke-line-soft';
  const left = inner.x;
  const right = inner.x + inner.w;
  const top = inner.y;
  const bottom = inner.y + inner.h;
  const [ox, oy] = g.px([0, 0]);
  const showX0 = plane.x.min <= 0 && plane.x.max >= 0;
  const showY0 = plane.y.min <= 0 && plane.y.max >= 0;

  return (
    <g>
      <rect x={left} y={top} width={inner.w} height={inner.h} className="fill-surface stroke-line" strokeWidth={1} />
      {xs.map((v) => {
        const [x] = g.px([v, 0]);
        return <line key={`gx${v}`} x1={x} x2={x} y1={top} y2={bottom} className={gridClass} strokeWidth={1} />;
      })}
      {ys.map((v) => {
        const [, y] = g.px([0, v]);
        return <line key={`gy${v}`} x1={left} x2={right} y1={y} y2={y} className={gridClass} strokeWidth={1} />;
      })}
      {showX0 && <line x1={ox} x2={ox} y1={top} y2={bottom} className="stroke-line-strong" strokeWidth={1.25} />}
      {showY0 && <line x1={left} x2={right} y1={oy} y2={oy} className="stroke-line-strong" strokeWidth={1.25} />}
      {xt.map((v) => {
        const [x] = g.px([v, 0]);
        return (
          <text key={`tx${v}`} x={x} y={bottom + 14} textAnchor="middle" className="fill-ink-muted text-[10px] tabular-nums">
            {fmt(v)}
          </text>
        );
      })}
      {yt.map((v) => {
        const [, y] = g.px([0, v]);
        return (
          <text key={`ty${v}`} x={left - 5} y={y} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[10px] tabular-nums">
            {fmt(v)}
          </text>
        );
      })}
      {plane.x.label && (
        <text x={right} y={bottom - 5} textAnchor="end" className="fill-ink-muted text-[10px] italic">
          {plane.x.label}
        </text>
      )}
      {plane.y.label && (
        <text x={left + 5} y={top + 11} className="fill-ink-muted text-[10px] italic">
          {plane.y.label}
        </text>
      )}
    </g>
  );
}

/** The integer grid moved by the plane's matrix; each line glides as the matrix changes. */
function WarpedGrid({ plane, g }: { plane: PlanePart; g: PlaneGeometry }) {
  const m = plane.warp!;
  const radius = Math.max(Math.abs(plane.x.min), Math.abs(plane.x.max), Math.abs(plane.y.min), Math.abs(plane.y.max));
  // Line count follows the plane, not the matrix, so lines never pop in or out as it changes.
  const reach = Math.max(gridReach(m, radius), Math.ceil(radius) + 1);
  return (
    <g>
      {warpedGrid(m, reach).map((l) => {
        const [x1, y1] = g.px(l.from);
        const [x2, y2] = g.px(l.to);
        return (
          <motion.line
            key={l.id}
            initial={false}
            animate={{ x1, y1, x2, y2 }}
            className={l.axis ? 'stroke-accent' : 'stroke-accent-line'}
            strokeWidth={l.axis ? 1.75 : 1}
          />
        );
      })}
    </g>
  );
}

function ShapeView({ shape, plane, g }: { shape: Shape; plane: PlanePart; g: PlaneGeometry }) {
  switch (shape.kind) {
    case 'vector':
      return <VectorView s={shape} g={g} />;
    case 'point':
      return <PointView s={shape} g={g} />;
    case 'path':
      return <PathView s={shape} g={g} />;
    case 'line':
      return <LineView s={shape} plane={plane} g={g} />;
    case 'contours':
      return <Contours s={shape} g={g} />;
    case 'label':
      return null; // drawn unclipped by ShapeLabels
  }
}

type Paint = { mark?: MarkKey | null; tone?: Tone };

/** Stroke colour as a class (marks, neutral) or a style (tones, which are CSS variables). */
function stroke(p: Paint, neutral = 'stroke-ink-soft'): { className: string; style?: CSSProperties } {
  if (p.tone) return { className: '', style: { stroke: TONES[p.tone] } };
  return { className: p.mark ? MARKS[p.mark].stroke : neutral };
}

function fill(p: Paint, neutral = 'fill-ink-soft'): { className: string; style?: CSSProperties } {
  if (p.tone) return { className: '', style: { fill: TONES[p.tone] } };
  return { className: p.mark ? MARKS[p.mark].fill : neutral };
}

function VectorView({ s, g }: { s: VectorShape; g: PlaneGeometry }) {
  const [x1, y1] = g.px(s.from);
  const [x2, y2] = g.px(s.to);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const head = Math.min(ARROW_HEAD, len * 0.6);
  const ux = len > 0 ? (x2 - x1) / len : 1;
  const uy = len > 0 ? (y2 - y1) / len : 0;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const w = head * 0.5;
  const d = `M${x2},${y2}L${bx - uy * w},${by + ux * w}L${bx + uy * w},${by - ux * w}Z`;
  const st = stroke(s);
  const fl = fill(s);
  return (
    <g>
      <motion.line
        initial={false}
        animate={{ x1, y1, x2: bx, y2: by }}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={s.dashed ? '5 4' : undefined}
        className={st.className}
        style={st.style}
      />
      <motion.path initial={false} animate={{ d }} className={fl.className} style={fl.style} />
    </g>
  );
}

const POINT_R = { sm: 3, md: 5, lg: 7 } as const;

function PointView({ s, g }: { s: PointShape; g: PlaneGeometry }) {
  const [cx, cy] = g.px(s.at);
  const fl = fill(s);
  return (
    <motion.circle
      initial={false}
      animate={{ cx, cy }}
      r={POINT_R[s.size ?? 'md']}
      className={`stroke-surface ${fl.className}`}
      style={fl.style}
      strokeWidth={1.5}
    />
  );
}

function PathView({ s, g }: { s: PathShape; g: PlaneGeometry }) {
  const pts = s.points.map((p) => g.px(p));
  if (pts.length === 0) return null;
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('') + (s.closed ? 'Z' : '');
  const st = s.faint ? { className: 'stroke-ink-faint' } : stroke(s);
  const fl = fill(s);
  return (
    <g>
      {/* Keyed by length: Motion tweens a path between frames only when both have the same points. */}
      <motion.path
        key={pts.length}
        initial={false}
        animate={{ d }}
        strokeWidth={s.faint ? 1.25 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray={s.dashed ? '5 4' : undefined}
        fillOpacity={s.fill ? 0.18 : 0}
        className={`${st.className} ${s.fill ? fl.className : 'fill-none'}`}
        style={{ ...st.style, ...(s.fill ? fl.style : {}) }}
      />
      {s.dots &&
        pts.map(([cx, cy], i) => (
          <motion.circle key={i} initial={false} animate={{ cx, cy }} r={2.5} className={`stroke-surface ${fl.className}`} style={fl.style} strokeWidth={1} />
        ))}
    </g>
  );
}

function LineView({ s, plane, g }: { s: LineShape; plane: PlanePart; g: PlaneGeometry }) {
  // Clip to a box a little larger than the plane, so the ends sit outside the clip path.
  const pad = (a: { min: number; max: number }) => ({ min: a.min - (a.max - a.min), max: a.max + (a.max - a.min) });
  const seg = clipLine(s.through, s.dir, { x: pad(plane.x), y: pad(plane.y) });
  if (!seg) return null;
  const [x1, y1] = g.px(seg[0]);
  const [x2, y2] = g.px(seg[1]);
  const st = stroke(s, 'stroke-ink-muted');
  return (
    <motion.line
      initial={false}
      animate={{ x1, y1, x2, y2 }}
      strokeWidth={1.75}
      strokeDasharray={s.dashed ? '6 5' : undefined}
      className={st.className}
      style={st.style}
    />
  );
}

function Contours({ s, g }: { s: ContourShape; g: PlaneGeometry }) {
  // Contour maps are computed once per input and shared by every frame, so memoise on the shape.
  const paths = useMemo(
    () =>
      s.levels.map((level) =>
        level.segments
          .map(([a, b]) => {
            const [x1, y1] = g.px(a);
            const [x2, y2] = g.px(b);
            return `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`;
          })
          .join(''),
      ),
    // g is derived from the plane's axes, which come with the shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s],
  );
  const n = paths.length;
  return (
    <g>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" className="stroke-ink-faint" strokeWidth={1} strokeOpacity={0.35 + (0.55 * (n - i)) / Math.max(1, n)} />
      ))}
    </g>
  );
}

/**
 * Labels for vectors, points, paths and lines, plus free labels, drawn above
 * the clip so they stay readable at the edge. Positions are clamped inside
 * the plotting area.
 */
function ShapeLabels({ plane, g }: { plane: PlanePart; g: PlaneGeometry }) {
  const { inner } = g;
  const clampX = (x: number) => Math.min(inner.x + inner.w - 6, Math.max(inner.x + 6, x));
  const clampY = (y: number) => Math.min(inner.y + inner.h - 4, Math.max(inner.y + 10, y));
  const labels: { id: string; x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }[] = [];
  for (const s of plane.shapes) {
    if (s.kind === 'vector' && s.label) {
      const [x1, y1] = g.px(s.from);
      const [x2, y2] = g.px(s.to);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      labels.push({ id: s.id, x: x2 + ux * 11, y: y2 + uy * 11 + 4, text: s.label, anchor: 'middle' });
    } else if (s.kind === 'point' && s.label) {
      const [x, y] = g.px(s.at);
      labels.push({ id: s.id, x: x + 8, y: y - 7, text: s.label, anchor: 'start' });
    } else if (s.kind === 'path' && s.label && s.points.length > 0 && !s.closed) {
      const [x, y] = g.px(s.points[s.points.length - 1]);
      labels.push({ id: s.id, x: x + 6, y: y - 6, text: s.label, anchor: 'start' });
    } else if (s.kind === 'line' && s.label) {
      // Near the end the direction points to, nudged off the line.
      const seg = clipLine(s.through, s.dir, plane);
      if (seg) {
        const [x1, y1] = g.px(seg[0]);
        const [x2, y2] = g.px(seg[1]);
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        labels.push({ id: s.id, x: x1 + (x2 - x1) * 0.86 + ((y2 - y1) / len) * 12, y: y1 + (y2 - y1) * 0.86 - ((x2 - x1) / len) * 12 + 4, text: s.label, anchor: 'middle' });
      }
    } else if (s.kind === 'label') {
      const [x, y] = g.px(s.at);
      labels.push({ id: s.id, x, y: y + 4, text: s.text, anchor: 'middle' });
    }
  }
  // Handles aren't labelled here: each sits on a shape (a vector's tip, a start point) that carries the label.
  return (
    <g>
      {labels.map((l) => (
        <motion.text
          key={l.id}
          initial={false}
          animate={{ x: clampX(l.x), y: clampY(l.y) }}
          textAnchor={l.anchor}
          className="fill-ink stroke-surface text-[12px] font-semibold"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {l.text}
        </motion.text>
      ))}
    </g>
  );
}

// ───────────────────────────── handles ─────────────────────────────

function HandleDot({ handle, g }: { handle: Handle; g: PlaneGeometry }) {
  const [cx, cy] = g.px(handle.at);
  const fl = fill(handle, 'fill-accent');
  return <motion.circle initial={false} animate={{ cx, cy }} r={6} className={`stroke-surface ${fl.className}`} style={fl.style} strokeWidth={2} />;
}

const KEY_STEPS: Record<string, Vec> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

/**
 * A draggable point. Pointer drags snap to the handle's step and report every
 * change, then a final position on release; arrow keys move it one step
 * (Shift: four) and report at once. Keys are handled here, so the player's
 * page-wide arrow shortcuts don't also step the trace.
 */
function HandleControl({
  handle,
  g,
  svgRef,
  edit,
  onSay,
}: {
  handle: Handle;
  g: PlaneGeometry;
  svgRef: RefObject<SVGSVGElement | null>;
  edit: ViewEdit;
  onSay: (text: string) => void;
}) {
  const [cx, cy] = g.px(handle.at);
  const dragging = useRef(false);
  const last = useRef<Vec>(handle.at);
  const fl = fill(handle, 'fill-accent');
  const place = (v: Vec): Vec => [snap(v[0], handle.step, handle.min, handle.max), snap(v[1], handle.step, handle.min, handle.max)];

  const toWorld = (e: PointerEvent): Vec | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return place(g.world(p.x, p.y));
  };

  const onPointerDown = (e: PointerEvent<SVGGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    dragging.current = true;
    last.current = handle.at;
  };
  const onPointerMove = (e: PointerEvent<SVGGElement>) => {
    if (!dragging.current) return;
    const v = toWorld(e);
    if (!v || (v[0] === last.current[0] && v[1] === last.current[1])) return;
    last.current = v;
    edit.drag(handle.id, v, false);
  };
  const onPointerEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    edit.drag(handle.id, last.current, true);
  };
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    const dir = KEY_STEPS[e.key];
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const by = handle.step * (e.shiftKey ? 4 : 1);
    const v = place([handle.at[0] + dir[0] * by, handle.at[1] + dir[1] * by]);
    if (v[0] === handle.at[0] && v[1] === handle.at[1]) {
      onSay(`${handle.label} is at the edge, ${fmtVec(v)}.`);
      return;
    }
    onSay(`${handle.label} moved to ${fmtVec(v)}.`);
    edit.drag(handle.id, v, true);
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-roledescription="draggable point"
      aria-label={`${handle.label} at ${fmtVec(handle.at)}. Drag it, or use the arrow keys.`}
      className="group cursor-grab outline-none active:cursor-grabbing"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <motion.circle initial={false} animate={{ cx, cy }} r={16} fill="transparent" />
      <motion.circle
        initial={false}
        animate={{ cx, cy }}
        r={11}
        className="fill-none stroke-accent opacity-0 group-hover:opacity-60 group-focus-visible:opacity-100"
        strokeWidth={2}
      />
      <motion.circle initial={false} animate={{ cx, cy }} r={6.5} className={`stroke-surface ${fl.className}`} style={fl.style} strokeWidth={2} />
    </g>
  );
}

// ───────────────────────────── panels ─────────────────────────────

function MatrixView({ part }: { part: MatrixPart }) {
  const rows = part.cols[0]?.values.length ?? 0;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface px-3 py-2">
      <span className="font-mono text-sm text-ink">{part.name} =</span>
      <div
        className="grid gap-x-3 rounded-md border-x-2 border-ink-soft px-2 py-0.5 font-mono text-sm tabular-nums"
        style={{ gridTemplateColumns: `repeat(${part.cols.length}, auto)`, gridTemplateRows: `repeat(${rows}, auto) 4px` }}
      >
        {part.cols.map((col, c) =>
          col.values.map((v, r) => (
            <span key={`${c}:${r}`} className="text-right text-ink" style={{ gridColumn: c + 1, gridRow: r + 1 }}>
              {v}
            </span>
          )),
        )}
        {part.cols.map((col, c) =>
          col.tone ? <span key={`t${c}`} className="mt-0.5 h-1 rounded-full" style={{ gridColumn: c + 1, gridRow: rows + 1, background: TONES[col.tone] }} /> : null,
        )}
      </div>
    </div>
  );
}

function Readouts({ part }: { part: ReadoutPart }) {
  return (
    <dl className="flex flex-wrap items-center gap-2">
      {part.items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface px-3 py-1.5">
          {item.tone && <span className="h-1 w-3 rounded-full" style={{ background: TONES[item.tone] }} />}
          {item.mark && <span className={`text-xs font-bold ${MARKS[item.mark].text}`}>{MARKS[item.mark].glyph}</span>}
          <dt className="text-xs text-ink-muted">{item.label}</dt>
          <dd className="font-mono text-sm font-semibold text-ink tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function integers(min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(min); v <= Math.floor(max); v++) out.push(v);
  return out;
}
