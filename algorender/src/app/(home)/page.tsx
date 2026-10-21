import type { Metadata } from 'next';
import { HomeGate } from '@/components/home/HomeGate';
import { landingData } from '@/components/landing/data';
import { Landing } from '@/components/landing/Landing';
import { AppShell } from '@/components/shell/AppShell';
import { Today, type TodayData } from '@/components/today/Today';
import { loadConcepts } from '@/content/concepts';
import { goals } from '@/content/goals';
import { getLesson } from '@/content/lessons';
import { lessonMisconceptions } from '@/content/lessons/assessment';
import { lessonSections } from '@/content/lessons/sections';
import { masteryGraph, planCatalog } from '@/content/mastery';
import { loadProblems } from '@/problems/load';
import { PATTERNS } from '@/problems/patterns';
import { misconceptionCard } from '@/progress/misconceptions';

// The landing page is what a crawler sees, so it sets the title; returning learners get Today at the same URL.
export const metadata: Metadata = {
  title: 'Algorender: watch algorithms think',
  description:
    'Step through sorting, graphs, trees, dynamic programming and machine learning, forwards and backwards, with the code and the reason for every move. Then predict the next step yourself.',
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
              // The lesson's sections, for the step pills on Today's Continue card.
              ...(entry?.lesson && { lesson: { ...entry.lesson, sections: lessonSections(entry.lesson.slug).map(({ id, step }) => ({ id, step })) } }),
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

// / is outside the route groups: Today brings the app shell, the landing page has its own header.
// The root layout's HOME_SCRIPT has put the D1 hint on <html> before either view paints.
export default function HomePage() {
  return (
    <HomeGate
      landing={<Landing data={landingData()} />}
      today={
        <AppShell>
          <Today data={todayData()} />
        </AppShell>
      }
    />
  );
}
