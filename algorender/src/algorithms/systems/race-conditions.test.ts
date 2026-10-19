import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Frame } from '@/engine/types';
import { outcomeKey, outcomes, runSchedule, randomSchedule } from '@/systems/interleaving';
import { createRng } from '@/engine/random';
import type { GridState } from '@/viz/grid/types';
import { answerPositions, cell, expectGoodTrace, expectLegendMatchesMarks, expectShortPseudocode, list, table, traceOf } from '@/viz/grid/testing';
import { instrText, programOf, raceConditions, type ProgramId, type RaceInput } from './race-conditions';

const algo = raceConditions;
const examples = algo.input.examples;
const frames = (input: RaceInput) => traceOf(algo, input).frames as Frame<GridState>[];
const example = (id: string, seed = 1) => examples.find((e) => e.id === id)!.make({ seed, size: 0 });

const PROGRAMS: ProgramId[] = ['count', 'locked-count', 'atomic-count', 'withdraw', 'locked-withdraw'];
const input: fc.Arbitrary<RaceInput> = fc
  .record({ program: fc.constantFrom(...PROGRAMS), threads: fc.integer({ min: 1, max: 3 }), seed: fc.integer({ min: 0, max: 100_000 }) })
  .map(({ program, threads, seed }) => ({ program, threads, schedule: randomSchedule(programOf({ program, threads }), createRng(seed)) }));

describe('race-conditions', () => {
  it('builds every example and replays it with good frames', () => {
    for (const ex of examples) {
      for (const seed of [1, 7, 99, 1234]) {
        const { frames: fs, truncated } = traceOf(algo, ex.make({ seed, size: 0 }));
        expect(truncated).toBe(false);
        expect(fs.length).toBeLessThan(150);
        expectGoodTrace(algo, fs);
      }
    }
  });

  it('keeps pseudo-code and code rows short, lists exactly the marks it uses, and names real examples', () => {
    expectShortPseudocode(algo);
    expectLegendMatchesMarks(algo);
    expect(algo.legend[0]).toHaveProperty('neutral');
    const ids = new Set(examples.map((e) => e.id));
    for (const x of algo.content.experiments) expect(ids.has(x.example)).toBe(true);
    for (const program of PROGRAMS) {
      const code = programOf({ program, threads: 1 }).threads[0].code;
      for (const instr of code) expect([...instrText(instr, code)].length).toBeLessThanOrEqual(15);
    }
  });

  it('varies where the right answer sits', () => {
    const positions = new Set<number>();
    for (const ex of examples) for (const p of answerPositions(traceOf(algo, ex.make({ seed: 3, size: 0 })).frames)) positions.add(p);
    expect(positions.size).toBeGreaterThan(1);
  });

  it('accepts its own formatted custom input, completes short schedules, and explains bad input', () => {
    const custom = algo.input.custom!;
    for (const ex of examples) {
      const x = ex.make({ seed: 11, size: 0 });
      expect(custom.parse(custom.format(x))).toEqual({ value: x });
    }
    expect(custom.parse('count++ x2; schedule: A B A A B B')).toEqual({ value: example('lost-update') });
    expect(custom.parse('Locked count++; schedule: AAB')).toEqual({ value: example('mutex') });
    expect(custom.parse('count++')).toEqual({ value: example('one-at-a-time') });
    for (const bad of ['', 'increment x2', 'count++ x4', 'count++ x0', 'count++; schedule: C', 'count++; schedule: AAAA', `count++; schedule: ${'A'.repeat(70)}`]) {
      expect(custom.parse(bad), bad).toHaveProperty('error');
    }
  });

  it('plays the model’s run, asks honest questions, and tallies every interleaving', () => {
    fc.assert(
      fc.property(input, (x) => {
        const fs = frames(x);
        expectGoodTrace(algo, fs);
        const program = programOf(x);
        const { final } = runSchedule(program, x.schedule);
        const watch = Object.keys(program.memory)[0];
        // Shared memory ends as the model's run does.
        expect(cell(fs.at(-1)!.state, 0, 0, 'memory')).toBe(String(final.memory[watch]));
        // One frame per scheduled step, plus the intro, the end and the tally.
        expect(fs.length).toBe(x.schedule.length + 3);
        expect(list(fs.at(-1)!.state, 'schedule').items.map((it) => it.text)).toEqual(x.schedule);
        // The tally matches the model, with this run's row marked.
        const all = outcomes(program);
        const tally = table(fs.at(-1)!.state, 'outcomes');
        expect(tally.rows.map((r) => tally.cells[r.id][0])).toEqual(all.outcomes.map((o) => String(o.count)));
        expect(Object.keys(tally.rowMarks)).toEqual([`o-${outcomeKey(final.memory)}`]);
        expect(fs.at(-1)!.stats.interleavings).toBe(all.total);
        // Every "what is it afterwards?" answer is what the next frame shows.
        fs.forEach((f, i) => {
          const c = f.checkpoint;
          if (!c || !c.question.includes('afterwards')) return;
          const name = /What is (\w+) afterwards/.exec(c.question)![1];
          const row = Object.keys(program.memory).indexOf(name);
          expect(cell(fs[i + 1].state, row, 0, 'memory')).toBe(c.choices[c.answer]);
        });
      }),
      { numRuns: 120 },
    );
  });

  it('tells the stories: a lost update, a lock that waits, an overdraft', () => {
    const lost = frames(example('lost-update'));
    expect(lost.some((f) => f.note.includes('lost update'))).toBe(true);
    expect(lost.at(-1)!.note).toMatch(/2 end with count = 2/);
    expect(lost.at(-1)!.note).toMatch(/18 end with count = 1/);
    const last = lost.at(-2)!.checkpoint!;
    expect(last.choices[last.answer]).toBe('1 or 2');

    const mutex = frames(example('mutex'));
    expect(mutex.at(-1)!.stats.waits).toBe(1);
    const lockQ = mutex.filter((f) => f.checkpoint?.question.includes('lock m')).map((f) => f.checkpoint!);
    expect(lockQ.map((q) => q.choices[q.answer])).toEqual(['A takes the lock', 'B waits', 'B takes the lock']);
    expect(mutex.at(-1)!.note).toMatch(/No race/);

    const overdraft = frames(example('withdraw'));
    expect(cell(overdraft.at(-1)!.state, 0, 0, 'memory')).toBe('-60');
    expect(overdraft.some((f) => f.note.includes('overdrawn'))).toBe(true);
    expect(frames(example('locked-withdraw')).at(-1)!.note).toMatch(/every one ends with balance = 20/);
  });
});
