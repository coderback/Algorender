import { describe, expect, it } from 'vitest';
import { loadConcepts } from './concepts';
import { lessons } from './lessons';
import { tasks } from './tasks';
import { endsUnit, unitOf, units } from './units';

describe('the units of the language tracks', () => {
  const { tracks, concepts } = loadConcepts();
  const areaOf = new Map(tracks.map((t) => [t.id, t.area]));
  const language = concepts.filter((c) => areaOf.get(c.track) === 'languages');

  it('are numbered 1, 2, 3… in order on each track', () => {
    for (const track of new Set(units.map((u) => u.track))) {
      const mine = units.filter((u) => u.track === track);
      expect(mine.map((u) => u.n)).toEqual(mine.map((_, i) => i + 1));
    }
  });

  it('hold every language topic exactly once, on its own track', () => {
    const listed = units.flatMap((u) => u.concepts);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(language.map((c) => c.id).sort());
    for (const c of language) expect(unitOf(c.id)?.track, c.id).toBe(c.track);
  });

  it('never need a topic from a later unit, or a later topic of the same unit', () => {
    const place = new Map(units.flatMap((u) => u.concepts.map((c, i) => [c, [u.n, i]] as const)));
    for (const c of language) {
      const [n, i] = place.get(c.id)!;
      for (const p of c.prereqs) {
        const at = place.get(p);
        if (!at) continue;
        expect(at[0] < n || (at[0] === n && at[1] < i), `${c.id} (unit ${n}) needs ${p} (unit ${at[0]})`).toBe(true);
      }
    }
  });

  it('write their topics in order: a written topic has a lesson and at least three tasks, one of them an output to predict', () => {
    for (const c of language.filter((x) => !x.planned)) {
      expect(lessons.some((l) => l.slug === c.lesson && l.concept === c.id), `${c.id} has no lesson`).toBe(true);
      const mine = tasks.filter((t) => t.concept === c.id);
      expect(mine.length, `${c.id}: at least three tasks`).toBeGreaterThanOrEqual(3);
      expect(mine.length, `${c.id}: at most eight tasks`).toBeLessThanOrEqual(8);
      expect(mine.some((t) => t.kind === 'output'), `${c.id}: an output task`).toBe(true);
      expect(mine.some((t) => t.kind !== 'output' && t.kind !== 'choice'), `${c.id}: a task that writes or arranges code`).toBe(true);
    }
    // A planned topic has no tasks yet.
    for (const t of tasks) expect(concepts.find((c) => c.id === t.concept)?.planned, `${t.slug} sits on a planned topic`).toBe(false);
  });

  it('end each unit in the one topic that asks for an explanation', () => {
    expect(endsUnit('py-booleans')).toBe(true);
    expect(endsUnit('py-variables')).toBe(false);
    expect(endsUnit('arrays')).toBe(false);
  });
});
