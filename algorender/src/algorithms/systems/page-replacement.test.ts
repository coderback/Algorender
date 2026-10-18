import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { faultsOf, simulatePaging, type ReplacementPolicy } from '@/systems/paging';
import { answerPositions, cell, expectGoodTrace, expectLegendMatchesMarks, expectShortPseudocode, traceOf } from '@/viz/grid/testing';
import type { GridState } from '@/viz/grid/types';
import type { Frame } from '@/engine/types';
import { MAX_FRAMES, MAX_REFS, pageReplacement, type PagingInput } from './page-replacement';

const inputArb = fc.record({
  policy: fc.constantFrom<ReplacementPolicy>('fifo', 'lru', 'opt', 'clock'),
  frames: fc.integer({ min: 1, max: 4 }),
  refs: fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 14 }),
});

const last = (frames: readonly Frame<GridState>[]) => frames[frames.length - 1];

describe('page-replacement', () => {
  it('plays every example as a good trace, with a legend matching its marks', () => {
    for (const ex of pageReplacement.input.examples) {
      const frames = traceOf(pageReplacement, ex.make({ seed: 3, size: pageReplacement.input.size!.default })).frames;
      expectGoodTrace(pageReplacement, frames);
    }
    expectLegendMatchesMarks(pageReplacement);
    expectShortPseudocode(pageReplacement);
  });

  it('counts the faults the model counts, and fills the table with memory after each reference', () => {
    fc.assert(
      fc.property(inputArb, (input: PagingInput) => {
        const frames = traceOf(pageReplacement, input).frames;
        expectGoodTrace(pageReplacement, frames);
        const end = last(frames);
        const sim = simulatePaging(input.refs, input.frames, input.policy);
        expect(end.stats).toEqual({ references: input.refs.length, faults: sim.faults, hits: sim.hits });
        sim.states.forEach((s, col) => {
          s.frames.forEach((page, row) => expect(cell(end.state, row, col)).toBe(page == null ? '' : String(page)));
          expect(cell(end.state, input.frames, col)).toBe(sim.steps[col].hit ? '✓' : 'F');
        });
      }),
      { numRuns: 150 },
    );
  });

  it('asks hit-or-fault at every reference and which page goes at every full-memory fault, honestly', () => {
    const input: PagingInput = { policy: 'lru', frames: 3, refs: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2] };
    const frames = traceOf(pageReplacement, input).frames;
    const sim = simulatePaging(input.refs, input.frames, input.policy);
    const hitOrFault = frames.filter((f) => f.checkpoint?.question.endsWith('hit or fault?'));
    expect(hitOrFault.map((f) => f.checkpoint!.choices[f.checkpoint!.answer])).toEqual(sim.steps.map((s) => (s.hit ? 'Hit' : 'Fault')));
    const victims = frames.filter((f) => f.checkpoint?.question.startsWith('Which page'));
    expect(victims.map((f) => Number(f.checkpoint!.choices[f.checkpoint!.answer]))).toEqual(sim.steps.filter((s) => s.evicted != null).map((s) => s.evicted));
    expect(answerPositions(victims).size).toBeGreaterThan(1);
  });

  it('shows the classic results: Bélády’s anomaly and the loop LRU gets wrong', () => {
    const faults = (id: string) => last(traceOf(pageReplacement, pageReplacement.input.examples.find((e) => e.id === id)!.make({ seed: 1, size: 12 })).frames).stats.faults;
    expect([faults('belady-3'), faults('belady-4')]).toEqual([9, 10]);
    expect(faults('loop-lru')).toBe(12);
    expect(faults('loop-opt')).toBe(faultsOf([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4], 3, 'opt'));
    expect(faults('loop-opt')).toBeLessThan(12);
    expect(['fifo', 'lru', 'opt', 'clock'].map(faults)).toEqual([10, 9, 7, 9]);
  });

  it('round-trips custom input and explains bad input', () => {
    const { parse, format } = pageReplacement.input.custom!;
    fc.assert(
      fc.property(inputArb, (input) => {
        const parsed = parse(format(input));
        expect(parsed).toEqual({ value: input });
      }),
    );
    expect(parse('LRU 3: 7, 0, 1')).toEqual({ value: { policy: 'lru', frames: 3, refs: [7, 0, 1] } });
    for (const bad of ['', 'lru: 1 2', 'mru 3: 1 2', `lru ${MAX_FRAMES + 1}: 1`, 'lru 0: 1', 'fifo 3:', 'opt 3: 1 x', 'opt 3: 10', `fifo 2: ${Array(MAX_REFS + 1).fill(1).join(' ')}`]) {
      expect('error' in parse(bad), bad).toBe(true);
    }
  });

  it('keeps random examples reproducible and inside the limits', () => {
    const ex = pageReplacement.input.examples.find((e) => e.id === 'random')!;
    expect(ex.make({ seed: 5, size: 10 })).toEqual(ex.make({ seed: 5, size: 10 }));
    for (let seed = 0; seed < 20; seed++) {
      const { refs } = ex.make({ seed, size: MAX_REFS });
      expect(refs).toHaveLength(MAX_REFS);
      for (const p of refs) expect(p >= 0 && p <= 9).toBe(true);
    }
  });
});
