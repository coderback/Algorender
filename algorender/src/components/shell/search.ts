import type { PaletteEntry, PaletteKind } from '@/content/palette';

// Ranking for the command palette: every word of the query must appear
// somewhere in an entry; titles count most, then subtitles and keywords, then
// the description.

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function score(entry: PaletteEntry, query: string): number {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const title = fold(entry.title);
  const meta = fold(`${entry.subtitle} ${entry.keywords}`);
  const body = fold(entry.description);
  let total = 0;
  for (const w of words) {
    if (title.startsWith(w)) total += 8;
    else if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(title)) total += 6;
    else if (title.includes(w)) total += 4;
    else if (meta.includes(w)) total += 2;
    else if (body.includes(w)) total += 1;
    else return 0;
  }
  return total;
}

/** Matching entries of one kind, best first. */
export function search(entries: readonly PaletteEntry[], kind: PaletteKind, query: string, limit: number): PaletteEntry[] {
  return entries
    .filter((e) => e.kind === kind)
    .map((e) => ({ e, s: score(e, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title))
    .slice(0, limit)
    .map((r) => r.e);
}
