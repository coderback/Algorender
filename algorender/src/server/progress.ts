// Syncing a learner's progress events: the device pushes the events it hasn't
// sent yet and pulls the ones it hasn't seen, in one request. Pushes are
// idempotent (an event is stored once per user, by id), so a retry after a
// lost response is harmless. Pulls page through the server's order (`seq`)
// from the device's cursor.

import { and, asc, eq, gt } from 'drizzle-orm';
import { parseEvent, type ProgressEvent } from '@/progress/events';
import type { Database } from './db';
import { progressEvent } from './db/schema';

/** Most events one request may push, and pull. */
export const MAX_PUSH = 500;
export const MAX_PULL = 1_000;

export type SyncRequest = { events: unknown[]; cursor: number };

export type SyncResponse = {
  /** Ids now stored (or stored already): the device can mark them sent. */
  accepted: string[];
  /** Ids of pushed events refused as malformed (from an app version that wrote them wrong); the device drops them. */
  rejected: string[];
  /** Events after the cursor, in server order, including ones just pushed. */
  events: ProgressEvent[];
  cursor: number;
  /** More events wait after `cursor`: pull again. */
  more: boolean;
};

export class SyncError extends Error {}

/** Validates a sync request body. */
export function parseSyncRequest(body: unknown): SyncRequest {
  if (typeof body !== 'object' || body === null) throw new SyncError('Expected a JSON object.');
  const { events, cursor } = body as Record<string, unknown>;
  if (!Array.isArray(events)) throw new SyncError('`events` must be a list.');
  if (events.length > MAX_PUSH) throw new SyncError(`Push at most ${MAX_PUSH} events at a time.`);
  if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0) throw new SyncError('`cursor` must be a whole number.');
  return { events, cursor };
}

/**
 * Stores what the device pushed and returns what it hasn't seen. Event times
 * come from the device's clock and are kept as they are, even when they look
 * wrong: they only schedule the learner's own reviews, and refusing them would
 * make the device drop the learner's work.
 */
export async function sync(db: Database, userId: string, { events, cursor }: SyncRequest): Promise<SyncResponse> {
  const valid: ProgressEvent[] = [];
  const rejected: string[] = [];
  for (const raw of events) {
    const event = parseEvent(raw);
    const id = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : '';
    if (!event) {
      if (id) rejected.push(id);
      continue;
    }
    valid.push({ ...event, at: new Date(event.at).toISOString(), data: unverified(event) } as ProgressEvent);
  }

  await storeEvents(db, userId, valid);

  const rows = await db
    .select({ id: progressEvent.id, seq: progressEvent.seq, kind: progressEvent.kind, at: progressEvent.at, data: progressEvent.data })
    .from(progressEvent)
    .where(and(eq(progressEvent.userId, userId), gt(progressEvent.seq, cursor)))
    .orderBy(asc(progressEvent.seq))
    .limit(MAX_PULL + 1);

  const more = rows.length > MAX_PULL;
  const page = rows.slice(0, MAX_PULL);
  const pulled: ProgressEvent[] = [];
  for (const row of page) {
    // Kinds a newer app wrote, or rows from before a format change, are skipped rather than sent malformed.
    const event = parseEvent({ id: row.id, kind: row.kind, at: new Date(row.at).toISOString(), data: row.data });
    if (event) pulled.push(event);
  }
  return { accepted: valid.map((e) => e.id), rejected, events: pulled, cursor: page.at(-1)?.seq ?? cursor, more };
}

/** Stores events once each (by id), from a device or from the server itself (the judge's verdicts). */
export async function storeEvents(db: Database, userId: string, events: ProgressEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db
    .insert(progressEvent)
    .values(events.map((e) => ({ userId, id: e.id, kind: e.kind, at: e.at, data: e.data })))
    .onConflictDoNothing();
}

/** Only the server judge marks a submission verified, so a device's claim to it is dropped (and the server's own copy, same id, stays). */
function unverified(event: ProgressEvent): ProgressEvent['data'] {
  if (event.kind !== 'problem.submitted' || !event.data.verified) return event.data;
  const data = { ...event.data };
  delete data.verified;
  return data;
}
