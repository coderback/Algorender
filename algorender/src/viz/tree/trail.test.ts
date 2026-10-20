import { describe, expect, it } from 'vitest';
import type { AnyStructure } from '@/engine/module';
import { recordOperation } from '@/engine/trace';
import { avlTree } from '@/structures/trees/avl-tree';
import { bTree } from '@/structures/trees/b-tree';
import { binaryTree } from '@/structures/trees/binary-tree';
import { decisionTrail } from './trail';
import type { TreeState } from './types';

function framesOf(ds: AnyStructure, op: string, key: number): TreeState[] {
  const spec = ds.operations.find((o) => o.id === op)!;
  const model = ds.initial[0].make(1);
  return recordOperation(spec.run(model as never, { key: String(key) } as never)).frames.map((f) => f.state as TreeState);
}

describe('decision trail (V3)', () => {
  for (const ds of [binaryTree, avlTree, bTree]) {
    for (const op of ['insert', 'search']) {
      for (const key of [1, 33, 47, 99]) {
        it(`${ds.slug} ${op} ${key}: one decision per level, then the comparison in hand`, () => {
          const withProbe = framesOf(ds, op, key).filter((s) => s.probe && Number.isFinite(Number(s.probe.label)));
          expect(withProbe.length).toBeGreaterThan(0);
          for (const s of withProbe) {
            const trail = decisionTrail(s);
            expect(trail, s.description).not.toBeNull();
            expect(trail!.at(-1)).toMatchObject({ id: s.probe!.at, current: true });
            expect(trail!.at(-1)!.text).toContain(' vs ');
            for (const step of trail!.slice(0, -1)) expect(step.text).toMatch(/[<>]/);
          }
        });
      }
    }
  }

  it('has no trail without a probe', () => {
    const s = framesOf(binaryTree, 'insert', 33)[0];
    expect(decisionTrail({ ...s, probe: null })).toBeNull();
  });
});
