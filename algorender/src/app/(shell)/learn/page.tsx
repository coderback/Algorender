import type { Metadata } from 'next';
import { LearnHeader } from '@/components/learn/LearnHeader';
import { LessonList, type LessonGroup } from '@/components/learn/LessonList';
import { LearnPath, PathLegend, type PathData } from '@/components/learn/Path';
import { depths, loadConcepts, unlockedBy } from '@/content/concepts';
import { goals } from '@/content/goals';
import { getLesson, lessons } from '@/content/lessons';
import { lessonMisconceptions } from '@/content/lessons/assessment';
import { masteryGraph, planCatalog } from '@/content/mastery';
import { PATTERN_IDS, PATTERNS } from '@/problems/patterns';
import { misconceptionCard } from '@/progress/misconceptions';

export const metadata: Metadata = {
  title: 'Learn: the concept map | Algorender',
  description: 'Every concept in the order it builds on the others, from Big-O to graphs and dynamic programming, with lessons and interactive visualisers.',
};

function pathData(): PathData {
  const { tracks, concepts } = loadConcepts();
  const depth = depths();
  const catalog = planCatalog();
  const patternOf = (concept: string) => PATTERN_IDS.find((id) => PATTERNS[id].concept === concept);
  const ordered = [...tracks].sort((a, b) => Number(a.planned) - Number(b.planned));
  return {
    graph: masteryGraph(),
    goals,
    tracks: ordered.map((t) => ({
      id: t.id,
      title: t.title,
      planned: t.planned,
      concepts: concepts
        .filter((c) => c.track === t.id)
        .sort((a, b) => depth.get(a.id)! - depth.get(b.id)! || a.title.localeCompare(b.title))
        .map((c) => c.id),
    })),
    concepts: Object.fromEntries(
      concepts.map((c) => {
        const entry = catalog[c.id];
        const pattern = patternOf(c.id);
        return [
          c.id,
          {
            id: c.id,
            title: c.title,
            summary: c.summary,
            track: c.track,
            planned: c.planned,
            prereqs: c.prereqs,
            unlocks: unlockedBy(c.id).map((u) => u.id),
            ...(entry?.lesson && { lesson: entry.lesson }),
            visualisers: entry?.visualisers ?? [],
            links: c.links,
            problems: entry?.problems.length ?? 0,
            ...(pattern && { pattern: `pattern-${pattern}` }),
          },
        ];
      }),
    ),
    mistakes: Object.fromEntries(lessonMisconceptions().map((m) => [misconceptionCard(m.lesson, m.id), { title: m.title, lessonTitle: getLesson(m.lesson)?.title ?? m.lesson }])),
  };
}

function lessonGroups(): LessonGroup[] {
  const { tracks, concepts } = loadConcepts();
  const trackOf = new Map(concepts.map((c) => [c.id, c.track]));
  return tracks
    .map((t) => ({
      track: t.id,
      title: t.title,
      lessons: lessons.filter((l) => trackOf.get(l.concept) === t.id).map((l) => ({ slug: l.slug, title: l.title, summary: l.summary, minutes: l.minutes, concept: l.concept })),
    }))
    .filter((g) => g.lessons.length > 0);
}

export default async function LearnPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const lessonsTab = (await searchParams).tab === 'lessons';
  return (
    <main className="flex flex-col gap-6 px-4 pb-6 md:px-0 md:pt-2">
      <LearnHeader active={lessonsTab ? 'lessons' : 'path'} aside={lessonsTab ? undefined : <PathLegend />} />
      {lessonsTab ? <LessonList groups={lessonGroups()} /> : <LearnPath data={pathData()} />}
    </main>
  );
}
