import { visualisers } from '@/data/visualisers';
import { PATTERNS } from '@/problems/patterns';
import { loadProblems } from '@/problems/load';
import { loadConcepts } from './concepts';
import { lessons } from './lessons';

// What the command palette searches: concepts, visualisers, lessons and
// problems, compact enough to ship with the app shell. Server-only (the
// concept graph and problems are read from disk at build time).

export type PaletteKind = 'concept' | 'visualiser' | 'lesson' | 'problem';

export interface PaletteEntry {
  kind: PaletteKind;
  /** Unique across kinds. */
  id: string;
  title: string;
  /** One muted line under the title. */
  subtitle: string;
  /** Longer text for the preview card. */
  description: string;
  href: string;
  /** A concept-map track id: the colour of the row's tile and preview. */
  track: string;
  /** The track's name, for the preview's eyebrow. */
  trackTitle: string;
  /** Extra words to match: category, patterns, complexity. */
  keywords: string;
  /** For concepts: the id in the mastery graph, so the palette can show a status. */
  concept?: string;
  /** A second action for the preview card. */
  secondary?: { label: string; href: string };
}

const TYPE_TRACK: Record<string, string> = { systems: 'systems', math: 'math' };

export function paletteEntries(): PaletteEntry[] {
  const { tracks, concepts } = loadConcepts();
  const trackTitle = new Map(tracks.map((t) => [t.id, t.title]));
  const live = concepts.filter((c) => !c.planned);
  const problems = loadProblems();
  const vis = visualisers.filter((v: { hidden?: boolean }) => !v.hidden) as {
    slug: string;
    name: string;
    path: string;
    description: string;
    category: string;
    type: string;
    timeComplexity?: { average: string };
  }[];
  const visBySlug = new Map(vis.map((v) => [v.slug, v]));
  const trackOfVisualiser = (slug: string, type: string) => live.find((c) => c.visualisers.includes(slug))?.track ?? TYPE_TRACK[type] ?? 'foundations';
  const conceptOf = new Map(live.map((c) => [c.id, c]));
  const problemsOf = (concept: string) => problems.filter((p) => p.patterns.some((id) => PATTERNS[id].concept === concept));

  const out: PaletteEntry[] = [];
  const push = (e: Omit<PaletteEntry, 'trackTitle'>) => out.push({ ...e, trackTitle: trackTitle.get(e.track) ?? '' });

  for (const c of live) {
    const lesson = c.lesson ? lessons.find((l) => l.slug === c.lesson) : undefined;
    const shown = c.visualisers.map((s) => visBySlug.get(s)).filter((v) => !!v);
    const n = problemsOf(c.id).length;
    const parts = [lesson && 'Lesson', shown.length > 0 && `${shown.length} visualiser${shown.length === 1 ? '' : 's'}`, n > 0 && `${n} problem${n === 1 ? '' : 's'}`].filter(Boolean);
    const first = shown[0];
    const href = lesson ? `/learn/${lesson.slug}` : first ? first.path : '/learn';
    push({
      kind: 'concept',
      id: `concept:${c.id}`,
      title: c.title,
      subtitle: [trackTitle.get(c.track), parts.join(' + ')].filter(Boolean).join(' · '),
      description: c.summary,
      href,
      track: c.track,
      keywords: '',
      concept: c.id,
      ...(lesson && first && { secondary: { label: `Open ${first.name}`, href: first.path } }),
    });
  }

  for (const v of vis) {
    const big = v.timeComplexity?.average;
    push({
      kind: 'visualiser',
      id: `visualiser:${v.slug}`,
      title: v.name,
      subtitle: [v.category, big].filter(Boolean).join(' · '),
      description: v.description,
      href: v.path,
      track: trackOfVisualiser(v.slug, v.type),
      keywords: `${v.category} ${big ?? ''}`,
    });
  }

  for (const l of lessons) {
    const c = conceptOf.get(l.concept);
    push({
      kind: 'lesson',
      id: `lesson:${l.slug}`,
      title: l.title,
      subtitle: [c && trackTitle.get(c.track), `${l.minutes} min`].filter(Boolean).join(' · '),
      description: l.summary,
      href: `/learn/${l.slug}`,
      track: c?.track ?? 'foundations',
      keywords: c?.title ?? '',
    });
  }

  for (const p of problems) {
    const patterns = p.patterns.map((id) => PATTERNS[id]);
    const concept = patterns.map((pt) => pt.concept && conceptOf.get(pt.concept)).find((c) => !!c);
    const level = p.difficulty[0].toUpperCase() + p.difficulty.slice(1);
    push({
      kind: 'problem',
      id: `problem:${p.slug}`,
      title: p.title,
      subtitle: [level, ...patterns.map((pt) => pt.title)].join(' · '),
      description: p.summary,
      href: `/practice/${p.slug}`,
      track: concept?.track ?? 'patterns',
      keywords: patterns.map((pt) => pt.title).join(' '),
    });
  }

  return out;
}
