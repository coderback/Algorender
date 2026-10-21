import { libraryTiles } from '@/components/explore/catalog';
import { caseStudies } from '@/content/designs';
import { goals } from '@/content/goals';
import { lessons } from '@/content/lessons';
import { masteryGraph, planCatalog } from '@/content/mastery';
import { COLOURS, trackColour, type TrackColour } from '@/data/tracks';
import { SERVER_LANGUAGES } from '@/problems/languages';
import { loadProblems } from '@/problems/load';
import { goalConcepts, prerequisiteOrder } from '@/progress/plan';
import { LANGUAGES } from '@/workspace/protocol';
import { bubbleDemo, type Demo } from './demo';

// Everything the landing page says about the site is counted from content
// here, at build time, so the numbers never go stale.

export type LandingTopic = { key: string; colour: TrackColour; title: string; line: string; href: string };

export type LandingData = {
  stats: { visualisers: number; lessons: number; problems: number; browser: string[]; server: string[] };
  topics: LandingTopic[];
  /** Goal titles, for the plan section's checklist. */
  goals: string[];
  /** A new learner's first three plan items toward the first goal. */
  week: { goal: string; items: { title: string; minutes: number }[] };
  demo: Demo;
};

const TOPIC_TITLE: Record<TrackColour, string> = {
  lilac: 'Data structures',
  peach: 'Sorting & searching',
  mint: 'Trees & hashing',
  sky: 'Graphs & strings',
  butter: 'Patterns & design',
  rose: 'Math & machine learning',
  teal: 'Systems',
};

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

export function landingData(): LandingData {
  const graph = masteryGraph();
  const tiles = libraryTiles();
  const live = graph.concepts.filter((c) => !c.planned);
  const topics: LandingTopic[] = COLOURS.map((colour) => ({
    key: colour,
    colour,
    title: TOPIC_TITLE[colour],
    line: `${plural(tiles.filter((t) => t.colour === colour).length, 'visualiser')} · ${plural(live.filter((c) => trackColour(c.track) === colour).length, 'concept')}`,
    href: `/explore?track=${colour}`,
  }));
  topics.push({ key: 'design', colour: 'lilac', title: 'System design lab', line: `${caseStudies.length} case ${caseStudies.length === 1 ? 'study' : 'studies'} on a live traffic simulator`, href: '/design' });

  const goal = goals[0];
  const catalog = planCatalog();
  const title = new Map(graph.concepts.map((c) => [c.id, c.title]));
  const first = prerequisiteOrder(goalConcepts(goal, graph), graph, goal.concepts).slice(0, 3);

  return {
    stats: {
      visualisers: tiles.length,
      lessons: lessons.length,
      problems: loadProblems().length,
      browser: Object.values(LANGUAGES).map((l) => l.label),
      server: Object.values(SERVER_LANGUAGES).map((l) => l.label),
    },
    topics,
    goals: goals.map((g) => g.title),
    week: { goal: goal.title, items: first.map((id) => ({ title: title.get(id) ?? id, minutes: catalog[id]?.minutes ?? 20 })) },
    demo: bubbleDemo(),
  };
}
