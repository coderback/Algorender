// Series colours for the compare page: categorical slots 1–4 of the validated
// reference palette (dataviz skill; checked against the white card surface:
// adjacent CVD ΔE ≥ 9.1, normal-vision ΔE ≥ 22.9). Aqua and yellow sit below
// 3:1 contrast, so every chart that uses them also has direct labels and a
// table view. Never more than four series at once.
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const;
export const MAX_SERIES = SERIES_COLORS.length;

/**
 * Colour follows the algorithm, not its rank: a newly selected algorithm takes
 * the first free slot, and removing one never repaints the others.
 */
export function assignSlots(selected: readonly string[], previous: ReadonlyMap<string, number>): Map<string, number> {
  const slots = new Map<string, number>();
  for (const slug of selected) if (previous.has(slug)) slots.set(slug, previous.get(slug)!);
  for (const slug of selected) {
    if (slots.has(slug)) continue;
    const used = new Set(slots.values());
    const free = SERIES_COLORS.findIndex((_, i) => !used.has(i));
    slots.set(slug, free);
  }
  return slots;
}

/** Total work in a frame's stats: comparisons + swaps + writes. */
export function workOf(stats: Record<string, number>): number {
  return Object.values(stats).reduce((a, b) => a + b, 0);
}
