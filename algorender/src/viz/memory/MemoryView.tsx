'use client';

import { LayoutGroup, motion } from 'motion/react';
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { MARKS } from '@/viz/marks';
import type { HeapObject, MemValue } from '@/workspace/protocol';
import { describeFrames, describeObjects, objectNames } from './describe';
import { arrowPath, clampInto, framePath, lanePath, targetPoint, targetPointRight, type Box } from './geometry';
import { extendOrder, NO_ORDER, orderHeap, type SeenOrder } from './order';
import type { MemoryState } from './types';

type StackFrame = MemoryState['frames'][number];
type HeapEntry = MemoryState['heap'][number];
type Sequence = Extract<HeapObject, { kind: 'list' | 'tuple' | 'set' }>;

/** One arrow: from a reference dot (`src`, unique in the diagram) to the object it refers to. */
type Ref = { src: string; to: string; changed: boolean };

/** Changes are drawn as writes: the same colour and glyph as a written cell in every other view. */
const WRITE = MARKS.write;

/** Keys of the places a reference can sit, shared by the dots (data-src) and their arrows (data-arrow). */
const KEY = {
  local: (frame: string, name: string) => `f:${frame}:${name}`,
  returning: (frame: string) => `f:${frame}^`,
  item: (obj: string, i: number) => `o:${obj}[${i}]`,
  dictKey: (obj: string, entry: string) => `o:${obj}{${entry}}k`,
  dictValue: (obj: string, entry: string) => `o:${obj}{${entry}}v`,
  field: (obj: string, name: string) => `o:${obj}.${name}`,
};

// A plain `kind === 'list' || …` can't narrow the union: the three kinds share one member.
const isSequence = (o: HeapObject): o is Sequence => o.kind === 'list' || o.kind === 'tuple' || o.kind === 'set';

/** A dict entry's identity: its key, which is unique in the dict. */
const entryKey = (k: MemValue) => ('ref' in k ? `@${k.ref}` : `${k.type}:${k.prim}`);

/**
 * A memory diagram, Python Tutor style: the call stack on the left (Global
 * frame first, the current call last and outlined), objects on the right, and
 * arrows from every reference to the object it names. Frames and objects are
 * laid out by CSS, keyed by their stable ids and kept in order of first
 * appearance, so they glide rather than jump as the stack grows and objects
 * come and go; the arrows are an SVG overlay drawn from measured positions
 * (useArrows). Below 32rem the panels stack, frames above objects.
 */
export function MemoryView({ state }: { state: MemoryState }) {
  const groupId = useId();
  const markerId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const seen = useSeenOrder(state.heap);
  const heap = orderHeap(state.heap, seen);
  const names = objectNames(state.heap, seen);
  const present = new Set(state.heap.map((h) => h.object.id));
  const refs = collectRefs(state).filter((r) => present.has(r.to));
  const rootRef = useRef<HTMLDivElement>(null);
  useArrows(rootRef, state);

  return (
    <LayoutGroup id={groupId}>
      <div ref={rootRef} role="group" aria-label="Memory" className="@container relative">
        <div className="grid grid-cols-1 gap-5 @lg:grid-cols-[minmax(9rem,2fr)_minmax(0,3fr)] @lg:gap-x-12">
          {/* Stacked, frames leave a margin on the right for the lanes their arrows run down. */}
          <div role="group" aria-label="Frames" data-panel="frames" className="min-w-0 pr-7 @lg:pr-0">
            <PanelLabel>Frames</PanelLabel>
            <p className="sr-only">{describeFrames(state, seen)}</p>
            <div className="flex flex-col gap-3" aria-hidden>
              {state.frames.length === 0 && <p className="text-sm text-ink-muted">None</p>}
              {state.frames.map((f) => (
                <FrameBox key={f.id} frame={f} present={present} />
              ))}
            </div>
          </div>
          {/* Stacked under the frames, objects sit in a little, so arrows from above can swing round into their left edges. */}
          <div role="group" aria-label="Objects" data-panel="objects" className="min-w-0 pl-9 @lg:pl-0">
            <PanelLabel>Objects</PanelLabel>
            <p className="sr-only">{describeObjects(state, seen)}</p>
            {heap.length === 0 && (
              <p aria-hidden className="text-sm text-ink-muted">
                None yet
              </p>
            )}
            <div className="flex flex-col items-start gap-4">
              {heap.map((entry) => (
                <ObjectBox key={entry.object.id} entry={entry} name={names.get(entry.object.id)!} present={present} />
              ))}
            </div>
          </div>
        </div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <Arrowhead id={`${markerId}-plain`} className="fill-ink-muted" />
            <Arrowhead id={`${markerId}-changed`} className="fill-mark-write-ink" />
          </defs>
          {refs.map((r) => (
            // `d` is filled in by useArrows from measured positions, before the first paint.
            <motion.path
              key={r.src}
              data-arrow={r.src}
              data-to={r.to}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              fill="none"
              strokeWidth={r.changed ? 2 : 1.5}
              strokeLinecap="round"
              markerEnd={`url(#${markerId}-${r.changed ? 'changed' : 'plain'})`}
              className={r.changed ? 'stroke-mark-write-ink' : 'stroke-ink-muted'}
            />
          ))}
        </svg>
        {state.output.length > 0 && <Printed lines={state.output} />}
      </div>
    </LayoutGroup>
  );
}

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-muted uppercase">
      {children}
    </div>
  );
}

