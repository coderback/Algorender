import { masteryGraph } from '@/content/mastery';
import { visualisers } from '@/data/visualisers';
import { trackColour } from '@/data/tracks';
import { getModule } from '@/registry';
import { glyphFor, KIND_OF_TYPE, type Tile } from './tiles';

/** Every listed visualiser as a tile: its track comes from the first concept that teaches it. Server only (it loads the registry). */
export function libraryTiles(): Tile[] {
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
