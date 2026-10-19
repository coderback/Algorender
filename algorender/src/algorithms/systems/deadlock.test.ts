import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_FRAMES, recordTrace } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { lockSystem, nested, runSchedule, type Proc } from '@/systems/deadlock';
import type { MarkKey } from '@/viz/marks';
import type { FactsPanel, GraphState, TablePanel } from '@/viz/graph/types';
import { deadlock as algo, formatInput, MAX_TURNS, parseInput, type DeadlockInput } from './deadlock';

const examples = algo.input.examples;
const traceOf = (x: DeadlockInput) => recordTrace<GraphState>(algo.run(x));
const make = (id: string, seed = 1, size = 3) => examples.find((e) => e.id === id)!.make({ seed, size });

function marksIn(state: GraphState): Set<MarkKey> {
  const used = new Set<MarkKey>([...Object.values(state.nodeMarks), ...Object.values(state.edgeMarks)]);
  for (const p of state.panels) {
    if (p.kind === 'table') for (const r of p.rows) if (r.mark) used.add(r.mark);
    if (p.kind === 'chips') for (const c of p.chips) if (c.mark) used.add(c.mark);
    if (p.kind === 'facts') for (const f of p.facts) if (f.mark) used.add(f.mark);
  }
  return used;
}

/** What is wrong with a frame's state: edges or marks pointing at nothing, duplicate ids. */
function stateProblems(state: GraphState): string[] {
  const out: string[] = [];
  const nodes = new Set(state.nodes.map((n) => n.id));
  const edges = new Set(state.edges.map((e) => e.id));
  if (edges.size !== state.edges.length) out.push('duplicate edge ids');
  for (const e of state.edges) if (!nodes.has(e.from) || !nodes.has(e.to)) out.push(`edge ${e.id} to a missing node`);
  for (const id of Object.keys(state.nodeMarks)) if (!nodes.has(id)) out.push(`mark on missing node ${id}`);
  for (const id of Object.keys(state.edgeMarks)) if (!edges.has(id)) out.push(`mark on missing edge ${id}`);
  if (state.pulse && !edges.has(state.pulse.edge)) out.push(`pulse on missing edge ${state.pulse.edge}`);
  return out;
}

function expectGoodTrace(frames: readonly Frame<GraphState>[]) {
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.length).toBeLessThan(MAX_FRAMES);
  const problems: string[] = [];
  let prev: Record<string, number> = {};
  const where = new Map(frames[0].state.nodes.map((n) => [n.id, `${n.x},${n.y}`]));
  frames.forEach((f, i) => {
    const at = (what: string) => problems.push(`frame ${i}: ${what}`);
    if (!f.note.trim()) at('no narration');
    if (f.line != null && !algo.pseudocode[f.line]?.trim()) at(`bad line ${f.line}`);
    expect(Object.keys(f.stats).sort()).toEqual(algo.stats.map((s) => s.key).sort());
    for (const [k, v] of Object.entries(f.stats)) if (v < (prev[k] ?? 0)) at(`${k} went down`);
    prev = f.stats;
    for (const n of f.state.nodes) if (where.get(n.id) !== `${n.x},${n.y}`) at(`${n.id} moved`);
    const c = f.checkpoint;
    if (c) {
      if (c.choices.length < 2 || new Set(c.choices).size !== c.choices.length) at('bad choices');
      if (!(c.answer >= 0 && c.answer < c.choices.length)) at('answer out of range');
      if (i === frames.length - 1) at('question on the last frame');
      if (f.note.includes(c.choices[c.answer])) at(`note gives away "${c.choices[c.answer]}"`);
    }
    for (const p of stateProblems(f.state)) at(p);
  });
  expect(problems.slice(0, 10)).toEqual([]);
}

const panel = <K extends GraphState['panels'][number]['kind']>(state: GraphState, id: string) =>
  state.panels.find((p) => p.id === id) as Extract<GraphState['panels'][number], { kind: K }>;
const fact = (state: GraphState, label: string) => panel<'facts'>(state, 'coffman').facts.find((f: FactsPanel['facts'][number]) => f.label === label)?.value;

const arbInput: fc.Arbitrary<DeadlockInput> = fc
  .record({
    n: fc.integer({ min: 1, max: 4 }),
    picks: fc.array(fc.tuple(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 3 })), { minLength: 4, maxLength: 4 }),
    schedule: fc.array(fc.integer({ min: 1, max: 4 }), { maxLength: 16 }),
  })
  .map(({ n, picks, schedule }) => {
    const processes: Proc[] = Array.from({ length: n }, (_, i) => {
      const [a, b] = picks[i];
      return { id: `P${i + 1}`, script: nested(a === b ? [`R${a}`] : [`R${a}`, `R${b}`]) };
    });
    return { processes, schedule: schedule.filter((k) => k <= n).map((k) => `P${k}`) };
  });

