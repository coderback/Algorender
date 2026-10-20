'use client';

import { motion } from 'motion/react';
import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { useViewEdit, type ViewEdit } from '@/viz/edit';
import { MARKS, TONES, type MarkKey, type Tone } from '@/viz/marks';
import { fillFor, PLAIN_CELL } from '@/viz/parts';
import { describe } from './describe';
import { NetworkView } from './NetworkView';
import { clipLine, fmt, fmtVec, gridReach, planeGeometry, snap, ticks, warpedGrid, type PlaneGeometry } from './geometry';
import type {
  BarsShape,
  BitsPart,
  ContourShape,
  Handle,
  HeatmapShape,
  ImagePart,
  NetworkPart,
  LineShape,
  MatrixPart,
  PathShape,
  PlanePart,
  PlotState,
  PointShape,
  ReadoutPart,
  Shape,
  TokensPart,
  Vec,
  VectorShape,
} from './types';

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
// TODO(redesign): V8–V10 also fill contour bands as a lilac wash (lower is darker), dock a controls card beside
// the plane and draw optimiser paths as numbered steps; the states draw contour lines and keep controls in the toolbar.
export function PlotView({ state }: { state: PlotState }) {
  const figures = state.parts.filter((p): p is PlanePart | ImagePart | NetworkPart => p.kind === 'plane' || p.kind === 'image' || p.kind === 'network');
  const rows = state.parts.filter((p): p is BitsPart => p.kind === 'bits');
  const sequences = state.parts.filter((p): p is TokensPart => p.kind === 'tokens');
  const panels = state.parts.filter((p): p is MatrixPart | ReadoutPart => p.kind === 'matrix' || p.kind === 'readouts');
  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only">{describe(state)}</p>
      {sequences.map((p) => (
        <TokensView key={p.id} part={p} />
      ))}
      {figures.length > 0 && (
        <div className="flex flex-wrap items-end justify-center gap-x-6 gap-y-3">
          {figures.map((p) =>
            p.kind === 'plane' ? <Plane key={p.id} plane={p} /> : p.kind === 'image' ? <ImageView key={p.id} part={p} /> : <NetworkView key={p.id} part={p} />,
          )}
        </div>
      )}
      {rows.map((p) => (
        <BitsView key={p.id} part={p} />
      ))}
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
  // Named ticks label categories (bars), so they get labels but no grid lines.
  const named = (axis: PlanePart['x']) => axis.ticks?.map((t) => ({ at: t.at, label: t.label })) ?? ticks(axis).map((v) => ({ at: v, label: fmt(v) }));
  const xt = named(plane.x);
  const yt = named(plane.y);
  // Under a warp, the faint grid is the integer one, so the learner can count where squares went.
  const lines = (axis: PlanePart['x'], t: { at: number }[]) => (axis.ticks ? [] : plane.warp ? integers(axis.min, axis.max) : t.map((x) => x.at));
  const xs = lines(plane.x, xt);
  const ys = lines(plane.y, yt);
  const { inner } = g;
  const gridClass = 'stroke-line-soft';
  const left = inner.x;
  const right = inner.x + inner.w;
  const top = inner.y;
  const bottom = inner.y + inner.h;
  const [ox, oy] = g.px([0, 0]);
  // No zero line across a categorical axis: it would run through the first category.
  const showX0 = !plane.x.ticks && plane.x.min <= 0 && plane.x.max >= 0;
  const showY0 = !plane.y.ticks && plane.y.min <= 0 && plane.y.max >= 0;

  return (
    <g>
      <rect x={left} y={top} width={inner.w} height={inner.h} rx={6} className="fill-surface stroke-line-soft" strokeWidth={1} />
      {xs.map((v) => {
        const [x] = g.px([v, 0]);
        return <line key={`gx${v}`} x1={x} x2={x} y1={top} y2={bottom} className={gridClass} strokeWidth={1} />;
      })}
      {ys.map((v) => {
        const [, y] = g.px([0, v]);
        return <line key={`gy${v}`} x1={left} x2={right} y1={y} y2={y} className={gridClass} strokeWidth={1} />;
      })}
      {showX0 && <line x1={ox} x2={ox} y1={top} y2={bottom} className="stroke-ink-faint" strokeWidth={1.25} />}
      {showY0 && <line x1={left} x2={right} y1={oy} y2={oy} className="stroke-ink-faint" strokeWidth={1.25} />}
      {xt.map((t) => {
        const [x] = g.px([t.at, 0]);
        return (
          <text key={`tx${t.at}`} x={x} y={bottom + 14} textAnchor="middle" className="fill-ink-muted text-[10px] tabular-nums">
            {t.label}
          </text>
        );
      })}
      {yt.map((t) => {
        const [, y] = g.px([0, t.at]);
        return (
          <text key={`ty${t.at}`} x={left - 5} y={y} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[10px] tabular-nums">
            {t.label}
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
    case 'bars':
      return <BarsView s={shape} g={g} />;
    case 'heatmap':
      return <Heatmap s={shape} g={g} />;
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
        fillOpacity={s.fill ? (s.fillOpacity ?? 0.18) : 0}
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

/**
 * Coloured cells: a pale wash (decision regions), or for `intensity` a
 * stronger tint that grows with the value; each cell's colour changes by CSS
 * transition.
 */
function Heatmap({ s, g }: { s: HeatmapShape; g: PlaneGeometry }) {
  const [left, top] = g.px([s.x0, s.y1]);
  const [right, bottom] = g.px([s.x1, s.y0]);
  const cw = (right - left) / s.cols;
  const ch = (bottom - top) / s.rows;
  const scale = s.scale;
  const colour = (v: number) => {
    if (scale.kind === 'classes') return TONES[scale.tones[Math.round(v)] ?? scale.tones[0]];
    const p = Math.round(100 * Math.min(1, Math.max(0, v)));
    if (scale.kind === 'intensity') return `color-mix(in oklab, ${TONES[scale.tone]} ${p}%, transparent)`;
    return `color-mix(in oklab, ${TONES[scale.high]} ${p}%, ${TONES[scale.low]})`;
  };
  return (
    <g opacity={scale.kind === 'intensity' ? 0.75 : 0.28} shapeRendering="crispEdges">
      {s.values.map((v, k) => (
        <rect
          key={k}
          x={left + (k % s.cols) * cw}
          y={top + Math.floor(k / s.cols) * ch}
          width={cw + 0.5}
          height={ch + 0.5}
          className="transition-[fill]"
          style={{ fill: colour(v), transitionDuration: 'var(--tween, 300ms)' }}
        />
      ))}
    </g>
  );
}

/** Bars standing on y0 (default 0), tweening their height; neutral bars take the bar colour. */
function BarsView({ s, g }: { s: BarsShape; g: PlaneGeometry }) {
  return (
    <g>
      {s.bars.map((b) => {
        const [x0, top] = g.px([b.x0, Math.max(b.y, b.y0 ?? 0)]);
        const [x1, base] = g.px([b.x1, Math.min(b.y, b.y0 ?? 0)]);
        const fl = fill(b, 'fill-bar');
        return (
          <motion.rect
            key={b.id}
            initial={false}
            animate={{ x: x0, y: top, width: Math.max(0, x1 - x0), height: Math.max(0, base - top) }}
            // Rounded like the array view's bars, never more than a quarter of a narrow bar.
            rx={Math.min(5, Math.max(0, x1 - x0) / 4)}
            className={`stroke-surface ${fl.className}`}
            style={fl.style}
            strokeWidth={0.75}
          />
        );
      })}
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
    } else if (s.kind === 'bars') {
      for (const b of s.bars) {
        if (!b.label) continue;
        const [x, y] = g.px([(b.x0 + b.x1) / 2, Math.max(b.y, b.y0 ?? 0)]);
        labels.push({ id: `${s.id}:${b.id}`, x, y: y - 4, text: b.label, anchor: 'middle' });
      }
    } else if (s.kind === 'label') {
      const [x, y] = g.px(s.at);
      labels.push({ id: s.id, x, y: y + 4, text: s.text, anchor: 'middle' });
    }
  }
  // Handles aren't labelled here: each sits on a shape (a vector's tip, a start point) that carries the label.
  // Nudge labels that would overprint an earlier one down a line (approximate text widths).
  const placed: { x: number; y: number; w: number }[] = [];
  const laid = labels.map((label) => {
    const w = label.text.length * 7;
    // A start-anchored label that would run off the right edge flips to end at its point instead.
    const l = label.anchor === 'start' && label.x + w > inner.x + inner.w ? { ...label, anchor: 'end' as const, x: label.x - 14 } : label;
    const x = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2;
    let y = l.y;
    for (let tries = 0; tries < 4 && placed.some((p) => Math.abs(p.y - y) < 12 && x < p.x + p.w && p.x < x + w); tries++) y += 13;
    placed.push({ x, y, w });
    return { ...l, y };
  });
  return (
    <g>
      {laid.map((l) => (
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
  const place = (v: Vec): Vec => [snap(v[0], handle.step, handle.min[0], handle.max[0]), snap(v[1], handle.step, handle.min[1], handle.max[1])];

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
      <motion.circle initial={false} animate={{ cx, cy }} r={7.5} className="fill-surface stroke-accent" strokeWidth={3} />
      <motion.circle initial={false} animate={{ cx, cy }} r={2.75} className={fl.className} style={fl.style} />
    </g>
  );
}

// ───────────────────────────── panels ─────────────────────────────

function MatrixView({ part }: { part: MatrixPart }) {
  const rows = part.cols[0]?.values.length ?? 0;
  return (
    <div className="flex items-center gap-2 rounded-[14px] bg-surface px-3 py-2">
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
    <dl className="flex flex-wrap items-stretch gap-2">
      {part.items.map((item) => (
        <div key={item.id} className="flex min-w-24 flex-col gap-0.5 rounded-[14px] bg-surface px-3 py-2">
          <dt className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            {item.tone && <span className="h-1 w-3 rounded-full" style={{ background: TONES[item.tone] }} />}
            {item.mark && <span className={`font-bold ${MARKS[item.mark].text}`}>{MARKS[item.mark].glyph}</span>}
            {item.label}
          </dt>
          <dd className="font-mono text-[15px] font-semibold text-ink tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ───────────────────────────── images and bits ─────────────────────────────

/** Largest on-screen width of an image. */
const MAX_IMAGE_PX = 240;

function pixelColour(v: number, scale: ImagePart['scale']): string {
  if (scale === 'gray') {
    const c = Math.round(255 * Math.min(1, Math.max(0, v)));
    return `rgb(${c},${c},${c})`;
  }
  // Signed: orange below zero, blue above, a pale neutral at zero.
  const p = Math.round(100 * Math.min(1, Math.abs(v)));
  return `color-mix(in oklab, var(--color-mark-${v < 0 ? 'swap' : 'compare'}) ${p}%, #f2f2f2)`;
}

/** Text that stays readable on a pixel: light on dark grays and strong blues, ink elsewhere. */
function pixelInk(v: number, scale: ImagePart['scale']): string {
  const light = scale === 'gray' ? v < 0.5 : v > 0.55;
  return light ? '#fff' : '#1a1a1a';
}

function ImageView({ part }: { part: ImagePart }) {
  const { width: w, height: h } = part;
  const size = part.size ?? MAX_IMAGE_PX;
  // Pixel colours change between frames by CSS transition, so a picture sharpens smoothly as terms are added.
  return (
    <figure className={`m-0 min-w-0 ${part.size ? '' : 'basis-40'}`} style={{ width: size, maxWidth: '100%' }} aria-hidden>
      <svg viewBox={`-0.1 -0.1 ${w + 0.2} ${h + 0.2}`} className="block h-auto w-full overflow-visible">
        <g shapeRendering="crispEdges">
          {part.pixels.map((v, k) => (
            <rect
              key={k}
              x={k % w}
              y={Math.floor(k / w)}
              width={1.02}
              height={1.02}
              className="transition-[fill]"
              style={{ fill: pixelColour(v, part.scale), transitionDuration: 'var(--tween, 300ms)' }}
            />
          ))}
        </g>
        <rect x={0} y={0} width={w} height={h} fill="none" className="stroke-line" strokeWidth={0.04} />
        {part.values?.map((text, k) =>
          text ? (
            <text
              key={`v${k}`}
              x={(k % w) + 0.5}
              y={Math.floor(k / w) + 0.5}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.min(0.42, 1.6 / Math.max(3, text.length))}
              className="font-mono"
              style={{ fill: pixelInk(part.pixels[k] ?? 0, part.scale) }}
            >
              {text}
            </text>
          ) : null,
        )}
        {part.boxes?.map((b) => {
          const st = stroke(b, 'stroke-ink');
          return (
            <motion.rect
              key={b.id}
              initial={false}
              animate={{ x: b.x, y: b.y, width: b.w, height: b.h }}
              fill="none"
              strokeWidth={Math.max(0.12, w / 60)}
              strokeLinejoin="round"
              className={st.className}
              style={st.style}
            />
          );
        })}
      </svg>
      <figcaption className="mt-1 text-center text-xs text-ink-muted">{part.label}</figcaption>
    </figure>
  );
}

/** Each series tone's pastel, for a field of bits: blue sky, orange peach, green mint, amber butter. */
const TONE_PASTEL: Record<number, string> = {
  1: 'bg-track-sky text-track-sky-title',
  2: 'bg-track-peach text-track-peach-title',
  3: 'bg-track-mint text-track-mint-title',
  4: 'bg-track-butter text-track-butter-title',
};

/** A wrapping row of token chips; spaces show as · so a leading space (part of a GPT token) is visible. */
function TokensView({ part }: { part: TokensPart }) {
  return (
    <div className="mx-auto w-full max-w-3xl" aria-hidden>
      <div className="mb-1.5 text-xs font-medium text-ink-muted">{part.label}</div>
      <div className="flex flex-wrap gap-1">
        {part.tokens.map((t) => {
          const mark = t.mark ? MARKS[t.mark] : null;
          return (
            <motion.span
              key={t.id}
              layout="position"
              initial={false}
              // Colours switch instantly: fading text and background together passes through unreadable blends.
              className={`inline-flex min-w-6 flex-col items-center rounded-[8px] px-2 py-0.5 leading-tight ${mark ? fillFor(t.mark) : PLAIN_CELL}`}
              style={{ boxShadow: t.tone && !mark ? `inset 0 -3px 0 ${TONES[t.tone]}` : undefined }}
            >
              <span className="font-mono text-sm whitespace-pre">{t.text.replace(/ /g, '·').replace(/\n/g, '↵')}</span>
              {t.sub !== undefined && <span className={`font-mono text-[10px] ${mark ? '' : 'text-ink-muted'}`}>{t.sub}</span>}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}

/** Bits as a row of cells; fields are bracketed underneath with their names and values. */
function BitsView({ part }: { part: BitsPart }) {
  const n = part.bits.length;
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, containerType: 'inline-size' };
  return (
    <div className="mx-auto w-full max-w-3xl" aria-hidden>
      <div className="mb-1.5 text-xs font-medium text-ink-muted">{part.label}</div>
      <div className="grid gap-0.5" style={grid}>
        {part.bits.map((b, i) => {
          const field = part.fields.find((f) => i >= f.from && i < f.to);
          const mark = b.mark ? MARKS[b.mark] : null;
          return (
            <div
              key={b.id}
              // A field's bits take the pastel of its tone (sign, exponent, fraction); a mark fills over it.
              className={`flex aspect-[3/4] items-center justify-center rounded-[4px] font-mono font-semibold transition-colors ${
                mark ? fillFor(b.mark) : field?.tone ? TONE_PASTEL[field.tone] : 'bg-sunken text-ink'
              }`}
              style={{
                fontSize: `clamp(8px, ${(60 / n).toFixed(2)}cqw, 16px)`,
                boxShadow: field?.tone && !mark ? `inset 0 -3px 0 ${TONES[field.tone]}` : undefined,
                transitionDuration: 'var(--tween, 300ms)',
              }}
            >
              {b.value}
            </div>
          );
        })}
      </div>
      <div className="mt-1 grid gap-0.5" style={grid}>
        {part.fields.map((f) => {
          // A field a few bits wide (a sign bit) lets its text run on to the right instead of truncating to nothing.
          const narrow = f.to - f.from < 4;
          const text = narrow ? 'whitespace-nowrap' : 'truncate';
          return (
            <div
              key={f.id}
              className={`min-w-0 border-t-2 pt-0.5 ${narrow ? 'text-left' : 'text-center'}`}
              style={{ gridColumn: `${f.from + 1} / ${f.to + 1}`, borderColor: f.tone ? TONES[f.tone] : undefined }}
            >
              <div className={`${text} text-[11px] font-medium text-ink-soft`}>{f.label}</div>
              {f.sub && <div className={`${text} font-mono text-[11px] text-ink`}>{f.sub}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function integers(min: number, max: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(min); v <= Math.floor(max); v++) out.push(v);
  return out;
}
