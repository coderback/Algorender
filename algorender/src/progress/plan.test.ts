import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { goals, type Goal } from '@/content/goals';
import { masteryGraph, planCatalog } from '@/content/mastery';
import type { EventData, EventKind, ProgressEvent } from './events';
import { mastery, type MasteryGraph } from './mastery';
import { currentPlan, goalConcepts, pack, planView, prerequisiteOrder, REVIEW_SHARE, WEEK_MS } from './plan';

let n = 0;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 5, 9);
const at = (days: number) => new Date(T0 + days * DAY + (n % 1000)).toISOString();
function ev<K extends EventKind>(kind: K, data: EventData<K>, when: string): ProgressEvent {
  n++;
  return { id: `0190a000-0000-7000-8000-${String(n).padStart(12, '0')}`, kind, at: when, data } as ProgressEvent;
}

// a → b → c, a → d; each concept takes an hour.
const tiny: MasteryGraph = {
  concepts: [
    { id: 'a', title: 'A', track: 'foundations', prereqs: [], lesson: 'la', visualisers: [], planned: false, depth: 0 },
    { id: 'b', title: 'B', track: 'foundations', prereqs: ['a'], lesson: 'lb', visualisers: [], planned: false, depth: 1 },
    { id: 'c', title: 'C', track: 'foundations', prereqs: ['b'], visualisers: [], planned: false, depth: 2 },
    { id: 'd', title: 'D', track: 'foundations', prereqs: ['a'], visualisers: [], planned: false, depth: 1 },
  ],
  lessons: { la: 'a', lb: 'b' },
  exercises: {},
  problems: {},
};
const tinyGoal: Goal = { id: 'g', title: 'G', summary: 'g', concepts: ['c', 'd'] };
const hour = { a: 60, b: 60, c: 60, d: 60 };
const setPlan = (hours: number, when: string, target?: string) => ev('plan.set', { goal: 'g', hours, ...(target && { target }) }, when);
const mark = (concept: string, when: string) => ev('concept.marked', { concept, known: true }, when);

describe('the plan settings', () => {
  it('the latest plan wins, and a null goal clears it', () => {
    expect(currentPlan([])).toBeNull();
    const events = [setPlan(5, at(0)), ev('plan.set', { goal: 'g', hours: 8 }, at(1))];
    expect(currentPlan(events)).toMatchObject({ goal: 'g', hours: 8, since: events[1].at });
    expect(currentPlan([...events, ev('plan.set', { goal: null, hours: 8 }, at(2))])).toBeNull();
  });
});

describe('scheduling', () => {
  it('orders every concept after what it builds on', () => {
    const graph = masteryGraph();
    for (const goal of goals) {
      const order = prerequisiteOrder(goalConcepts(goal, graph), graph);
      const pos = new Map(order.map((id, i) => [id, i]));
      for (const id of order) for (const p of graph.concepts.find((c) => c.id === id)!.prereqs) if (pos.has(p)) expect(pos.get(p)!, `${p} before ${id}`).toBeLessThan(pos.get(id)!);
      for (const target of goal.concepts) expect(pos.has(target), `${goal.id}: ${target}`).toBe(true);
    }
  });

  it('packs in order, within the weekly hours less the review share, never splitting an item', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 5, max: 400 }), { maxLength: 40 }), fc.integer({ min: 1, max: 40 }), (mins, hours) => {
        const items = mins.map((minutes, i) => ({ concept: `c${i}`, minutes }));
        const weeks = pack(items, hours, new Date(T0), 3);
        expect(weeks.flatMap((w) => w.items)).toEqual(items);
        weeks.forEach((w, i) => {
          expect(w.index).toBe(3 + i);
          expect(new Date(w.end).getTime() - new Date(w.start).getTime()).toBe(WEEK_MS);
          if (w.items.length > 1) expect(w.minutes).toBeLessThanOrEqual(hours * 60 * (1 - REVIEW_SHARE));
        });
      }),
    );
  });
});

