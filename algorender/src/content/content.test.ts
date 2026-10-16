import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { visualisers } from '@/data/visualisers';
import { modules } from '@/registry';
import { depths, loadConcepts } from './concepts';
import { lessons } from './lessons';

const { tracks, concepts } = loadConcepts();
const conceptIds = new Set(concepts.map((c) => c.id));
const trackIds = new Set(tracks.map((t) => t.id));

describe('concept graph', () => {
  it('has unique ids and known tracks', () => {
    expect(conceptIds.size).toBe(concepts.length);
    expect(trackIds.size).toBe(tracks.length);
    for (const c of concepts) expect(trackIds.has(c.track), `${c.id} → track ${c.track}`).toBe(true);
  });

  it('only depends on concepts that exist, with no cycles', () => {
    for (const c of concepts) for (const p of c.prereqs) expect(conceptIds.has(p), `${c.id} needs ${p}`).toBe(true);
    expect(() => depths()).not.toThrow();
  });

  it('points only at visualisers and lessons that exist', () => {
    const slugs = new Set(visualisers.map((v: { slug: string }) => v.slug));
    for (const c of concepts) {
      for (const v of c.visualisers) expect(slugs.has(v), `${c.id} → ${v}`).toBe(true);
      if (c.lesson) expect(lessons.some((l) => l.slug === c.lesson), `${c.id} → lesson ${c.lesson}`).toBe(true);
    }
  });

  it('teaches every visualiser on the site', () => {
    const taught = new Set(concepts.flatMap((c) => c.visualisers));
    const missing = visualisers.filter((v: { slug: string; hidden?: boolean }) => !v.hidden && !taught.has(v.slug));
    expect(missing.map((v: { slug: string }) => v.slug)).toEqual([]);
  });

  it('keeps planned concepts empty and available ones openable', () => {
    for (const c of concepts) {
      if (c.planned) expect(c.visualisers.length + c.links.length + (c.lesson ? 1 : 0), c.id).toBe(0);
      else expect(c.visualisers.length + c.links.length + (c.lesson ? 1 : 0), c.id).toBeGreaterThan(0);
    }
  });

  it('never has an available concept depend only on planned work it cannot reach', () => {
    const planned = new Set(concepts.filter((c) => c.planned).map((c) => c.id));
    for (const c of concepts.filter((c) => !c.planned)) for (const p of c.prereqs) expect(planned.has(p), `${c.id} needs planned ${p}`).toBe(false);
  });
});

describe('lessons', () => {
  it.each(lessons.map((l) => [l.slug, l] as const))('%s has a body, a concept that points back, and live visualisers', (slug, lesson) => {
    const file = fileURLToPath(new URL(`./lessons/${slug}.mdx`, import.meta.url));
    expect(existsSync(file)).toBe(true);
    const concept = concepts.find((c) => c.id === lesson.concept);
    expect(concept?.lesson).toBe(slug);
    expect(lesson.minutes).toBeGreaterThan(0);
  });

  it('only embeds code exercises that exist', async () => {
    const { readFileSync } = await import('node:fs');
    const { getExercise } = await import('./exercises');
    for (const { slug } of lessons) {
      const body = readFileSync(fileURLToPath(new URL(`./lessons/${slug}.mdx`, import.meta.url)), 'utf8');
      for (const [, used] of body.matchAll(/exercise="([a-z0-9-]+)"/g)) expect(getExercise(used), `${slug} embeds exercise ${used}`).toBeDefined();
    }
  });

  it('only embeds visualisers that are registered', async () => {
    const { readFileSync } = await import('node:fs');
    for (const { slug } of lessons) {
      const body = readFileSync(fileURLToPath(new URL(`./lessons/${slug}.mdx`, import.meta.url)), 'utf8');
      for (const [, used] of body.matchAll(/slug="([a-z0-9-]+)"/g)) expect(modules[used], `${slug} embeds ${used}`).toBeDefined();
    }
  });
});
