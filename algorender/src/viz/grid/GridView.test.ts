import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { backtracking } from '@/algorithms/backtracking';
import { dynamicProgramming } from '@/algorithms/dp';
import { greedy } from '@/algorithms/greedy';
import { arrowGeometry } from './geometry';
import { GridView } from './GridView';
import { traceOf } from './testing';

const modules = [...dynamicProgramming, ...greedy, ...backtracking];

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
});
