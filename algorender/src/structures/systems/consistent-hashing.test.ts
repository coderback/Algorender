import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockedReason, type OpCall } from '@/components/explorer/operations';
import type { AnyAlgorithm, Args } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import type { Frame } from '@/engine/types';
import { expectGoodPlotTrace, readout } from '@/viz/plot/testing';
import type { PlotState } from '@/viz/plot/types';
import { modMoved, movedKeys, placement, serverFor } from '@/systems/ring';
import { consistentHashingStructure as ds, MAX_KEYS, SERVERS, type HashRingModel } from './consistent-hashing';

const op = (id: string) => ds.operations.find((o) => o.id === id)!;
const run = (id: string, model: HashRingModel, args: Args) => recordOperation(op(id).run(model, args)) as { frames: Frame<PlotState>[]; result: HashRingModel };
/** The generic plot checks, with this operation's pseudo-code. */
const asAlgorithm = (id: string) => ({ ...ds, kind: 'algorithm', pseudocode: op(id).pseudocode }) as unknown as AnyAlgorithm;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** A random operation that can run on `m`, or null. */
function pick(m: HashRingModel, r: number, word: string): OpCall | null {
  const options: OpCall[] = [];
  const free = SERVERS.filter((s) => !m.ring.servers.includes(s));
  if (free.length) options.push({ op: 'add-server', args: { server: free[Math.floor(r * free.length)] } });
  if (m.ring.servers.length > 1) options.push({ op: 'remove-server', args: { server: m.ring.servers[Math.floor(r * m.ring.servers.length)] } });
  if (m.keys.length < MAX_KEYS && !m.keys.includes(word)) options.push({ op: 'add-key', args: { key: word } });
  if (m.keys.length) options.push({ op: 'lookup', args: { key: m.keys[Math.floor(r * m.keys.length)] } });
  const call = options[Math.floor(r * 997) % options.length] ?? null;
  return call && !blockedReason(ds, m, call) ? call : null;
}

describe('consistent hashing (the visualiser)', () => {
  it('draws every starting state', () => {
    for (const s of ds.initial) for (const seed of [1, 2, 3]) {
      const state = ds.snapshot(s.make(seed));
      expect(state.parts.some((p) => p.kind === 'plane')).toBe(true);
    }
  });

  it('runs any sequence of operations with good traces, honest questions and untouched models', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ds.initial.map((s) => s.id)),
        fc.integer({ min: 0, max: 1000 }),
        fc.array(fc.tuple(fc.double({ min: 0, max: 0.999, noNaN: true }), fc.stringMatching(/^[a-z]{1,8}$/)), { minLength: 1, maxLength: 8 }),
        (startId, seed, steps) => {
          let model = ds.initial.find((s) => s.id === startId)!.make(seed);
          for (const [r, word] of steps) {
            const call = pick(model, r, word);
            if (!call) continue;
            const before = structuredClone(model);
            const { frames, result } = run(call.op, deepFreeze(model), call.args);
            expect(model).toEqual(before);
            expectGoodPlotTrace(asAlgorithm(call.op), frames);

            const c = frames.find((f) => f.checkpoint)?.checkpoint;
            const answer = c ? c.choices[c.answer] : null;
            if (call.op === 'add-key' || call.op === 'lookup') {
              const key = String(call.args.key);
              const owner = serverFor(model.ring, key)!;
              if (c) expect(answer).toBe(owner);
              expect(frames.find((f) => f.checkpoint)?.note ?? '').not.toContain(`server ${owner}`);
              expect(result.keys).toEqual(call.op === 'add-key' ? [...model.keys, key] : model.keys);
              expect(result.ring).toBe(model.ring);
            } else {
              const moved = movedKeys(model.ring, result.ring, model.keys);
              const s = String(call.args.server);
              expect(result.ring.servers.includes(s)).toBe(call.op === 'add-server');
              expect(result.keys).toEqual(model.keys);
              expect(result.last).toEqual({ moved: moved.length, total: model.keys.length, mod: modMoved(model.ring.servers, result.ring.servers, model.keys).length });
              if (c && /How many/.test(c.question)) expect(Number(answer)).toBe(moved.length);
              if (c && /Where do/.test(c.question)) for (const k of moved) expect(serverFor(result.ring, k)).toBe(answer);
              expect(frames.at(-1)!.stats.moved).toBe(moved.length);
              expect(readout(frames.at(-1)!.state, 'last')).toBe(`${moved.length} of ${model.keys.length} keys moved (mod N: ${result.last!.mod})`);
            }
            // The last frame shows every stored key on its real server.
            const keysPart = frames.at(-1)!.state.parts.find((p) => p.kind === 'tokens');
            if (keysPart?.kind === 'tokens') {
              const where = placement(result.ring, result.keys);
              expect(keysPart.tokens.map((t) => `${t.text} ${t.sub}`)).toEqual(result.keys.map((k) => `${k} → ${where.get(k)}`));
            }
            model = result;
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('says why an operation can’t run', () => {
    const full = ds.initial[0].make(1);
    const four = run('add-server', full, { server: 'D' }).result;
    expect(op('add-server').disabledReason!(four)).toMatch(/room for 4/);
    const lone = ds.initial.find((s) => s.id === 'one-server')!.make(1);
    expect(op('remove-server').disabledReason!(lone)).toMatch(/at least one/);
    expect(op('add-key').disabledReason!(full, { key: 'apple' })).toMatch(/already stored/);
    expect(op('add-key').disabledReason!(full, { key: 'walnut' })).toBeNull();
    expect(blockedReason(ds, full, { op: 'lookup', args: { key: 'walnut' } })).not.toBeNull();
  });

  it('asks where a leaving server’s keys go when it has one node, and how many move otherwise', () => {
    const one = ds.initial.find((s) => s.id === 'vnodes-1')!.make(1);
    const holder = one.ring.servers.find((s) => one.keys.some((k) => serverFor(one.ring, k) === s))!;
    const where = run('remove-server', one, { server: holder }).frames[0].checkpoint!;
    expect(where.question).toMatch(/Where do/);
    const ten = ds.initial.find((s) => s.id === 'vnodes-10')!.make(1);
    const count = run('remove-server', ten, { server: 'A' }).frames[0].checkpoint!;
    expect(count.question).toMatch(/How many/);
    expect(count.choices.map(Number)).toEqual([...count.choices.map(Number)].sort((a, b) => a - b));
  });
});
