import { masteryGraph } from '@/content/mastery';
import { paletteEntries } from '@/content/palette';

// The command palette's index, prerendered at build time as a static file.
// The palette fetches it the first time it opens, so pages don't carry it.
export const dynamic = 'force-static';

export function GET() {
  return Response.json({ entries: paletteEntries(), graph: masteryGraph() });
}
