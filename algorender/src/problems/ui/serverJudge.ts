// The browser's side of the server judge: posts the learner's Java, C++ or Go
// code to /api/judge and reads back the verdicts (src/server/judge/), and asks
// /api/expected for the expected answer to the learner's own test.

import type { JudgeResponse } from '@/server/judge';
import type { ExpectedResponse } from '@/server/judge/expected';
import type { Json } from '@/workspace/protocol';
import type { CustomInput } from '../custom';
import type { ProblemLanguage, ServerLanguage } from '../languages';

export type ServerAnswer = { ok: true; body: JudgeResponse } | { ok: false; status: number; message: string };

/** Runs the examples ('run'), every test ('submit'), or the learner's own test ('custom', with its values). */
export async function runOnServer(slug: string, language: ServerLanguage, code: string, kind: 'run' | 'submit' | 'custom', custom?: CustomInput): Promise<ServerAnswer> {
  let res: Response;
  try {
    res = await fetch('/api/judge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, language, code, kind, ...custom }) });
  } catch {
    return { ok: false, status: 0, message: 'Couldn’t reach the judge. Are you online?' };
  }
  const body = (await res.json().catch(() => null)) as (JudgeResponse & { error?: string }) | null;
  if (!res.ok || !body) return { ok: false, status: res.status, message: body?.error ?? `The judge answered with an error (${res.status}). Try again in a moment.` };
  return { ok: true, body };
}

/** The expected answer to the learner's own test, as the card shows it. */
export type ExpectedState =
  | { state: 'loading' }
  | { state: 'answer'; expected: Json }
  /** Our solution has no answer: the input is probably outside the problem's constraints. */
  | { state: 'none'; message: string }
  | { state: 'sign-in' }
  /** A limit, an outage, or no connection. */
  | { state: 'unavailable'; message: string };

/** Asks the server for the reference solution's answer to the learner's own test (/api/expected). */
export async function fetchExpected(slug: string, language: ProblemLanguage, custom: CustomInput): Promise<ExpectedState> {
  let res: Response;
  try {
    res = await fetch('/api/expected', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, language, ...custom }) });
  } catch {
    return { state: 'unavailable', message: 'Couldn’t reach the server for the expected answer. Are you online?' };
  }
  if (res.status === 401) return { state: 'sign-in' };
  const body = (await res.json().catch(() => null)) as (ExpectedResponse & { error?: string }) | null;
  if (!res.ok || !body) return { state: 'unavailable', message: body?.error ?? `The expected answer isn’t available right now (${res.status}).` };
  return 'none' in body ? { state: 'none', message: body.none } : { state: 'answer', expected: body.expected };
}
