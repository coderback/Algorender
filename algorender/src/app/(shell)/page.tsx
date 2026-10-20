import type { Metadata } from 'next';
import { Today, type TodayData } from '@/components/today/Today';
import { loadConcepts } from '@/content/concepts';
import { goals } from '@/content/goals';
import { getLesson } from '@/content/lessons';
import { lessonMisconceptions } from '@/content/lessons/assessment';
import { masteryGraph, planCatalog } from '@/content/mastery';
import { loadProblems } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import { misconceptionCard } from '@/progress/misconceptions';

export const metadata: Metadata = {
  title: 'Today | Algorender',
  description: 'Where you left off, what is due for review, this week’s plan and what you are ready to learn next.',
};

/** What Today needs from content, compact: everything about the learner comes from their events. */
function todayData(): TodayData {
  const { tracks, concepts } = loadConcepts();
  const catalog = planCatalog();
  const pattern = new Map(loadProblems().map((p) => [p.slug, PATTERNS[p.patterns[0]].title]));
  return {
    graph: masteryGraph(),
    goals,
    tracks: tracks.filter((t) => !t.planned).map((t) => ({ id: t.id, title: t.title })),
    concepts: Object.fromEntries(
      concepts
        .filter((c) => !c.planned)
        .map((c) => {
          const entry = catalog[c.id];
          return [
            c.id,
            {
              summary: c.summary,
              minutes: entry?.minutes ?? 20,
              ...(entry?.lesson && { lesson: entry.lesson }),
              visualisers: entry?.visualisers.length ?? 0,
              links: c.links,
              problems: (entry?.problems ?? []).map((p) => ({ ...p, pattern: pattern.get(p.slug) ?? '' })),
            },
          ];
        }),
    ),
    mistakes: Object.fromEntries(
      lessonMisconceptions().map((m) => [misconceptionCard(m.lesson, m.id), { title: m.title, lesson: m.lesson, lessonTitle: getLesson(m.lesson)?.title ?? m.lesson }]),
    ),
  };
}

// TODO(redesign): Phase 8 shows the landing page here to first-time visitors (decision D1).
export default function TodayPage() {
  return <Today data={todayData()} />;
}
