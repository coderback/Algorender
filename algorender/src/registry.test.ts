import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { visualisers } from '@/data/visualisers';
import type { AnyVisualiser } from '@/engine/module';
import { modules } from './registry';

/** Longest pseudo-code line that fits the 360px code panel without wrapping. */
const MAX_LINE = 42;

const all = Object.values(modules) as AnyVisualiser[];
const legacyDir = (slug: string) => fileURLToPath(new URL(`./app/visualisers/${slug}`, import.meta.url));
const pseudocodeOf = (m: AnyVisualiser) =>
  m.kind === 'algorithm' ? [{ name: 'run', lines: m.pseudocode }] : m.operations.map((o) => ({ name: o.id, lines: o.pseudocode }));

describe.each(all.map((m) => [m.slug, m] as const))('%s', (slug, m) => {
  it('is listed in the site registry and has no legacy page shadowing its route', () => {
    expect(visualisers.find((v) => v.slug === slug)).toBeDefined();
    expect(existsSync(legacyDir(slug))).toBe(false);
  });

  it('has pseudo-code that fits the code panel', () => {
    for (const { name, lines } of pseudocodeOf(m)) {
      for (const line of lines) expect(line.length, `${name}: "${line}"`).toBeLessThanOrEqual(MAX_LINE);
    }
  });

  it('has complete teaching content and a neutral legend row', () => {
    const { idea, invariant, whenToUse } = m.content;
    for (const text of [idea, invariant, whenToUse]) expect(text.length).toBeGreaterThan(20);
    expect(m.legend.some((e) => typeof e === 'object' && 'neutral' in e)).toBe(true);
  });
});
