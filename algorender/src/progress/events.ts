// The learner's progress, as events: the one format the device stores, the
// sync route accepts and every projection reads (projections.ts). An event is
// a fact that happened ("solved two-sum in Python at 10:04"), never a total,
// so two devices merge by taking the union of their events.
//
// Ids are UUIDv7: unique without a server, and in time order when sorted.
// Adding a kind is safe; changing what an existing kind means is not (old
// events are kept forever), so add a new kind instead.

import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const count = z.number().int().min(0).max(100_000);

export const CARD_ID = /^[a-z]+(:[a-z0-9-]{1,80}){1,3}$/;

/** What each kind of event carries. */
export const EVENT_DATA = {
  /** A lesson marked done (or not done again). */
  'lesson.completed': z.object({ lesson: slug, done: z.boolean() }),
  /** A quiz or a prediction challenge in a lesson, finished with this score. */
  'lesson.scored': z.object({ lesson: slug, key: slug, kind: z.enum(['quiz', 'prediction']), correct: count, total: count }),
  /** One quiz question answered (the first answer counts). `question` is its index in the quiz. */
  'quiz.answered': z.object({ lesson: slug, quiz: slug, question: z.number().int().min(0).max(99), correct: z.boolean() }),
  /** A stage of a code exercise passed: every test green. `level` is the fill-in level. */
  'exercise.passed': z.object({ exercise: slug, stage: z.enum(['parsons', 'fill', 'write', 'bug']), level: z.number().int().min(0).max(20).optional() }),
  /** A practice problem submitted: how many tests ran and how many failed. */
  'problem.submitted': z.object({
    problem: slug,
    language: z.enum(['python', 'javascript', 'typescript', 'java', 'cpp', 'go']),
    passed: z.boolean(),
    tests: count,
    failed: count,
    /** Judged on the server (Java, C++, Go) rather than in the browser. Only the server writes it: sync drops it from events a device sends. */
    verified: z.literal(true).optional(),
  }),
  /** A review card rated: 1 again, 2 hard, 3 good, 4 easy (FSRS's ratings). */
  'review.rated': z.object({ card: z.string().regex(CARD_ID), rating: z.number().int().min(1).max(4) }),
} as const;

export type EventKind = keyof typeof EVENT_DATA;
export const EVENT_KINDS = Object.keys(EVENT_DATA) as EventKind[];
export type EventData<K extends EventKind> = z.infer<(typeof EVENT_DATA)[K]>;

export type ProgressEvent = { [K in EventKind]: { id: string; kind: K; at: string; data: EventData<K> } }[EventKind];

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const base = { id: z.string().regex(UUID_V7), at: z.iso.datetime({ offset: true }) };

export const ProgressEventSchema = z.discriminatedUnion(
  'kind',
  EVENT_KINDS.map((kind) => z.object({ ...base, kind: z.literal(kind), data: EVENT_DATA[kind] })) as unknown as [
    z.ZodObject<{ id: z.ZodString; at: z.ZodString; kind: z.ZodLiteral<EventKind>; data: z.ZodTypeAny }>,
  ],
);

/** Parses an event from outside (a sync request, an old database row); null when it isn't one. */
export function parseEvent(raw: unknown): ProgressEvent | null {
  const r = ProgressEventSchema.safeParse(raw);
  return r.success ? (r.data as ProgressEvent) : null;
}

/** Events in the order they happened: UUIDv7 ids sort by creation time. */
export const byTime = (a: ProgressEvent, b: ProgressEvent) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
