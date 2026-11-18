import type { Metadata } from 'next';
import { AreaFilter } from '@/components/learn/AreaFilter';
import { LearnHeader } from '@/components/learn/LearnHeader';
import { LessonList, type LessonGroup } from '@/components/learn/LessonList';
import { LearnPath, PathLegend, type PathData } from '@/components/learn/Path';
import { depths, loadConcepts, unlockedBy } from '@/content/concepts';
import { goals } from '@/content/goals';
import { getLesson, lessons } from '@/content/lessons';
import { lessonMisconceptions } from '@/content/lessons/assessment';
import { masteryGraph, planCatalog } from '@/content/mastery';
import { units } from '@/content/units';
import { PATTERN_IDS, PATTERNS } from '@/problems/patterns';
import { AREAS, type AreaId } from '@/progress/mastery';
import { misconceptionCard } from '@/progress/misconceptions';

export const metadata: Metadata = {
  title: 'Learn: the concept map | Algorender',
  description: 'Every concept in the order it builds on the others, from Big-O to graphs and dynamic programming, with lessons and interactive visualisers.',
};

/** The areas with something to learn yet: what the filter offers. */
function liveAreas(): AreaId[] {
  const { tracks, concepts } = loadConcepts();
  const live = new Set(tracks.filter((t) => concepts.some((c) => c.track === t.id && !c.planned)).map((t) => t.area));
  return AREAS.map((a) => a.id).filter((a) => live.has(a));
}

function pathData(area: AreaId | null): PathData {
  const { tracks: all, concepts } = loadConcepts();
  const tracks = area ? all.filter((t) => t.area === area) : all;
  const depth = depths();
  const unitOrder = new Map(units.flatMap((u) => u.concepts).map((id, i) => [id, i]));
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
        // A language track reads in the order of its units; the others by depth in the graph.
        .sort((a, b) => (unitOrder.has(a.id) && unitOrder.has(b.id) ? unitOrder.get(a.id)! - unitOrder.get(b.id)! : depth.get(a.id)! - depth.get(b.id)! || a.title.localeCompare(b.title)))
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

function lessonGroups(area: AreaId | null): LessonGroup[] {
  const { tracks: all, concepts } = loadConcepts();
  const tracks = area ? all.filter((t) => t.area === area) : all;
  const trackOf = new Map(concepts.map((c) => [c.id, c.track]));
  return tracks
    .map((t) => ({
      track: t.id,
      title: t.title,
      lessons: lessons.filter((l) => trackOf.get(l.concept) === t.id).map((l) => ({ slug: l.slug, title: l.title, summary: l.summary, minutes: l.minutes, concept: l.concept })),
    }))
    .filter((g) => g.lessons.length > 0);
}

export default async function LearnPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; concept?: string | string[]; area?: string | string[] }> }) {
  const { tab, concept, area: asked } = await searchParams;
  const lessonsTab = tab === 'lessons';
  const areas = liveAreas();
  const area = areas.find((a) => a === asked) ?? null;
  return (
    <main className="flex flex-col gap-6 px-4 pb-6 md:px-0 md:pt-2">
      <LearnHeader active={lessonsTab ? 'lessons' : 'path'} aside={lessonsTab ? undefined : <PathLegend />} />
      <AreaFilter areas={areas} active={area} tab={lessonsTab ? 'lessons' : 'path'} />
      {lessonsTab ? (
        <LessonList groups={lessonGroups(area)} />
      ) : (
        <LearnPath key={area ?? 'all'} data={pathData(area)} linked={typeof concept === 'string' ? concept : undefined} filtered={area !== null} />
      )}
    </main>
  );
}
