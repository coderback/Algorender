import type { Metadata } from 'next';
import { PracticeHeader } from '@/components/practice/PracticeHeader';
import { loadConcepts } from '@/content/concepts';
import { trackColour, type TrackColour } from '@/data/tracks';
import { loadProblems } from '@/problems/load';
import { PATTERNS, type PatternId } from '@/problems/patterns';
import { Rng } from '@/problems/random';
import { ProblemList, SolvedTiles, type ProblemRow } from '@/problems/ui/ProblemList';

export const metadata: Metadata = {
  title: 'Practice problems | Algorender',
  description:
    'Interview-style coding problems grouped by pattern. Solve them in Python, JavaScript or TypeScript in your browser, and watch your own code run on any test it fails.',
};

/** Each pattern takes the colour of the concept that teaches it; patterns with none are butter, the patterns track. */
function patternColours(): Record<string, TrackColour> {
  const track = new Map(loadConcepts().concepts.map((c) => [c.id, c.track]));
  return Object.fromEntries(
    (Object.keys(PATTERNS) as PatternId[]).map((id) => {
      const concept = PATTERNS[id].concept;
      return [id, trackColour(concept ? (track.get(concept) ?? 'patterns') : 'patterns')];
    }),
  );
}

export default function PracticeIndex() {
  const problems = loadProblems();
  const rows: ProblemRow[] = problems.map((p) => ({ slug: p.slug, title: p.title, difficulty: p.difficulty, summary: p.summary, pattern: p.patterns[0] }));
  // The mixed order is fixed, so the page renders the same on the server and in the browser.
  const mixed = new Rng(2026).shuffle(rows.map((r) => r.slug));
  return (
    <main className="flex flex-col gap-[22px] px-4 pb-6 md:px-0 md:pt-2">
      <PracticeHeader active="problems" aside={<SolvedTiles rows={rows} />} />
      <ProblemList rows={rows} mixed={mixed} colours={patternColours()} />
    </main>
  );
}
