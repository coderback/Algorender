import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { allEvents, lamportTimes, relation, vectorTimes, type EventRef } from '@/systems/clocks';
import type { MarkKey } from '@/viz/marks';
import { expectGoodPlotTrace, planeOf, traceOf } from '@/viz/plot/testing';
import type { PlotState } from '@/viz/plot/types';
import { logicalClocks as algo, parseClocks, type ClocksInput } from './logical-clocks';

const examples = algo.input.examples;
const frames = (input: ClocksInput) => traceOf(algo, input).frames as Frame<PlotState>[];
const SEEDS = [1, 7, 99, 1234, 5150];

const inputs: ClocksInput[] = examples.flatMap((ex) => SEEDS.flatMap((seed) => [3, 4].map((size) => ex.make({ seed, size }))));

/** The timestamp label on each event's dot, by "p:i". */
function labels(state: PlotState): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const s of planeOf(state).shapes) if (s.kind === 'point' && s.id.startsWith('ev-')) out.set(s.id.slice(3), s.label);
  return out;
}

function marksIn(state: PlotState): Set<MarkKey> {
  const used = new Set<MarkKey>();
  for (const part of state.parts) {
    if (part.kind === 'plane') for (const s of part.shapes) if ('mark' in s && s.mark) used.add(s.mark);
    if (part.kind === 'tokens') for (const t of part.tokens) if (t.mark) used.add(t.mark);
    if (part.kind === 'readouts') for (const r of part.items) if (r.mark) used.add(r.mark);
  }
  return used;
}

const name = (input: ClocksInput, e: EventRef) => `${input.scenario.processes[e.p].id.toLowerCase()}${e.i + 1}`;

describe('logical-clocks', () => {
  it('plays every example, at every size and seed, as a good trace', () => {
    for (const input of inputs) {
      const { frames: fs, truncated } = traceOf(algo, input);
      expect(truncated).toBe(false);
      expectGoodPlotTrace(algo, fs as Frame<PlotState>[]);
      expect(fs.length).toBeLessThan(150);
    }
  });

  it('ends with every event stamped as the model says', () => {
    for (const input of inputs) {
      const last = frames(input).at(-1)!.state;
      const L = lamportTimes(input.scenario);
      const V = vectorTimes(input.scenario);
      const shown = labels(last);
      for (const e of allEvents(input.scenario)) {
        expect(shown.get(`${e.p}:${e.i}`)).toBe(input.mode === 'lamport' ? String(L[e.p][e.i]) : V[e.p][e.i].join(','));
      }
    }
  });

  it('asks honestly: a receive’s stamp is the one it then gets, and a pair’s relation is the real one', () => {
    let receives = 0;
    let pairs = 0;
    for (const input of inputs) {
      const fs = frames(input);
      fs.forEach((f, k) => {
        const c = f.checkpoint;
        if (!c) return;
        const answer = c.choices[c.answer];
        if (c.question.startsWith('What')) {
          receives++;
          const event = String(f.vars.event);
          const ref = allEvents(input.scenario).find((e) => name(input, e) === event)!;
          const stamp = input.mode === 'lamport' ? String(lamportTimes(input.scenario)[ref.p][ref.i]) : `[${vectorTimes(input.scenario)[ref.p][ref.i].join(',')}]`;
          expect(answer).toBe(stamp);
          expect(labels(fs[k + 1].state).get(`${ref.p}:${ref.i}`)).toBe(stamp.replace(/[[\]]/g, ''));
        } else {
          pairs++;
          const [x, y] = [String(f.vars.e), String(f.vars.f)].map((n) => allEvents(input.scenario).find((e) => name(input, e) === n)!);
          const r = relation(input.scenario, x, y);
          expect(answer).toBe(r === 'before' ? `${name(input, x)} happened before ${name(input, y)}` : r === 'after' ? `${name(input, y)} happened before ${name(input, x)}` : 'Concurrent');
        }
      });
    }
    expect(receives).toBeGreaterThan(20);
    expect(pairs).toBeGreaterThan(20);
  });

  it('shows that a smaller Lamport time can belong to a concurrent event', () => {
    const fs = frames(examples.find((x) => x.id === 'misleads')!.make({ seed: 0, size: 3 }));
    const q = fs.find((f) => f.checkpoint?.choices.includes('Concurrent') && f.checkpoint.choices[f.checkpoint.answer] === 'Concurrent')!;
    expect([q.vars.e, q.vars.f]).toEqual(['a1', 'c2']);
    expect(fs.at(-1)!.note).toMatch(/1 < 4/);
  });

  it('keeps pseudo-code short, lists exactly the marks it uses, varies answers, and names real examples', () => {
    for (const line of algo.pseudocode) expect(line.length).toBeLessThanOrEqual(42);
    const used = new Set<MarkKey>();
    const positions = new Set<number>();
    for (const input of inputs) {
      for (const f of frames(input)) {
        marksIn(f.state).forEach((m) => used.add(m));
        if (f.checkpoint) positions.add(f.checkpoint.answer);
      }
    }
    const listed = algo.legend.flatMap((e) => (typeof e === 'string' ? [e] : 'mark' in e ? [e.mark] : []));
    expect([...used].sort()).toEqual([...new Set(listed)].sort());
    expect(algo.legend[0]).toHaveProperty('neutral');
    expect(positions.size).toBeGreaterThan(2);
    const ids = new Set(examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example)).toBe(true);
  });

  it('round-trips custom input and explains bad input', () => {
    const custom = algo.input.custom!;
    for (const input of inputs) expect(custom.parse(custom.format(input))).toEqual({ value: input });
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 3, max: 4 }), (seed, size) => {
        const x = examples.find((e) => e.id === 'random-vector')!.make({ seed, size });
        expect(custom.parse(custom.format(x))).toEqual({ value: x });
      }),
    );
    expect(parseClocks('vector; A: local, send m1; B: receive M1, local')).toEqual({
      value: {
        mode: 'vector',
        scenario: {
          processes: [
            { id: 'A', events: [{ kind: 'local' }, { kind: 'send', msg: 'm1' }] },
            { id: 'B', events: [{ kind: 'recv', msg: 'm1' }, { kind: 'local' }] },
          ],
        },
      },
    });
    for (const bad of [
      'A: local; B: local',
      'lamport; A: local',
      'lamport; A: jump; B: local',
      'lamport; A: recv m1; B: local',
      'lamport; A: recv y, send x; B: recv x, send y',
      'lamport; a: local; B: local',
      'lamport; A: ; B: local',
    ]) {
      expect(parseClocks(bad)).toHaveProperty('error');
    }
  });
});
