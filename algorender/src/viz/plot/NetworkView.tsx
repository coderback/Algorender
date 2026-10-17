'use client';

import { motion } from 'motion/react';
import { useId, type CSSProperties } from 'react';
import { MARKS, TONES } from '@/viz/marks';
import type { NetEdge, NetNode, NetworkPart } from './types';

// A network diagram for PlotView: a computation graph (value boxes and
// operation circles), a neural network (neurons and weighted edges) or a
// decision tree. Positions come from the module (see `layered` in network.ts);
// nodes and edges are keyed by id, so values, gradients and weights change in
// place between frames.

const BOX = { w: 78, h: 44 };
const OP_R = 13;
const NEURON_R = 15;
const PAD = 14;
/** Largest on-screen width, so a small graph doesn't balloon. */
const MAX_PX = 720;

type Half = { hw: number; hh: number; round: boolean };
const halfSize = (n: NetNode): Half =>
  n.kind === 'value' ? { hw: BOX.w / 2, hh: BOX.h / 2, round: false } : { hw: n.kind === 'op' ? OP_R : NEURON_R, hh: n.kind === 'op' ? OP_R : NEURON_R, round: true };

/** Where the segment from a node's centre towards (dx, dy) leaves its outline. */
function exit(n: NetNode, dx: number, dy: number): [number, number] {
  const s = halfSize(n);
  const len = Math.hypot(dx, dy) || 1;
  if (s.round) return [n.x + (dx / len) * s.hw, n.y + (dy / len) * s.hh];
  const t = Math.min(dx === 0 ? Infinity : s.hw / Math.abs(dx), dy === 0 ? Infinity : s.hh / Math.abs(dy));
  return [n.x + dx * t, n.y + dy * t];
}

function edgeStyle(e: NetEdge): { className: string; style?: CSSProperties; width: number } {
  if (e.weight !== undefined) {
    const w = Math.min(6, 0.75 + Math.abs(e.weight) * 1.6);
    return { className: '', style: { stroke: TONES[e.weight >= 0 ? 1 : 2] }, width: w };
  }
  if (e.tone) return { className: '', style: { stroke: TONES[e.tone] }, width: 2 };
  return { className: e.mark ? MARKS[e.mark].stroke : 'stroke-line-strong', width: e.mark ? 2.5 : 1.5 };
}

export function NetworkView({ part }: { part: NetworkPart }) {
  const arrow = useId();
  const byId = new Map(part.nodes.map((n) => [n.id, n]));
  const xs = part.nodes.flatMap((n) => [n.x - halfSize(n).hw, n.x + halfSize(n).hw]);
  const ys = part.nodes.flatMap((n) => [n.y - halfSize(n).hh, n.y + halfSize(n).hh + (n.kind === 'neuron' && n.label ? 14 : 0)]);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const w = Math.max(...xs) - minX + PAD;
  const h = Math.max(...ys) - minY + PAD;
  return (
    <figure className="m-0 w-full min-w-0 flex-[1_1_100%]" style={{ maxWidth: Math.min(MAX_PX, w * 1.5) }} aria-hidden>
      <svg viewBox={`${minX} ${minY} ${w} ${h}`} className="block h-auto w-full">
        <defs>
          <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-ink-muted" />
          </marker>
        </defs>
        {part.edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const [x1, y1] = exit(a, b.x - a.x, b.y - a.y);
          const [x2, y2] = exit(b, a.x - b.x, a.y - b.y);
          const st = edgeStyle(e);
          return (
            <g key={e.id}>
              <motion.line
                initial={false}
                animate={{ x1, y1, x2, y2, strokeWidth: st.width }}
                className={`transition-[stroke] ${st.className}`}
                style={{ ...st.style, transitionDuration: 'var(--tween, 300ms)' }}
                markerEnd={e.weight === undefined ? `url(#${arrow})` : undefined}
              />
              {e.label && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} textAnchor="middle" className="fill-ink-soft stroke-surface text-[10px] font-mono" strokeWidth={3} paintOrder="stroke">
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {part.nodes.map((n) => (
          <NodeShape key={n.id} n={n} />
        ))}
      </svg>
      <figcaption className="mt-1 text-center text-xs text-ink-muted">{part.label}</figcaption>
    </figure>
  );
}

function NodeShape({ n }: { n: NetNode }) {
  const mark = n.mark ? MARKS[n.mark] : null;
  // Marked nodes get the mark's fill; toned ones a tone outline; others the plain surface.
  const fillClass = mark ? mark.fill : 'fill-surface';
  const strokeStyle: CSSProperties | undefined = n.tone ? { stroke: TONES[n.tone] } : undefined;
  const strokeClass = n.tone ? '' : mark ? mark.stroke : 'stroke-line-strong';
  const ink = mark ? (n.mark === 'compare' ? 'fill-white' : 'fill-on-mark') : 'fill-ink';
  const soft = mark ? ink : 'fill-ink-soft';
  const common = { className: `transition-[fill,stroke] ${fillClass} ${strokeClass}`, style: { ...strokeStyle, transitionDuration: 'var(--tween, 300ms)' } };

  if (n.kind === 'value') {
    return (
      <motion.g initial={false} animate={{ x: n.x, y: n.y }}>
        <rect x={-BOX.w / 2} y={-BOX.h / 2} width={BOX.w} height={BOX.h} rx={6} strokeWidth={1.5} {...common} />
        <text y={-BOX.h / 2 + 13} textAnchor="middle" className={`${ink} text-[11px] font-semibold`}>
          {n.label}
        </text>
        {n.value !== undefined && (
          <text y={3} textAnchor="middle" className={`${ink} font-mono text-[10px]`}>
            {n.value}
          </text>
        )}
        {n.grad !== undefined && (
          <text y={BOX.h / 2 - 6} textAnchor="middle" className={`${soft} font-mono text-[10px]`}>
            {n.grad}
          </text>
        )}
      </motion.g>
    );
  }
  const r = n.kind === 'op' ? OP_R : NEURON_R;
  return (
    <motion.g initial={false} animate={{ x: n.x, y: n.y }}>
      <circle r={r} strokeWidth={1.5} {...common} />
      <text dy="0.35em" textAnchor="middle" className={`${ink} font-mono ${n.kind === 'op' ? 'text-[11px] font-semibold' : 'text-[9px]'}`}>
        {n.kind === 'op' ? n.label : (n.value ?? '')}
      </text>
      {n.kind === 'neuron' && n.label && (
        <text y={r + 11} textAnchor="middle" className="fill-ink-muted text-[9px]">
          {n.label}
        </text>
      )}
    </motion.g>
  );
}
