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

  it('keeps `later` for prerequisites that are still planned, and moves them to `prereqs` once they are available', () => {
    const byId = new Map(concepts.map((c) => [c.id, c]));
    for (const c of concepts) {
      for (const p of c.later) {
        expect(byId.has(p), `${c.id} later needs ${p}`).toBe(true);
        expect(byId.get(p)?.planned, `${p} is available now: move it from ${c.id}'s later to its prereqs`).toBe(true);
        expect(c.prereqs, `${c.id} lists ${p} twice`).not.toContain(p);
      }
      // A planned concept just lists what it needs.
      if (c.planned) expect(c.later, c.id).toEqual([]);
    }
  });

  it('has no cycles once every `later` prerequisite is in place', () => {
    const byId = new Map(concepts.map((c) => [c.id, [...c.prereqs, ...c.later]]));
    const state = new Map<string, 'open' | 'done'>();
    const visit = (id: string, path: string[]) => {
      if (state.get(id) === 'done') return;
      expect(state.get(id), `cycle: ${[...path, id].join(' → ')}`).not.toBe('open');
      state.set(id, 'open');
      for (const p of byId.get(id) ?? []) visit(p, [...path, id]);
      state.set(id, 'done');
    };
    for (const c of concepts) visit(c.id, []);
  });

  it('gives every track an area, and the math and ML tracks the zero-to-hero concepts', () => {
    expect(tracks.map((t) => t.area)).not.toContain(undefined);
    const mathMl = concepts.filter((c) => tracks.find((t) => t.id === c.track)?.area === 'math' || tracks.find((t) => t.id === c.track)?.area === 'ml');
    // 21 that were there before the zero-to-hero path, and its 77 new ones, planned until their batch: B1 wrote 4, B2 4 more, B3 5, B4 5, B5 6 and B6 5.
    expect(mathMl.length).toBe(98);
    expect(mathMl.filter((c) => c.planned).length).toBe(48);
    // A planned track has nothing available yet.
    for (const t of tracks.filter((x) => x.planned)) expect(concepts.filter((c) => c.track === t.id && !c.planned).map((c) => c.id), t.id).toEqual([]);
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

  it('only traces code snippets that exist', async () => {
    const { readFileSync } = await import('node:fs');
    const { getSnippet } = await import('./snippets');
    for (const { slug } of lessons) {
      const body = readFileSync(fileURLToPath(new URL(`./lessons/${slug}.mdx`, import.meta.url)), 'utf8');
      for (const [, used] of body.matchAll(/snippet="([a-z0-9-]+)"/g)) expect(getSnippet(used), `${slug} traces snippet ${used}`).toBeDefined();
    }
  });

  it('works only tasks that exist, and ends every language topic in the strip of its own tasks', async () => {
    const { readFileSync } = await import('node:fs');
    const { getTask } = await import('./tasks');
    const { unitOf } = await import('./units');
    for (const { slug, concept } of lessons) {
      const body = readFileSync(fileURLToPath(new URL(`./lessons/${slug}.mdx`, import.meta.url)), 'utf8');
      const worked = [...body.matchAll(/<TopicTask task="([a-z0-9-]+)"/g)].map((m) => m[1]);
      const strips = [...body.matchAll(/<TaskStrip concept="([a-z0-9-]+)"/g)].map((m) => m[1]);
      for (const t of worked) expect(getTask(t)?.concept, `${slug} works task ${t}`).toBe(concept);
      for (const c of strips) expect(c, `${slug}'s strip`).toBe(concept);
      if (!unitOf(concept)) continue;
      // A topic: a prediction worked in the page, then its tasks.
      expect(strips, `${slug} ends in its strip of tasks`).toHaveLength(1);
      expect(worked.map((t) => getTask(t)?.kind), `${slug} asks for a prediction`).toContain('output');
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
