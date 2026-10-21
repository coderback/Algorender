import type { Metadata } from 'next';
import { libraryTiles } from '@/components/explore/catalog';
import { Library } from '@/components/explore/Library';
import { parseKind } from '@/components/explore/tiles';
import { masteryGraph } from '@/content/mastery';
import { COLOURS, type TrackColour } from '@/data/tracks';

export const metadata: Metadata = {
  title: 'Explore every visualiser | Algorender',
  description: 'Data structures, algorithms, math, machine learning and systems you can step through forwards and backwards, with synced code and a reason for every move.',
};

type Props = { searchParams: Promise<{ kind?: string; track?: string }> };

export default async function ExplorePage({ searchParams }: Props) {
  const { kind, track } = await searchParams;
  const colour = COLOURS.includes(track as TrackColour) ? (track as TrackColour) : 'all';
  return <Library tiles={libraryTiles()} graph={masteryGraph()} initial={{ kind: parseKind(kind ?? null), colour }} />;
}