// ───────────────────────────── frames ─────────────────────────────

/** One call: its function's name, then a row per local name. The current frame is outlined in the accent and labelled. */
function FrameBox({ frame, present }: { frame: StackFrame; present: Set<string> }) {
  const global = frame.fn === 'Global frame';
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      data-frame={frame.id}
      className={`rounded-lg border bg-surface ${frame.active ? 'border-accent ring-1 ring-accent' : 'border-line-strong'}`}
    >
      <div
        className={`flex items-center justify-between gap-2 rounded-t-[7px] border-b px-2.5 py-1 ${
          frame.active ? 'border-accent-line bg-accent-soft' : 'border-line bg-subtle'
        }`}
      >
        <span className={`min-w-0 truncate text-sm font-semibold ${global ? '' : 'font-mono'} ${frame.active ? 'text-ink' : 'text-ink-soft'}`}>
          {frame.fn}
        </span>
        {frame.active && (
          <span className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold tracking-wide text-on-accent uppercase">current</span>
        )}
      </div>
      {frame.locals.length === 0 && !frame.returning ? (
        <p className="px-2.5 py-1.5 text-xs text-ink-muted">No names yet</p>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 px-2.5 py-2">
          {frame.locals.map((l) => (
            <Fragment key={l.name}>
              <span className="text-right font-mono text-sm wrap-anywhere text-ink-soft">{l.name}</span>
              <Slot src={KEY.local(frame.id, l.name)} value={l.value} changed={l.changed} present={present} />
            </Fragment>
          ))}
          {frame.returning && (
            <>
              <span className="col-span-2 border-t border-dashed border-line-strong" />
              <span className="text-right text-xs font-semibold text-ink-soft">Return value</span>
              <Slot src={KEY.returning(frame.id)} value={frame.returning} changed present={present} />
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

/** A variable's box. A change flashes it in the write colour and badges it with the write glyph. */
function Slot({ src, value, changed, present }: { src: string; value: MemValue; changed: boolean; present: Set<string> }) {
  return (
    <span
      className={`relative inline-flex min-h-7 max-w-full min-w-9 items-center justify-center justify-self-start rounded border bg-surface px-1.5 py-0.5 ${
        changed ? 'border-mark-write' : 'border-line-strong'
      }`}
    >
      {/* Keyed by the value, so a second change in a row flashes again. */}
      {changed && <Wash key={'ref' in value ? `@${value.ref}` : value.prim} rounded="rounded-[3px]" />}
      <Value src={src} value={value} present={present} />
      {changed && (
        <span
          className={`absolute -top-2 -right-1.5 z-10 grid h-4 min-w-4 place-items-center rounded-full bg-surface px-0.5 text-[10px] leading-none font-bold shadow-sm ring-1 ring-line ${WRITE.text}`}
        >
          {WRITE.glyph}
        </span>
      )}
    </span>
  );
}

/** A primitive in monospace, or the dot a reference arrow leaves from (hollow if its object isn't in the step). */
function Value({ src, value, present }: { src: string; value: MemValue; present: Set<string> }) {
  if (!('ref' in value)) return <span className="relative font-mono text-sm wrap-anywhere text-ink">{value.prim}</span>;
  return present.has(value.ref) ? (
    <span data-src={src} className="relative block h-2.5 w-2.5 shrink-0 rounded-full bg-ink-soft" />
  ) : (
    <span className="relative block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-ink-muted" />
  );
}

/**
 * A tint in the write colour that flashes and settles: the change catches the
 * eye on the step it happens. Text that can sit on it is ink or ink-soft, never
 * ink-muted, which would dip below 4.5:1 at the peak.
 */
function Wash({ rounded }: { rounded: string }) {
  return (
    <motion.span
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${rounded} ${WRITE.bg}`}
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 0.16 }}
    />
  );
}

// ───────────────────────────── objects ────────────────────────────

/**
 * An object under its type label (list, dict, Point…). A new one fades in and
 * says "new"; one whose contents changed this step says "changed". Both flash
 * in the write colour.
 */
function ObjectBox({ entry, name, present }: { entry: HeapEntry; name: string; present: Set<string> }) {
  const { object: o, fresh, changed } = entry;
  // Keyed by the contents, so the flash replays on every change, not only the first.
  const flash = fresh || changed ? JSON.stringify(o) : '';
  return (
    <motion.div layout="position" initial={fresh ? { opacity: 0 } : false} animate={{ opacity: 1 }} className="max-w-full min-w-0">
      {(o.kind !== 'function' || flash) && (
        <div aria-hidden className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold">
          {o.kind !== 'function' && <span className="font-mono text-ink-muted">{o.type}</span>}
          {fresh ? <Badge>new</Badge> : changed && <Badge>{WRITE.glyph} changed</Badge>}
        </div>
      )}
      {isSequence(o) ? (
        <SequenceBox object={o} name={name} flash={flash} present={present} />
      ) : (
        <ObjectFrame id={o.id} flash={flash}>
          {o.kind === 'function' ? (
            <div className="relative px-2 py-1 font-mono text-sm wrap-anywhere" aria-hidden>
              <span className="text-ink-soft">{o.type}</span> <span className="font-semibold text-ink">{o.name}</span>
            </div>
          ) : o.kind === 'dict' ? (
            <Rows
              rows={o.entries.map(([k, v]) => {
                const e = entryKey(k);
                return { key: e, left: <Value src={KEY.dictKey(o.id, e)} value={k} present={present} />, src: KEY.dictValue(o.id, e), value: v };
              })}
              more={o.more}
              empty="empty"
              present={present}
            />
          ) : (
            <Rows
              rows={o.fields.map(([f, v]) => ({ key: f, left: f, src: KEY.field(o.id, f), value: v }))}
              more={o.more}
              empty="no fields"
              present={present}
            />
          )}
        </ObjectFrame>
      )}
    </motion.div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className={`rounded px-1 text-[10px] leading-4 font-bold tracking-wide uppercase ring-1 ring-current ${WRITE.text}`}>{children}</span>;
}

/** The bordered box arrows point at (data-obj): they land on its left edge. */
function ObjectFrame({ id, flash, children }: { id: string; flash: string; children: ReactNode }) {
  return (
    <div data-obj={id} className={`relative max-w-full rounded-md border bg-surface ${flash ? 'border-mark-write' : 'border-line-strong'}`}>
      {flash && <Wash key={flash} rounded="rounded-[5px]" />}
      {children}
    </div>
  );
}

/**
 * A list, tuple or set as a row of cells (indexed, except a set's). A long one
 * scrolls sideways inside its own box, which then becomes a focusable, labelled
 * region so keyboard users can scroll it too.
 */
function SequenceBox({ object: o, name, flash, present }: { object: Sequence; name: string; flash: string; present: Set<string> }) {
  const [scrollRef, overflowing] = useOverflow<HTMLDivElement>();
  return (
    <>
      <ObjectFrame id={o.id} flash={flash}>
        <div
          ref={scrollRef}
          data-scroll
          className="relative overflow-x-auto"
          tabIndex={overflowing ? 0 : -1}
          role={overflowing ? 'region' : undefined}
          aria-label={overflowing ? `${name}, ${o.items.length + o.more} items (scrolls sideways)` : undefined}
        >
          <div className="flex w-max" aria-hidden>
            {o.items.map((v, i) => (
              // A cell is a position in the sequence (values have no identity of their own), so its index is its key.
              <div key={i} className={`flex min-w-9 flex-col items-center px-1.5 py-1 ${i > 0 ? 'border-l border-line' : ''}`}>
                {o.kind !== 'set' && <span className="font-mono text-[10px] leading-3 text-ink-soft">{i}</span>}
                <span className="flex min-h-6 items-center">
                  <Value src={KEY.item(o.id, i)} value={v} present={present} />
                </span>
              </div>
            ))}
            {o.more > 0 && (
              <div className={`flex items-center px-2 text-xs whitespace-nowrap text-ink-soft ${o.items.length > 0 ? 'border-l border-dashed border-line-strong' : ''}`}>
                +{o.more} more
              </div>
            )}
            {o.items.length === 0 && o.more === 0 && <div className="px-2.5 py-1.5 text-xs text-ink-soft">empty</div>}
          </div>
        </div>
      </ObjectFrame>
      {overflowing && (
        <p aria-hidden className="mt-1 text-[11px] text-ink-muted">
          Scroll sideways to see the whole {o.type} →
        </p>
      )}
    </>
  );
}

/** A dict's entries or an object's fields: key or name on the left, value on the right. */
function Rows({
  rows,
  more,
  empty,
  present,
}: {
  rows: { key: string; left: ReactNode; src: string; value: MemValue }[];
  more: number;
  empty: string;
  present: Set<string>;
}) {
  return (
    <div className="relative grid grid-cols-[auto_auto]" aria-hidden>
      {rows.map((r, k) => (
        <Fragment key={r.key}>
          <div className={`flex items-center justify-end px-2 py-1 text-right font-mono text-sm wrap-anywhere text-ink-soft ${k > 0 ? 'border-t border-line' : ''}`}>
            {r.left}
          </div>
          <div className={`flex items-center border-l border-line px-2 py-1 ${k > 0 ? 'border-t' : ''}`}>
            <Value src={r.src} value={r.value} present={present} />
          </div>
        </Fragment>
      ))}
      {more > 0 && <div className={`col-span-2 px-2 py-1 text-xs text-ink-soft ${rows.length > 0 ? 'border-t border-dashed border-line-strong' : ''}`}>+{more} more</div>}
      {rows.length === 0 && more === 0 && <div className="col-span-2 px-2.5 py-1.5 text-xs text-ink-soft">{empty}</div>}
    </div>
  );
}

// ───────────────────────────── output ─────────────────────────────

/** Everything printed so far, kept scrolled to the latest line as a console is. */
function Printed({ lines }: { lines: string[] }) {
  const [ref, overflowing] = useOverflow<HTMLDivElement>();
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ref, lines]);
  return (
    <div role="group" aria-label="Printed" className="mt-5">
      <PanelLabel>Printed</PanelLabel>
      <div
        ref={ref}
        className="max-h-40 overflow-y-auto rounded-md border border-line bg-sunken px-3 py-2"
        tabIndex={overflowing ? 0 : -1}
        role={overflowing ? 'region' : undefined}
        aria-label={overflowing ? 'Printed output (scrolls)' : undefined}
      >
        <pre className="font-mono text-sm whitespace-pre-wrap wrap-anywhere text-ink">{lines.join('\n')}</pre>
      </div>
    </div>
  );
}

// ───────────────────────────── arrows ─────────────────────────────

/** Every reference in the step: locals and return values in frames, then cells, keys, values and fields in objects. */
function collectRefs(state: MemoryState): Ref[] {
  const refs: Ref[] = [];
  const add = (src: string, v: MemValue, changed = false) => {
    if ('ref' in v) refs.push({ src, to: v.ref, changed });
  };
  for (const f of state.frames) {
    for (const l of f.locals) add(KEY.local(f.id, l.name), l.value, l.changed);
    if (f.returning) add(KEY.returning(f.id), f.returning, true);
  }
  for (const { object: o } of state.heap) {
    if (o.kind === 'dict') {
      for (const [k, v] of o.entries) {
        add(KEY.dictKey(o.id, entryKey(k)), k);
        add(KEY.dictValue(o.id, entryKey(k)), v);
      }
    } else if (o.kind === 'object') {
      for (const [f, v] of o.fields) add(KEY.field(o.id, f), v);
    } else if (isSequence(o)) {
      o.items.forEach((v, i) => add(KEY.item(o.id, i), v));
    }
  }
  return refs;
}

function Arrowhead({ id, className }: { id: string; className: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M0,1 L10,5 L0,9 z" className={className} />
    </marker>
  );
}

/**
 * Keeps the arrows attached: each path runs from its dot (data-src) to the
 * left edge of its object's box (data-obj), measured relative to the diagram.
 * It redraws before paint on every step, then every animation frame for one
 * tween while boxes glide to their new places (Motion moves them with
 * transforms, which resize observers don't see), on any resize, and when a
 * long list scrolls sideways. Paths get their `d` straight on the DOM, so
 * following a moving box costs no React renders.
 */
function useArrows(rootRef: RefObject<HTMLDivElement | null>, state: MemoryState) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const draw = () => drawArrows(root);
    draw();
    // Motion starts a glide by moving each box back to where it was, in a
    // microtask queued from its own layout effects: redraw after that too, so
    // the first painted frame has arrows and boxes agreeing.
    queueMicrotask(draw);
    // TraceStage sets --tween (the playback speed's tween length) on the stage.
    const until = performance.now() + (parseFloat(getComputedStyle(root).getPropertyValue('--tween')) || 300) + 200;
    let raf = requestAnimationFrame(function follow(now) {
      draw();
      if (now < until) raf = requestAnimationFrame(follow);
    });
    const resize = new ResizeObserver(draw);
    resize.observe(root);
    root.querySelectorAll('[data-frame], [data-obj]').forEach((el) => resize.observe(el));
    // Scroll events don't bubble; capture catches a list scrolling inside its box.
    root.addEventListener('scroll', draw, true);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      root.removeEventListener('scroll', draw, true);
    };
  }, [rootRef, state]);
}

function drawArrows(root: HTMLElement) {
  const origin = root.getBoundingClientRect();
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top };
  };
  const dots = new Map([...root.querySelectorAll<HTMLElement>('[data-src]')].map((el) => [el.dataset.src!, el]));
  const objects = new Map([...root.querySelectorAll<HTMLElement>('[data-obj]')].map((el) => [el.dataset.obj!, el]));
  const framesPanel = root.querySelector('[data-panel="frames"]');
  const objectsPanel = root.querySelector('[data-panel="objects"]');
  const stacked = framesPanel != null && objectsPanel != null && box(objectsPanel).top >= box(framesPanel).bottom;
  // Each arrow from a frame gets its own lane, so two never share a stretch of line.
  let lane = 0;
  root.querySelectorAll<SVGPathElement>('path[data-arrow]').forEach((path) => {
    const dot = dots.get(path.dataset.arrow!);
    const target = objects.get(path.dataset.to!);
    if (!dot || !target) {
      path.removeAttribute('d');
      return;
    }
    const b = box(dot);
    let from = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
    // A dot scrolled out of view inside a long list starts its arrow at the list's visible edge.
    const clip = dot.closest('[data-scroll]');
    if (clip) from = clampInto(from, box(clip));
    const frame = dot.closest('[data-frame]');
    if (frame && stacked) {
      const laneX = origin.width - 6 - 5 * (lane++ % 4);
      path.setAttribute('d', lanePath(from, targetPointRight(box(target)), laneX));
      return;
    }
    if (frame) {
      path.setAttribute('d', framePath(from, box(frame).right + 2, targetPoint(box(target))));
      return;
    }
    path.setAttribute('d', arrowPath(from, targetPoint(box(target))));
  });
}

// ───────────────────────────── hooks ─────────────────────────────

/**
 * Objects in order of first appearance, remembered across steps (React's
 * "information from previous renders" pattern), so a box keeps its place and
 * its spoken name while others come and go.
 */
function useSeenOrder(heap: MemoryState['heap']): SeenOrder {
  const [seen, setSeen] = useState(() => extendOrder(NO_ORDER, heap));
  const next = extendOrder(seen, heap);
  if (next !== seen) setSeen(next);
  return next;
}

/** Whether an element's content overflows it (either way), kept current as either resizes. */
function useOverflow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      setOverflowing(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1),
    );
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return [ref, overflowing] as const;
}
