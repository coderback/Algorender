import { MARKS, type MarkKey } from '@/viz/marks';
import { cellKey, type ListPart, type MeterPart, type TablePart } from './types';

// Plain-text descriptions of grid parts for screen readers (rendered sr-only
// next to the visual, which is aria-hidden).

/** A weight or value with at most two decimals: 20, 6.67. */
export const formatAmount = (n: number) => String(Number(n.toFixed(2)));

export function describeTable(t: TablePart): string {
  const index = new Map(t.rows.map((r, i) => [r.id, i]));
  const rowName = (id: string) => {
    const i = index.get(id) ?? 0;
    const r = t.rows[i];
    return r?.label ? `row ${r.label}${r.sub ? ` (${r.sub})` : ''}` : `row ${i + 1}`;
  };
  const colName = (c: number) => {
    const h = t.cols[c];
    return h?.label ? `column ${h.label}${h.sub ? ` (${h.sub})` : ''}` : `column ${c + 1}`;
  };

  const sentences: string[] = [];
  if (t.rows.length === 0) {
    sentences.push(t.empty ?? 'No rows yet');
  } else if (t.look === 'timeline') {
    for (const row of t.rows) {
      const bars = t.bars.filter((b) => b.row === row.id);
      const spans = bars.map((b) => `${b.from} to ${b.to}${b.mark ? `, ${MARKS[b.mark].label.toLowerCase()}` : ''}`);
      sentences.push(`${rowName(row.id)}: ${spans.join('; ') || 'empty'}`);
    }
  } else {
    const text = (row: string, c: number, x: string) => (t.styles[cellKey(row, c)] === 'block' ? 'wall' : x || 'blank');
    for (const row of t.rows) sentences.push(`${rowName(row.id)}: ${t.cells[row.id].map((x, c) => text(row.id, c, x)).join(', ')}`);
  }
  if (t.pieces.length > 0) {
    sentences.push(
      `Pieces: ${t.pieces
        .map((p) => `${p.label} at ${rowName(p.at.row)}, ${colName(p.at.col)}${p.mark ? ` (${MARKS[p.mark].label.toLowerCase()})` : ''}`)
        .join('; ')}`,
    );
  }

  const byMark = new Map<MarkKey, string[]>();
  const add = (mark: MarkKey, what: string) => byMark.set(mark, [...(byMark.get(mark) ?? []), what]);
  for (const [key, mark] of Object.entries(t.marks)) {
    const split = key.lastIndexOf(':');
    add(mark, `${rowName(key.slice(0, split))}, ${colName(Number(key.slice(split + 1)))}`);
  }
  for (const [row, mark] of Object.entries(t.rowMarks)) add(mark, rowName(row));
  for (const [col, mark] of Object.entries(t.colMarks)) add(mark, colName(Number(col)));
  for (const [mark, what] of byMark) sentences.push(`${MARKS[mark].label}: ${what.join('; ')}`);
  for (const g of t.guides) sentences.push(g.label);

  return `${t.label}. ${sentences.join('. ')}.`;
}

export function describeList(l: ListPart): string {
  if (l.items.length === 0) return `${l.label}: ${l.empty}`;
  return `${l.label}: ${l.items.map((it) => `${it.text}${it.mark ? ` (${MARKS[it.mark].label.toLowerCase()})` : ''}`).join(', ')}`;
}

export function describeMeter(m: MeterPart): string {
  const used = m.segments.reduce((s, x) => s + x.amount, 0);
  const parts = m.segments.map((s) => `${s.label}: ${formatAmount(s.amount)} ${m.unit}`);
  return `${m.label}: ${formatAmount(used)} of ${formatAmount(m.total)} ${m.unit} used${parts.length ? ` (${parts.join(', ')})` : ''}.`;
}
