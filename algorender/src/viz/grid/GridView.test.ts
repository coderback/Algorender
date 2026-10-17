import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { backtracking } from '@/algorithms/backtracking';
import { dynamicProgramming } from '@/algorithms/dp';
import { greedy } from '@/algorithms/greedy';
import { intervals } from '@/algorithms/intervals';
import { describeTable } from './describe';
import { arrowGeometry } from './geometry';
import { GridView } from './GridView';
import { stateProblems, traceOf } from './testing';
import { GridTracer } from './tracer';

const modules = [...dynamicProgramming, ...greedy, ...backtracking, ...intervals].filter((m) => m.view === 'grid');
const render = (t: GridTracer) => renderToStaticMarkup(createElement(GridView, { state: t.frame({ note: 'x' }).state }));

describe('GridView', () => {
  it.each(modules.map((m) => [m.slug, m] as const))('renders frames of every %s example', (_, algo) => {
    for (const example of algo.input.examples) {
      const { frames } = traceOf(algo, example.make({ seed: 1, size: algo.input.size?.default ?? 0 }));
      // First, last and a spread of frames in between.
      const picks = [...new Set([0, frames.length - 1, ...Array.from({ length: 6 }, (_, k) => Math.floor((k * frames.length) / 6))])];
      for (const i of picks) {
        const html = renderToStaticMarkup(createElement(GridView, { state: frames[i].state }));
        expect(html).toContain('sr-only');
        expect(html).not.toContain('NaN');
        expect(html).not.toContain('undefined');
      }
    }
  });

  it('draws arrows that start in the source cell and stop before the target centre', () => {
    const straight = arrowGeometry({ x: 0.5, y: 0.5 }, { x: 1.5, y: 0.5 }, 0)!;
    expect(straight.d).toMatch(/^M0\.76 0\.5 L/);
    const bent = arrowGeometry({ x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 }, 0.55)!;
    // A left-to-right arc bends upwards (towards y < 0.5) and stays within the row.
    const control = bent.d.match(/Q([\d.-]+) ([\d.-]+)/)!;
    expect(Number(control[2])).toBeLessThan(0.5);
    expect(Number(control[2])).toBeGreaterThan(-0.1);
    expect(arrowGeometry({ x: 1, y: 1 }, { x: 1, y: 1 }, 0)).toBeNull();
  });

  it('gives grouped tables one row-header width, so their columns line up', () => {
    const t = new GridTracer([]);
    const cols = Array.from({ length: 6 }, () => ({ label: '' }));
    t.addTable({ label: 'Meetings', look: 'timeline', rows: [{ id: 'a', label: 'A', sub: '1–4' }], cols, group: 'time' });
    t.addTable({ id: 'rooms', label: 'Rooms', look: 'timeline', rows: [], cols, group: 'time', empty: 'No rooms yet' });
    expect(render(t)).toContain('No rooms yet');
    t.addRow({ id: 'r1', label: 'Room 1 (a long name)' }, 'rooms');
    const widths = [...render(t).matchAll(/min-width:(\d+)px/g)].map((m) => m[1]);
    expect(widths).toHaveLength(2);
    expect(widths[0]).toBe(widths[1]);
    expect(stateProblems(t.frame({ note: 'x' }).state)).toEqual([]);
  });

  it('draws bar rows up to their scale, and walls as solid cells described as walls', () => {
    const t = new GridTracer([]);
    t.addTable({ label: 'T', rows: [{ id: 'v', label: 'v', scale: 8 }, { id: 'dp', label: 'dp' }], cols: [{ label: '0' }, { label: '1' }] });
    t.set([0, 0], 4);
    t.set([0, 1], 8);
    t.setStyle([1, 1], 'block');
    const html = render(t);
    expect(html).toContain('height:50%');
    expect(html).toContain('height:100%');
    const part = t.frame({ note: 'x' }).state.parts[0];
    expect(part.kind === 'table' && describeTable(part)).toContain('row dp: blank, wall');
  });

  it('reorders list items and refuses a duplicate row', () => {
    const t = new GridTracer([]);
    t.addList({ id: 'heap', label: 'Heap', empty: 'Empty' });
    t.addItem('heap', { id: 'a', text: 'a' });
    t.addItem('heap', { id: 'b', text: 'b' });
    t.reorderItems('heap', ['b', 'a']);
    const heap = t.frame({ note: 'x' }).state.parts[0];
    expect(heap.kind === 'list' && heap.items.map((it) => it.id)).toEqual(['b', 'a']);
    expect(() => t.reorderItems('heap', ['a'])).toThrow();
    t.addTable({ label: 'T', rows: [{ id: 'x', label: 'x' }], cols: [{ label: '0' }] });
    expect(() => t.addRow({ id: 'x', label: 'again' })).toThrow();
  });
});