describe('deadlock', () => {
  it('builds every example and replays it with good frames', () => {
    for (const example of examples) {
      for (const seed of [1, 7, 99, 1234]) {
        for (const size of [2, 3, 5]) {
          const x = example.make({ seed, size });
          const { frames, truncated } = traceOf(x);
          expect(truncated).toBe(false);
          expectGoodTrace(frames);
        }
      }
    }
  });

  it('ends exactly as the model does, deadlocked on the same cycle or finished, on random inputs', () => {
    fc.assert(
      fc.property(arbInput, (x) => {
        const { frames } = traceOf(x);
        expectGoodTrace(frames);
        const want = runSchedule(lockSystem(x.processes), x.schedule);
        const last = frames.at(-1)!.state;
        expect(fact(last, 'Deadlocked')).toBe(want.deadlock ? 'yes' : 'no');
        if (want.deadlock) {
          const red = Object.entries(last.nodeMarks).filter(([, m]) => m === 'reject').map(([id]) => id).sort();
          expect(red).toEqual([...want.deadlock].sort());
        } else {
          expect(want.finished).toBe(true);
          expect(last.edges).toEqual([]);
        }
        expect(frames.at(-1)!.stats.turns).toBe(want.turns.length);
      }),
      { numRuns: 150 },
    );
  });

  it('teaches what each example promises', () => {
    const opposite = traceOf(make('opposite')).frames.at(-1)!.state;
    expect(fact(opposite, 'Deadlocked')).toBe('yes');
    expect(Object.values(opposite.edgeMarks).filter((m) => m === 'reject')).toHaveLength(4);
    expect(fact(traceOf(make('same-order')).frames.at(-1)!.state, 'Deadlocked')).toBe('no');
    const table = traceOf(make('philosophers')).frames.at(-1)!.state;
    expect(fact(table, 'Deadlocked')).toBe('yes');
    expect((panel<'table'>(table, 'scripts') as TablePanel).rows.every((r) => r.cells[3] === 'deadlocked')).toBe(true);
    expect(fact(traceOf(make('philosophers-ordered')).frames.at(-1)!.state, 'Deadlocked')).toBe('no');
  });

  it('asks whether a lock can be taken and whether a new wait is a deadlock, with both answers', () => {
    const asked = new Map<string, Set<number>>();
    for (const id of ['opposite', 'same-order', 'philosophers', 'philosophers-ordered']) {
      for (const f of traceOf(make(id)).frames) {
        const c = f.checkpoint;
        if (!c) continue;
        const kind = c.question.startsWith('Can') ? 'take' : 'deadlock';
        if (!asked.has(kind)) asked.set(kind, new Set());
        asked.get(kind)!.add(c.answer);
      }
    }
    expect(asked.get('take')).toEqual(new Set([0, 1]));
    expect(asked.get('deadlock')).toEqual(new Set([0, 1]));
  });

  it('keeps pseudo-code short, lists exactly the marks it uses, and names real examples in its experiments', () => {
    for (const line of algo.pseudocode) expect([...line].length).toBeLessThanOrEqual(40);
    const used = new Set<MarkKey>();
    for (const example of examples) for (const f of traceOf(example.make({ seed: 1, size: 3 })).frames) marksIn(f.state).forEach((m) => used.add(m));
    const listed = algo.legend.flatMap((e) => (typeof e === 'string' ? [e] : 'mark' in e ? [e.mark] : []));
    expect([...used].sort()).toEqual([...listed].sort());
    expect(algo.legend[0]).toHaveProperty('neutral');
    const ids = new Set(examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example)).toBe(true);
  });

  it('accepts its own formatted custom input, and explains bad input', () => {
    for (const example of examples) {
      const x = example.make({ seed: 11, size: 4 });
      expect(parseInput(formatInput(x))).toEqual({ value: x });
    }
    fc.assert(
      fc.property(arbInput, (x) => {
        expect(parseInput(formatInput(x))).toEqual({ value: x });
      }),
      { numRuns: 100 },
    );
    expect(parseInput('P1: +R1 w -R1; P2: +R1 -R1; turns: P2 P1')).toEqual({
      value: {
        processes: [
          { id: 'P1', script: [{ op: 'acquire', lock: 'R1' }, { op: 'work' }, { op: 'release', lock: 'R1' }] },
          { id: 'P2', script: [{ op: 'acquire', lock: 'R1' }, { op: 'release', lock: 'R1' }] },
        ],
        schedule: ['P2', 'P1'],
      },
    });
    const bad = (text: string) => (parseInput(text) as { error: string }).error;
    expect(bad('')).toMatch(/at least one process/);
    expect(bad('P1: +R1')).toMatch(/still holding R1/);
    expect(bad('P1: -R1')).toMatch(/without holding/);
    expect(bad('P1: +R1 x -R1')).toMatch(/isn’t a step/);
    expect(bad('P1: +R1 -R1; turns: P9')).toMatch(/P9/);
    expect(bad(`P1: +R1 -R1; turns: ${Array(MAX_TURNS + 1).fill('P1').join(' ')}`)).toMatch(/At most/);
    expect(bad('P1 +R1 -R1')).toMatch(/colon/);
  });
});
