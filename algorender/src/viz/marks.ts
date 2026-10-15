// The app-wide visual vocabulary. Every view (bars, cells, nodes, edges)
// colours an element by one of these marks, so "blue" always means "being
// compared" and "green" always means "done". Each mark also has a glyph, so
// colour is never the only cue. Colours are Okabe–Ito tokens in globals.css.

export type MarkKey =
  | 'compare'
  | 'swap'
  | 'write'
  | 'pivot'
  | 'min'
  | 'key'
  | 'frontier'
  | 'sorted'
  | 'visited'
  | 'found'
  | 'path'
  | 'reject';

export type MarkStyle = {
  label: string;
  glyph: string;
  /** Background for HTML elements. */
  bg: string;
  /** Fill and stroke for SVG shapes. */
  fill: string;
  stroke: string;
  /** Readable text colour for the glyph on a white background. */
  text: string;
};

export const MARKS: Record<MarkKey, MarkStyle> = {
  compare: { label: 'Comparing', glyph: '◆', bg: 'bg-mark-compare', fill: 'fill-mark-compare', stroke: 'stroke-mark-compare', text: 'text-mark-compare' },
  swap: { label: 'Swapping', glyph: '⇄', bg: 'bg-mark-swap', fill: 'fill-mark-swap', stroke: 'stroke-mark-swap', text: 'text-mark-swap' },
  write: { label: 'Written', glyph: '↓', bg: 'bg-mark-write', fill: 'fill-mark-write', stroke: 'stroke-mark-write', text: 'text-mark-write' },
  pivot: { label: 'Pivot', glyph: 'P', bg: 'bg-mark-focus', fill: 'fill-mark-focus', stroke: 'stroke-mark-focus', text: 'text-amber-700' },
  min: { label: 'Smallest so far', glyph: 'min', bg: 'bg-mark-focus', fill: 'fill-mark-focus', stroke: 'stroke-mark-focus', text: 'text-amber-700' },
  key: { label: 'Current', glyph: '●', bg: 'bg-mark-focus', fill: 'fill-mark-focus', stroke: 'stroke-mark-focus', text: 'text-amber-700' },
  frontier: { label: 'Waiting (frontier)', glyph: '○', bg: 'bg-mark-frontier', fill: 'fill-mark-frontier', stroke: 'stroke-mark-frontier', text: 'text-sky-700' },
  sorted: { label: 'In final place', glyph: '✓', bg: 'bg-mark-done', fill: 'fill-mark-done', stroke: 'stroke-mark-done', text: 'text-emerald-700' },
  visited: { label: 'Visited', glyph: '✓', bg: 'bg-mark-done', fill: 'fill-mark-done', stroke: 'stroke-mark-done', text: 'text-emerald-700' },
  found: { label: 'Found', glyph: '★', bg: 'bg-mark-done', fill: 'fill-mark-done', stroke: 'stroke-mark-done', text: 'text-emerald-700' },
  path: { label: 'On the result', glyph: '★', bg: 'bg-mark-done', fill: 'fill-mark-done', stroke: 'stroke-mark-done', text: 'text-emerald-700' },
  reject: { label: 'Rejected', glyph: '✕', bg: 'bg-mark-swap', fill: 'fill-mark-swap', stroke: 'stroke-mark-swap', text: 'text-mark-swap' },
};

/** Unmarked elements. */
export const NEUTRAL = { bg: 'bg-bar', fill: 'fill-bar', stroke: 'stroke-bar' } as const;
