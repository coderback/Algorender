import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

// The concept graph: what there is to learn, in which order. Server-only (it
// reads src/content/concepts.yaml from disk at build time).

const id = z.string().regex(/^[a-z0-9-]+$/, 'ids are lowercase-kebab-case');

const TrackSchema = z.object({
  id,
  title: z.string(),
  summary: z.string(),
  planned: z.boolean().default(false),
});

const ConceptSchema = z.object({
  id,
  title: z.string(),
  track: id,
  summary: z.string(),
  prereqs: z.array(id).default([]),
  visualisers: z.array(id).default([]),
  lesson: id.optional(),
  links: z.array(z.object({ href: z.string().startsWith('/'), label: z.string() })).default([]),
  planned: z.boolean().default(false),
});

const FileSchema = z.object({ tracks: z.array(TrackSchema), concepts: z.array(ConceptSchema) });

export type Track = z.infer<typeof TrackSchema>;
export type Concept = z.infer<typeof ConceptSchema>;

let cache: z.infer<typeof FileSchema> | null = null;

/** Parses and validates the concept graph (once per process). */
export function loadConcepts() {
  if (!cache) {
    const text = readFileSync(path.join(process.cwd(), 'src/content/concepts.yaml'), 'utf8');
    cache = FileSchema.parse(parse(text));
  }
  return cache;
}

export function getConcept(conceptId: string): Concept | undefined {
  return loadConcepts().concepts.find((c) => c.id === conceptId);
}

/** Concepts that list `conceptId` as a prerequisite: what this unlocks. */
export function unlockedBy(conceptId: string): Concept[] {
  return loadConcepts().concepts.filter((c) => c.prereqs.includes(conceptId));
}

/**
 * Depth in the prerequisite graph: 0 for concepts with no prerequisites, else
 * one more than the deepest prerequisite. Used to order concepts within a track.
 */
export function depths(): Map<string, number> {
  const { concepts } = loadConcepts();
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const memo = new Map<string, number>();
  const visit = (cid: string, stack: Set<string>): number => {
    if (memo.has(cid)) return memo.get(cid)!;
    if (stack.has(cid)) throw new Error(`Prerequisite cycle through "${cid}"`);
    stack.add(cid);
    const prereqs = byId.get(cid)?.prereqs ?? [];
    const d = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map((p) => visit(p, stack)));
    stack.delete(cid);
    memo.set(cid, d);
    return d;
  };
  for (const c of concepts) visit(c.id, new Set());
  return memo;
}
