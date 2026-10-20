import type { Metadata } from 'next';
import { Library } from '@/components/explore/Library';
import { glyphFor, KIND_OF_TYPE, parseKind, type Tile } from '@/components/explore/tiles';
import { masteryGraph } from '@/content/mastery';
import { visualisers } from '@/data/visualisers';
import { COLOURS, trackColour, type TrackColour } from '@/data/tracks';
import { getModule } from '@/registry';

export const metadata: Metadata = {
  title: 'Explore every visualiser | Algorender',
  description: 'Data structures, algorithms, math, machine learning and systems you can step through forwards and backwards, with synced code and a reason for every move.',
};

/** Every listed visualiser as a tile: its track comes from the first concept that teaches it. */
function tiles(): Tile[] {
  const graph = masteryGraph();
  const teacher = (slug: string) => graph.concepts.find((c) => !c.planned && c.visualisers.includes(slug));
  return visualisers
    .filter((v) => !v.hidden)
    .map((v) => {
      const concept = teacher(v.slug);
      return {
        slug: v.slug,
        name: v.name,
        category: v.category,
        blurb: v.description,
        cost: 'timeComplexity' in v ? v.timeComplexity.average : null,
        kind: KIND_OF_TYPE[v.type],
        colour: trackColour(concept?.track ?? (v.type === 'systems' || v.type === 'math' ? v.type : '')),
        concept: concept?.id ?? null,
        glyph: glyphFor(getModule(v.slug)?.view ?? '', v.category),
      };
    });
}

type Props = { searchParams: Promise<{ kind?: string; track?: string }> };

export default async function ExplorePage({ searchParams }: Props) {
  const { kind, track } = await searchParams;
  const colour = COLOURS.includes(track as TrackColour) ? (track as TrackColour) : 'all';
  return <Library tiles={tiles()} graph={masteryGraph()} initial={{ kind: parseKind(kind ?? null), colour }} />;
}
