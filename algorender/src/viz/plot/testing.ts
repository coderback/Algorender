import { expect } from 'vitest';
import type { AnyAlgorithm } from '@/engine/module';
import { MAX_FRAMES, recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { PlanePart, PlotState, Vec } from './types';

/** Records a module's trace on an input. */
export function traceOf(algo: AnyAlgorithm, input: unknown) {
  return recordTrace(algo.run(input) as Iterable<Frame<PlotState>>);
}

export const planeOf = (state: PlotState, id = 'plane') => {
  const p = state.parts.find((x) => x.kind === 'plane' && x.id === id);
  if (!p || p.kind !== 'plane') throw new Error(`no plane "${id}"`);
  return p;
};

export const readout = (state: PlotState, id: string) => {
  for (const part of state.parts) if (part.kind === 'readouts') for (const item of part.items) if (item.id === id) return item.value;
  return undefined;
};

const finite = (v: Vec) => Number.isFinite(v[0]) && Number.isFinite(v[1]);

function planeProblems(p: PlanePart): string[] {
  const problems: string[] = [];
  if (!(p.x.min < p.x.max && p.y.min < p.y.max)) problems.push(`${p.id}: empty axis range`);
  const ids = new Set<string>();
  for (const s of p.shapes) {
    if (ids.has(s.id)) problems.push(`${p.id}: repeated shape id ${s.id}`);
    ids.add(s.id);
    const points: Vec[] =
      s.kind === 'vector' ? [s.from, s.to] : s.kind === 'point' ? [s.at] : s.kind === 'path' ? [...s.points] : s.kind === 'line' ? [s.through, s.dir] : s.kind === 'label' ? [s.at] : [];
    if (!points.every(finite)) problems.push(`${p.id}: ${s.id} has a coordinate that is not finite`);
    if (s.kind === 'line' && s.dir[0] === 0 && s.dir[1] === 0) problems.push(`${p.id}: line ${s.id} has no direction`);
    if (s.kind === 'heatmap' && (s.values.length !== s.cols * s.rows || !s.values.every(Number.isFinite))) problems.push(`${p.id}: heatmap ${s.id} is malformed`);
    if (s.kind === 'bars') {
      const barIds = new Set(s.bars.map((b) => b.id));
      if (barIds.size !== s.bars.length) problems.push(`${p.id}: ${s.id} repeats a bar id`);
      for (const b of s.bars) if (![b.x0, b.x1, b.y, b.y0 ?? 0].every(Number.isFinite) || b.x1 < b.x0) problems.push(`${p.id}: bar ${b.id} is malformed`);
    }
  }
  for (const h of p.handles) {
    const onStep = (v: number) => Math.abs(v / h.step - Math.round(v / h.step)) < 1e-6;
    if (!finite(h.at) || h.at.some((v, k) => v < h.min[k] - 1e-9 || v > h.max[k] + 1e-9)) problems.push(`${p.id}: handle ${h.id} outside its bounds`);
    else if (!h.at.every(onStep)) problems.push(`${p.id}: handle ${h.id} at ${h.at} is not on its ${h.step} step`);
  }
  return problems;
}

/**
 * The checks every plot trace must pass: narrated frames, real pseudo-code
 * lines, counters that never go backwards, well-formed predictions (a worded
 * answer must not appear in the question's own note), and well-formed planes.
 */
export function expectGoodPlotTrace(algo: AnyAlgorithm, frames: readonly Frame<PlotState>[], opts: { handlesOnStep?: boolean } = {}) {
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.length).toBeLessThan(MAX_FRAMES);
  expect(Object.keys(frames[0].stats).sort()).toEqual(algo.stats.map((s) => s.key).sort());
  const problems: string[] = [];
  let prev: Record<string, number> = {};
  frames.forEach((frame, i) => {
    const at = (what: string) => problems.push(`frame ${i}: ${what}`);
    if (frame.note.trim() === '') at('no narration');
    if (frame.line != null && (frame.line < 0 || frame.line >= algo.pseudocode.length || algo.pseudocode[frame.line].trim() === '')) {
      at(`points at pseudo-code line ${frame.line}`);
    }
    for (const [k, v] of Object.entries(frame.stats)) if (v < (prev[k] ?? 0)) at(`${k} went down`);
    prev = frame.stats;
    const c = frame.checkpoint;
    if (c) {
      if (c.choices.length < 2) at('fewer than two choices');
      if (new Set(c.choices).size !== c.choices.length) at(`repeated choices ${c.choices.join(' | ')}`);
      if (!(c.answer >= 0 && c.answer < c.choices.length)) at('answer out of range');
      if (i === frames.length - 1) at('question on the last frame');
      // Numbers often coincide with values the note names for other reasons; only worded answers are checked.
      const answer = c.choices[c.answer] ?? '';
      if (/[a-z]{4,}/i.test(answer) && !['Yes', 'No'].includes(answer) && frame.note.includes(answer)) at(`note gives away "${answer}"`);
    }
    for (const part of frame.state.parts) {
      if (part.kind === 'image') {
        if (part.pixels.length !== part.width * part.height) at(`${part.id}: ${part.pixels.length} pixels for ${part.width}×${part.height}`);
        if (!part.pixels.every(Number.isFinite)) at(`${part.id}: a pixel is not finite`);
        if (part.values && part.values.length !== part.pixels.length) at(`${part.id}: ${part.values.length} values for ${part.pixels.length} pixels`);
        for (const b of part.boxes ?? []) {
          if (!(b.w > 0 && b.h > 0 && b.x >= 0 && b.y >= 0 && b.x + b.w <= part.width + 1e-9 && b.y + b.h <= part.height + 1e-9)) at(`${part.id}: box ${b.id} outside the picture`);
        }
        if (new Set((part.boxes ?? []).map((b) => b.id)).size !== (part.boxes ?? []).length) at(`${part.id}: repeated box id`);
      }
      if (part.kind === 'tokens') {
        if (new Set(part.tokens.map((t) => t.id)).size !== part.tokens.length) at(`${part.id}: repeated token id`);
        if (part.tokens.some((t) => t.text === '')) at(`${part.id}: an empty token`);
      }
      if (part.kind === 'network') {
        const ids = new Set(part.nodes.map((n) => n.id));
        if (ids.size !== part.nodes.length) at(`${part.id}: repeated node id`);
        if (!part.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))) at(`${part.id}: a node has no position`);
        for (const e of part.edges) if (!ids.has(e.from) || !ids.has(e.to)) at(`${part.id}: edge ${e.id} joins a missing node`);
        if (new Set(part.edges.map((e) => e.id)).size !== part.edges.length) at(`${part.id}: repeated edge id`);
      }
      if (part.kind === 'bits') {
        const covered = part.fields.reduce((n, f) => n + (f.to - f.from), 0);
        if (covered !== part.bits.length || part.fields.some((f, i) => f.from !== (i ? part.fields[i - 1].to : 0))) at(`${part.id}: fields don't tile the bits`);
      }
      if (part.kind !== 'plane') continue;
      for (const p of planeProblems(part)) if (opts.handlesOnStep !== false || !p.includes('step')) at(p);
    }
  });
  expect(problems.slice(0, 10)).toEqual([]);
}
