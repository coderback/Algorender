import { describe, expect, it } from 'vitest';
import { modules } from '@/registry';
import { stageCaption } from './captions';

// Every visualiser's stage gets a caption read from its state: short, with
// no gaps where a count or a name should be.
describe('stage captions', () => {
  for (const [slug, m] of Object.entries(modules)) {
    it(`${slug} has a short caption on its first and last frames`, () => {
      let states: unknown[];
      if (m.kind === 'algorithm') {
        const size = m.input.size?.default ?? 8;
        const frames = [...m.run(m.input.examples[0].make({ seed: 1, size }) as never)];
        states = [frames[0].state, frames.at(-1)!.state];
      } else {
        states = [m.snapshot(m.initial[0].make(1) as never)];
      }
      for (const state of states) {
        const caption = stageCaption(m.view, state);
        expect(caption.length, caption).toBeGreaterThan(3);
        expect(caption.length, caption).toBeLessThanOrEqual(64);
        expect(caption, caption).not.toMatch(/undefined|NaN|null|\s·\s*$|·\s·/);
      }
    });
  }

  it('names a graph the way the board does', () => {
    const state = { directed: false, weighted: true, nodes: Array.from({ length: 6 }, (_, i) => ({ id: String(i) })) };
    expect(stageCaption('graph', state)).toBe('Graph · 6 nodes · weighted, undirected');
  });
});
