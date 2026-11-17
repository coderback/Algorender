import { describe, expect, it } from 'vitest';
import { loadConcepts } from './concepts';
import { stageOf, stages } from './stages';

describe('the stages of the math and ML path', () => {
  const { tracks, concepts } = loadConcepts();
  const areaOf = new Map(tracks.map((t) => [t.id, t.area]));
  const mathMl = concepts.filter((c) => areaOf.get(c.track) === 'math' || areaOf.get(c.track) === 'ml');

  it('are numbered 1 to 10 in order', () => {
    expect(stages.map((s) => s.id)).toEqual(Array.from({ length: stages.length }, (_, i) => i + 1));
    expect(stages).toHaveLength(10);
  });

  it('hold every math and ML concept exactly once, and nothing else', () => {
    const listed = stages.flatMap((s) => s.concepts);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(mathMl.map((c) => c.id).sort());
    for (const c of mathMl) expect(stageOf(c.id)?.concepts).toContain(c.id);
  });

  it('never need a concept from a later stage, counting the prerequisites still to come', () => {
    const stageNo = new Map(stages.flatMap((s) => s.concepts.map((c) => [c, s.id] as const)));
    for (const c of mathMl) {
      for (const p of [...c.prereqs, ...c.later]) {
        const ps = stageNo.get(p);
        if (ps !== undefined) expect(ps, `${c.id} (stage ${stageNo.get(c.id)}) needs ${p} (stage ${ps})`).toBeLessThanOrEqual(stageNo.get(c.id)!);
      }
    }
  });
});
