// The browser's side of the server judge: posts the learner's Java, C++ or Go
// code to /api/judge and reads back the verdicts (src/server/judge/).

import type { JudgeResponse } from '@/server/judge';
import type { ServerLanguage } from '../languages';

export type ServerAnswer = { ok: true; body: JudgeResponse } | { ok: false; status: number; message: string };

export async function runOnServer(slug: string, language: ServerLanguage, code: string, kind: 'run' | 'submit'): Promise<ServerAnswer> {
  let res: Response;
  try {
    res = await fetch('/api/judge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, language, code, kind }) });
  } catch {
    return { ok: false, status: 0, message: 'Couldn’t reach the judge. Are you online?' };
  }
  const body = (await res.json().catch(() => null)) as (JudgeResponse & { error?: string }) | null;
  if (!res.ok || !body) return { ok: false, status: res.status, message: body?.error ?? `The judge answered with an error (${res.status}). Try again in a moment.` };
  return { ok: true, body };
}
