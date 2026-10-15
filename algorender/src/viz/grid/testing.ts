// Test helpers for modules that render with the grid view. Imported only by
// *.test.ts files.
import { expect } from 'vitest';
import type { AnyAlgorithm } from '@/engine/module';
import { MAX_FRAMES, recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import type { MarkKey } from '@/viz/marks';
import type { GridState, ListPart, TablePart } from './types';

export function traceOf<I>(algo: AnyAlgorithm, input: I) {
  return recordTrace<GridState>(algo.run(input));
}

export function table(state: GridState, id = 'main'): TablePart {
  const part = state.parts.find((p): p is TablePart => p.kind === 'table' && p.id === id);
  if (!part) throw new Error(`No table "${id}"`);
  return part;
}

/** Cell text by row position and column. */
export function cell(state: GridState, row: number, col: number, id = 'main'): string {
  const t = table(state, id);
  return t.cells[t.rows[row].id][col];
}

export function list(state: GridState, id: string): ListPart {
  const part = state.parts.find((p): p is ListPart => p.kind === 'list' && p.id === id);
  if (!part) throw new Error(`No list "${id}"`);
  return part;
}

/** Problems with a grid state: references to rows, cells or ids that don't exist. Empty when well formed. */
export function stateProblems(state: GridState): string[] {
  const problems: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (!ok) problems.push(what);
  };
  for (const part of state.parts) {
    if (part.kind === 'meter') {
      check(part.segments.reduce((s, x) => s + x.amount, 0) <= part.total + 1e-9, `meter ${part.id} overfilled`);
      continue;
    }
    if (part.kind === 'list') {
      check(new Set(part.items.map((it) => it.id)).size === part.items.length, `list ${part.id} repeats an id`);
      continue;
    }
    const rows = new Set(part.rows.map((r) => r.id));
    const cols = part.cols.length;
    check(rows.size === part.rows.length, `table ${part.id} repeats a row id`);
    check(Object.keys(part.cells).length === rows.size && part.rows.every((r) => part.cells[r.id]?.length === cols), `table ${part.id} cells don't match its rows and columns`);
    const inRange = (at: { row: string; col: number }) => rows.has(at.row) && at.col >= 0 && at.col < cols;
    for (const key of [...Object.keys(part.marks), ...Object.keys(part.tints), ...Object.keys(part.styles)]) {
      const split = key.lastIndexOf(':');
      check(inRange({ row: key.slice(0, split), col: Number(key.slice(split + 1)) }), `cell key ${key} out of range`);
    }
    for (const row of Object.keys(part.rowMarks)) check(rows.has(row), `row mark on missing row ${row}`);
    for (const col of Object.keys(part.colMarks)) check(Number(col) >= 0 && Number(col) < cols, `column mark on missing column ${col}`);
    for (const a of part.arrows) check(inRange(a.from) && inRange(a.to), `arrow ${a.id} out of range`);
    check(new Set(part.arrows.map((a) => a.id)).size === part.arrows.length, 'repeated arrow id');
    for (const p of part.pieces) check(inRange(p.at), `piece ${p.id} off the board`);
    check(new Set(part.pieces.map((p) => p.id)).size === part.pieces.length, 'repeated piece id');
    for (const b of part.bars) check(rows.has(b.row) && b.from >= 0 && b.from < b.to && b.to <= cols, `bar ${b.id} out of range`);
    for (const g of part.guides) check(g.at >= 0 && g.at <= cols, `guide at ${g.at} out of range`);
  }
  return problems;
}

/**
 * The checks every trace must pass: narrated frames, real pseudo-code lines,
 * counters that never go backwards, well-formed predictions that the next
 * frame resolves without the question's own note giving a worded answer away,
 * and well-formed state. Collects every problem, then asserts once.
 */
export function expectGoodTrace(algo: AnyAlgorithm, frames: readonly Frame<GridState>[]) {
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
      const answer = c.choices[c.answer] ?? '';
      if (answer.length > 3 && frame.note.includes(answer)) at(`note gives away "${answer}"`);
    }
    for (const p of stateProblems(frame.state)) at(p);
  });
  expect(problems.slice(0, 10)).toEqual([]);
}

/** Every mark that appears anywhere in a state. */
export function marksIn(state: GridState): Set<MarkKey> {
  const used = new Set<MarkKey>();
  const add = (m: MarkKey | null | undefined) => m && used.add(m);
  for (const part of state.parts) {
    if (part.kind === 'list') part.items.forEach((it) => add(it.mark));
    else if (part.kind === 'meter') part.segments.forEach((s) => add(s.mark));
    else {
      [part.marks, part.tints, part.rowMarks, part.colMarks].forEach((r) => Object.values(r).forEach(add));
      [...part.arrows, ...part.pieces, ...part.bars, ...part.guides].forEach((x) => add(x.mark));
    }
  }
  return used;
}

/** The legend lists exactly the marks the module's examples use. */
export function expectLegendMatchesMarks(algo: AnyAlgorithm) {
  const used = new Set<MarkKey>();
  for (const example of algo.input.examples) {
    const { frames } = traceOf(algo, example.make({ seed: 1, size: algo.input.size?.default ?? 0 }));
    for (const f of frames) marksIn(f.state).forEach((m) => used.add(m));
  }
  const listed = algo.legend.flatMap((e) => (typeof e === 'string' ? [e] : 'mark' in e ? [e.mark] : []));
  expect([...used].sort()).toEqual([...listed].sort());
}

/** Pseudo-code fits a 360px side panel: about 40 monospace characters per line. */
export function expectShortPseudocode(algo: AnyAlgorithm) {
  for (const line of algo.pseudocode) expect([...line].length).toBeLessThanOrEqual(40);
}

/** Where the right answer sits among the choices, over a whole trace. */
export function answerPositions(frames: readonly Frame<GridState>[]): Set<number> {
  return new Set(frames.flatMap((f) => (f.checkpoint ? [f.checkpoint.answer] : [])));
}
