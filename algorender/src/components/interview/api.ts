'use client';

// The browser's side of /api/interview (src/server/interview/): one POST per
// action, the round back each time, and the round's event (once it has
// ended) kept in the progress store like the judge's verdicts.

import { progressStore } from '@/progress/store';
import type { InterviewResponse, RoundView } from '@/server/interview';

export type { RoundView };

export type Posted = { ok: true; body: InterviewResponse } | { ok: false; status: number; message: string; round?: string };

export async function postInterview(body: Record<string, unknown>): Promise<Posted> {
  let res: Response;
  try {
    res = await fetch('/api/interview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, message: 'Couldn’t reach the interviewer. Are you online?' };
  }
  const json = (await res.json().catch(() => null)) as (InterviewResponse & { error?: string; round?: unknown }) | null;
  if (!res.ok || !json) {
    return { ok: false, status: res.status, message: json?.error ?? `The interviewer answered with an error (${res.status}). Try again in a moment.`, round: typeof json?.round === 'string' ? json.round : undefined };
  }
  if (json.event) progressStore().receive(json.event);
  if (json.judge?.event) progressStore().receive(json.judge.event);
  return { ok: true, body: json };
}

/** "52 min", "1 h 5 min". */
export const minutesText = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`);

/** "04:09" for an elapsed time in milliseconds. */
export function clockText(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
