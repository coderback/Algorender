import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AnyStructure, Args } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import { hashStructures } from '@/structures/hashing';
import { linearStructures } from '@/structures/linear';
import { HashView } from '@/viz/hash/HashView';
import type { HashState } from '@/viz/hash/types';
import { LinearView } from './LinearView';
import type { LinearState } from './types';

const linear = (state: unknown) => renderToStaticMarkup(createElement(LinearView, { state: state as LinearState }));
const hash = (state: unknown) => renderToStaticMarkup(createElement(HashView, { state: state as HashState }));

// Server rendering can't measure, so pretend the view was measured at a phone or desktop width.
const measured = vi.hoisted(() => ({ width: 360 }));
vi.mock('./useWidth', () => ({ useWidth: () => [{ current: null }, measured.width] as const }));

/** Arguments that exercise each operation on an example: a small index, the default value, a common key. */
function argsFor(ds: AnyStructure, opIndex: number): Args {
  return Object.fromEntries(
    ds.operations[opIndex].args.map((a) => [a.name, a.type === 'int' ? (a.name === 'index' ? 1 : (a.default ?? a.min)) : 'cat']),
  );
}

describe.each([
  ...linearStructures.map((ds) => [ds.slug, ds, linear] as const),
  ...hashStructures.map((ds) => [ds.slug, ds, hash] as const),
])('%s view', (_, ds, render) => {
  it.each([360, 1000])('renders every example and every frame of every operation at %ipx', (width) => {
    measured.width = width;
    for (const start of ds.initial) {
      const model = start.make(3);
      const idle = render(ds.snapshot(model));
      expect(idle).toContain('sr-only');
      expect(idle).toContain('aria-hidden');
      ds.operations.forEach((spec, k) => {
        if (spec.disabledReason?.(model)) return;
        for (const frame of recordOperation(spec.run(model, argsFor(ds, k))).frames) {
          expect(render(frame.state)).toContain('aria-hidden');
        }
      });
    }
  });
});