describe('the plan as it stands', () => {
  it('schedules the goal and what it builds on, and drops what becomes known', () => {
    // 2 hours a week leaves 102 minutes: one hour-long concept per week.
    const events = [setPlan(2, at(0))];
    const v = planView(events, tiny, [tinyGoal], hour, new Date(at(1)))!;
    // The goal lists c first, so c's chain (a, b, c) comes before d.
    expect(v.concepts).toEqual(['a', 'b', 'c', 'd']);
    expect(v.weeks.map((w) => w.items.map((i) => i.concept))).toEqual([['a'], ['b'], ['c'], ['d']]);
    expect(v).toMatchObject({ week: 0, due: 0, behind: 0, done: [] });

    const later = planView([...events, mark('a', at(2)), mark('b', at(2))], tiny, [tinyGoal], hour, new Date(at(3)))!;
    expect(later.done).toEqual(['a', 'b']);
    expect(later.weeks.map((w) => w.items.map((i) => i.concept))).toEqual([['c'], ['d']]);
  });

  it('re-plans from the current week, and counts what the original schedule had due', () => {
    const events = [setPlan(2, at(0))];
    // Fifteen days in: weeks 0 and 1 (a, b) have ended, nothing is known.
    const behind = planView(events, tiny, [tinyGoal], hour, new Date(at(15)))!;
    expect(behind).toMatchObject({ week: 2, due: 2, behind: 2 });
    expect(behind.weeks[0]).toMatchObject({ index: 2, items: [{ concept: 'a' }] });
    const caught = planView([...events, mark('b', at(14))], tiny, [tinyGoal], hour, new Date(at(15)))!;
    // Marking b known makes a assumed too: both due concepts are done.
    expect(caught).toMatchObject({ due: 2, behind: 0 });
  });

  it('what was known when the plan was set is never due', () => {
    const events = [mark('a', at(0)), setPlan(2, at(0.5))];
    const v = planView(events, tiny, [tinyGoal], hour, new Date(at(8)))!;
    expect(v).toMatchObject({ due: 1, behind: 1 }); // b was due in week 0
  });

  it('says how many hours a week a target date needs', () => {
    const events = [setPlan(2, at(0), new Date(T0 + 14 * DAY).toISOString().slice(0, 10))];
    const v = planView(events, tiny, [tinyGoal], hour, new Date(at(0.1)))!;
    // Four hour-long concepts in the two windows before the target: two a week, which takes 3 hours (less the review share).
    expect(v).toMatchObject({ hoursNeeded: 3, targetOutOfReach: false });
    expect(planView([setPlan(10, at(0), '2027-12-31')], tiny, [tinyGoal], hour, new Date(at(0.1)))!.hoursNeeded).toBeNull();
    // A target before the first window ends can't be met.
    expect(planView([setPlan(2, at(0), new Date(T0 + 2 * DAY).toISOString().slice(0, 10))], tiny, [tinyGoal], hour, new Date(at(0.1)))).toMatchObject({
      hoursNeeded: null,
      targetOutOfReach: true,
    });
  });

  it('marking a concept known places it out and assumes what it builds on', () => {
    const m = mastery([mark('c', at(0))], tiny);
    expect(m.get('c')!.status).toBe('placed');
    expect(m.get('a')!.status).toBe('assumed');
    expect(mastery([mark('c', at(0)), ev('concept.marked', { concept: 'c', known: false }, at(1))], tiny).get('c')!.status).toBe('new');
  });

  it('is null without a plan or with a goal that no longer exists', () => {
    expect(planView([], tiny, [tinyGoal], hour, new Date(at(0)))).toBeNull();
    expect(planView([ev('plan.set', { goal: 'gone', hours: 5 }, at(0))], tiny, [tinyGoal], hour, new Date(at(0)))).toBeNull();
  });
});

describe('the real goals', () => {
  const graph = masteryGraph();
  const catalog = planCatalog();
  const ids = new Map(graph.concepts.map((c) => [c.id, c]));

  it('aim at concepts that exist and are not planned, with distinct ids', () => {
    expect(new Set(goals.map((g) => g.id)).size).toBe(goals.length);
    for (const g of goals) for (const c of g.concepts) expect(ids.get(c)?.planned, `${g.id}: ${c}`).toBe(false);
  });

  it('give every concept an estimate and somewhere to learn it', () => {
    for (const c of graph.concepts.filter((x) => !x.planned)) {
      const entry = catalog[c.id];
      expect(entry.minutes, c.id).toBeGreaterThan(0);
      for (const p of entry.problems) expect(graph.problems[p.slug]).toContain(c.id);
    }
  });

  it('a fresh learner gets a full schedule for every goal', () => {
    const minutes = Object.fromEntries(Object.entries(catalog).map(([id, c]) => [id, c.minutes]));
    for (const g of goals) {
      const v = planView([ev('plan.set', { goal: g.id, hours: 5 }, at(0))], graph, goals, minutes, new Date(at(0.1)))!;
      expect(v.weeks.flatMap((w) => w.items).length, g.id).toBe(v.concepts.length);
      expect(v.weeks.length, `${g.id}: ${v.concepts.length} concepts`).toBeGreaterThan(1);
    }
  });
});
