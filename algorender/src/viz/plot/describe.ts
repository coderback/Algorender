import { fmt, fmtVec } from './geometry';
import type { PlanePart, PlotPart, PlotState, Shape } from './types';

/**
 * A text version of the plot for screen readers: each plane's vectors, points,
 * paths and lines with their coordinates, then the matrices and readouts. The
 * narration says what changed; this says where everything is.
 */
export function describe(state: PlotState): string {
  return state.parts.map(describePart).filter(Boolean).join(' ');
}

function describePart(part: PlotPart): string {
  switch (part.kind) {
    case 'plane':
      return describePlane(part);
    case 'matrix': {
      const rows = part.cols[0]?.values.map((_, r) => `[${part.cols.map((c) => c.values[r]).join(', ')}]`) ?? [];
      return `${part.name} = [${rows.join(', ')}].`;
    }
    case 'readouts':
      return part.items.length ? `${part.label}: ${part.items.map((i) => `${i.label} ${i.value}`).join('; ')}.` : '';
    case 'network': {
      const nodes = part.nodes
        .filter((n) => n.kind !== 'op')
        .map((n) => `${n.label}${n.value !== undefined ? ` ${n.value}` : ''}${n.grad !== undefined ? `, ${n.grad}` : ''}`);
      return `${part.label}: ${nodes.join('; ')}.`;
    }
    case 'image': {
      const values = part.values && part.values.length <= 25 && part.values.some(Boolean) ? ` Values row by row: ${part.values.join(', ')}.` : '';
      return `${part.label}: a ${part.width} by ${part.height} grid.${values}`;
    }
    case 'tokens':
      return `${part.label}: ${part.tokens.length ? part.tokens.map((t) => `“${t.text}”${t.sub ? ` (${t.sub})` : ''}`).join(', ') : 'none'}.`;
    case 'bits':
      return `${part.label}: ${part.fields.map((f) => `${f.label} ${part.bits.slice(f.from, f.to).map((b) => b.value).join('')}${f.sub ? ` (${f.sub})` : ''}`).join('; ')}.`;
  }
}

function describePlane(p: PlanePart): string {
  const items = p.shapes.map(describeShape).filter(Boolean);
  const grid = p.warp ? ' The grid is drawn transformed.' : '';
  return `${p.label}${items.length ? `: ${items.join('; ')}` : ''}.${grid}`;
}

function describeShape(s: Shape): string {
  switch (s.kind) {
    case 'vector':
      return `${s.label ?? 'vector'} from ${fmtVec(s.from)} to ${fmtVec(s.to)}`;
    case 'point':
      return `${s.label ?? 'point'} at ${fmtVec(s.at)}`;
    case 'path': {
      if (!s.label || s.points.length === 0) return '';
      const last = s.points[s.points.length - 1];
      return s.closed ? `${s.label} with corners ${s.points.map((v) => fmtVec(v)).join(', ')}` : `${s.label}, ${s.points.length} points ending at ${fmtVec(last)}`;
    }
    case 'line':
      return s.label ? `${s.label} through ${fmtVec(s.through)} along ${fmtVec(s.dir)}` : '';
    case 'label':
      return s.text;
    case 'bars': {
      const labelled = s.bars.filter((b) => b.label);
      return labelled.length ? labelled.map((b) => `bar ${b.id}: ${b.label}`).join(', ') : `${s.bars.length} bars`;
    }
    case 'heatmap':
      return '';
    case 'contours':
      return s.levels.length ? `contour lines from ${fmt(s.levels[0].value)} to ${fmt(s.levels[s.levels.length - 1].value)}` : '';
  }
}
