import { describe, expect, it } from 'vitest';
import { loadConcepts } from '@/content/concepts';
import { getExercise } from '@/content/exercises';
import { projects, type Project } from '@/content/projects';
import { stages } from '@/content/stages';
import type { EventData, EventKind, ProgressEvent } from './events';
import type { MasteryGraph } from './mastery';
import { badges, conceptLevels, xpLedger, XP } from './play';
import { builtExercises, completedProjects, projectProgress } from './projects';

let n = 0;
const at = (minute: number) => new Date(Date.UTC(2026, 10, 3, 9, minute)).toISOString();
function ev<K extends EventKind>(kind: K, data: EventData<K>, when: string): ProgressEvent {
  n++;
  return { id: `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`, kind, at: when, data } as ProgressEvent;
}
const passed = (exercise: string, stage: 'parsons' | 'fill' | 'write' | 'bug', minute: number) => ev('exercise.passed', { exercise, stage }, at(minute));

const fixture: Project = {
  slug: 'least-squares',
  title: 'Least squares from scratch',
  summary: 'Vector ops to lstsq.',
  stage: 1,
  parts: ['vec-ops', 'matmul', 'solve'],
  concepts: ['vectors', 'projections-least-squares'],
  showcase: { href: '/visualisers/linear-regression', label: 'Fit a line' },
  hours: 4,
};

describe('milestone projects', () => {
  it('count a part as built once its write or bug stage passes, in any order', () => {
    const events = [passed('matmul', 'parsons', 1), passed('vec-ops', 'write', 2), passed('solve', 'bug', 3)];
    const built = builtExercises(events);
    expect([...built.keys()]).toEqual(['vec-ops', 'solve']);
    expect(projectProgress(fixture, built)).toEqual({ done: ['vec-ops', 'solve'], next: 'matmul', complete: false });
    const all = [...events, passed('matmul', 'write', 4), passed('vec-ops', 'write', 5)];
    expect(projectProgress(fixture, builtExercises(all))).toEqual({ done: fixture.parts, next: null, complete: true, at: at(4) });
    expect(completedProjects(all, [fixture])).toEqual(new Map([['least-squares', at(4)]]));
    expect(completedProjects(events, [fixture]).size).toBe(0);
  });

  it('pay XP once, give the Builder badge, and reach the implement level in their concepts', () => {
    const events = [passed('vec-ops', 'write', 1), passed('matmul', 'write', 2), passed('solve', 'write', 3), passed('solve', 'bug', 4)];
    const ledger = xpLedger(events, [fixture]).filter((x) => x.why === 'A milestone project built');
    expect(ledger).toEqual([{ at: at(3), xp: XP.projectCompleted, why: 'A milestone project built' }]);
    expect(xpLedger(events.slice(0, 2), [fixture]).some((x) => x.why === 'A milestone project built')).toBe(false);
    expect(badges(events, [fixture]).get('builder')).toBe(at(3));
    expect(badges(events.slice(0, 2), [fixture]).has('builder')).toBe(false);
    const graph: MasteryGraph = { concepts: [], lessons: {}, exercises: {}, problems: {} };
    const levels = conceptLevels(events, graph, new Map(), [fixture]);
    for (const c of fixture.concepts) expect(levels.get(c)?.has('implement'), c).toBe(true);
    expect(conceptLevels(events.slice(0, 2), graph, new Map(), [fixture]).size).toBe(0);
  });

  it('are well formed: parts exist, concepts are on the path, one project per stage', () => {
    const concepts = new Map(loadConcepts().concepts.map((c) => [c.id, c]));
    expect(new Set(projects.map((p) => p.slug)).size).toBe(projects.length);
    expect(new Set(projects.map((p) => p.stage)).size).toBe(projects.length);
    for (const p of projects) {
      const stage = stages.find((s) => s.id === p.stage);
      expect(stage, p.slug).toBeDefined();
      expect(p.parts.length, p.slug).toBeGreaterThan(0);
      expect(new Set(p.parts).size, p.slug).toBe(p.parts.length);
      for (const part of p.parts) expect(getExercise(part), `${p.slug} → ${part}`).toBeDefined();
      // Parts run their tests on the project budget, in judge mode.
      for (const part of p.parts) expect(getExercise(part)?.judge?.budget, `${p.slug} → ${part}`).toBe('project');
      for (const c of p.concepts) {
        expect(concepts.get(c)?.planned, `${p.slug} builds ${c}, which must be available`).toBe(false);
        expect(stage!.concepts, `${p.slug} builds ${c}`).toContain(c);
      }
      expect(p.hours).toBeGreaterThanOrEqual(2);
      expect(p.hours).toBeLessThanOrEqual(6);
      expect(p.showcase.href.startsWith('/')).toBe(true);
    }
  });
});
