'use client';

import Link from 'next/link';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FiCornerDownRight, FiCrosshair, FiHelpCircle, FiLoader, FiMessageCircle, FiX } from 'react-icons/fi';
import { authClient } from '@/lib/auth-client';
import { LEVEL_NAMES, unlockedLevel, type Level } from '@/lib/tutor-ladder';
import type { ProblemLanguage } from '@/problems/languages';

// The AI tutor beside a problem or exercise (REVAMP_PLAN.md §6.8). The UI
// enforces the learning design as much as the server does:
// - before the first hint, the learner says what they think is happening;
// - hints climb one level at a time, each button naming the next level;
// - after each reply, an optional line on what they'll try next, which goes
//   with their next turn;
// - a reply that points at a line highlights it in the editor.
// Replies are model output: they render as plain Markdown with no links or HTML.

export type TutorResults = {
  passed: number;
  total: number;
  fatal?: string;
  failing?: { label: string; input: string; expected: string; got: string; error?: string };
};

type Turn = { role: 'learner' | 'tutor'; text: string; level?: Level; line?: number | null; blocked?: boolean };
type Status = { turnsLeft: number; top: number; itemTurns: number };

const HISTORY = 8;

export function TutorPanel({
  item,
  language,
  code,
  results,
  onPoint,
}: {
  item: { kind: 'problem' | 'exercise'; slug: string };
  language: ProblemLanguage;
  code: string;
  results?: TutorResults;
  onPoint: (line: number | null) => void;
}) {
  const session = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [explanation, setExplanation] = useState('');
  const [reflection, setReflection] = useState('');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${item.kind}:${item.slug}`;

  if (session.isPending) return null;
  if (!session.data) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line-soft bg-surface px-4 py-3 text-sm text-ink-soft">
        <FiHelpCircle aria-hidden className="text-accent-ink" />
        Stuck? The tutor gives hints that point the way, never the answer.
        <Link href={`/account?next=${encodeURIComponent(`/${item.kind === 'problem' ? 'practice' : 'code'}/${item.slug}`)}`} className="font-medium text-accent-ink hover:underline">
          Sign in to ask it
        </Link>
      </div>
    );
  }

  const openPanel = async () => {
    setOpen(true);
    if (status) return;
    try {
      const res = await fetch(`/api/tutor?item=${encodeURIComponent(key)}`);
      const body = (await res.json()) as Partial<Status> & { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'The tutor isn’t available right now.');
      setStatus({ turnsLeft: body.turnsLeft ?? 0, top: body.top ?? 0, itemTurns: body.itemTurns ?? 0 });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => void openPanel()}
        className="flex w-full items-center gap-3 rounded-xl border border-line-soft bg-surface px-4 py-3 text-left text-sm hover:border-accent-line hover:bg-accent-soft"
      >
        <FiMessageCircle aria-hidden className="shrink-0 text-accent-ink" />
        <span>
          <span className="font-medium text-ink">Stuck? Ask the tutor.</span>{' '}
          <span className="text-ink-soft">Hints that point the way, one step at a time, never the answer.</span>
        </span>
      </button>
    );
  }

  const failedRun = !!results && (!!results.fatal || results.passed < results.total);
  const top = status?.top ?? 0;
  const unlocked = unlockedLevel(top, status?.itemTurns ?? 0, failedRun);
  const first = top === 0;
  const outOfTurns = status != null && status.turnsLeft <= 0;

  const send = async (action: 'hint' | 'review' | 'ask') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // The reflection joins the conversation; the explanation and question travel in their own fields and are shown, not re-sent.
    const reflected: Turn[] = reflection.trim() ? [{ role: 'learner', text: `I'll try: ${reflection.trim()}` }] : [];
    const asked: Turn[] =
      action === 'ask' ? [{ role: 'learner', text: question.trim() }] : (first || action === 'review') && explanation.trim() ? [{ role: 'learner', text: explanation.trim() }] : [];
    const pending = [...reflected, ...asked];
    const history = [...turns, ...reflected].slice(-HISTORY).map((t) => ({ role: t.role, text: t.text }));
    try {
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, language, code, action, explanation: explanation.trim(), question: question.trim(), results, history }),
      });
      const body = (await res.json()) as { error?: string; reply?: string; line?: number | null; level?: Level; turnsLeft?: number; blocked?: boolean };
      if (!res.ok || !body.reply || !body.level) throw new Error(body.error ?? 'The tutor couldn’t answer just now.');
      setTurns((t) => [...t, ...pending, { role: 'tutor', text: body.reply!, level: body.level, line: body.line ?? null, blocked: body.blocked }]);
      setStatus((s) => ({ turnsLeft: body.turnsLeft ?? 0, top: Math.max(s?.top ?? 0, body.level!), itemTurns: (s?.itemTurns ?? 0) + 1 }));
      setReflection('');
      setQuestion('');
      // An account of what's happening describes the code as it was: the next review asks afresh.
      if (first || action === 'review') setExplanation('');
      if (body.line) onPoint(body.line);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lastTutor = [...turns].reverse().find((t) => t.role === 'tutor');
  return (
    <section aria-labelledby="tutor-title" className="space-y-3 rounded-xl border border-accent-line bg-surface p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tutor-title" className="flex items-center gap-2 font-semibold text-ink">
          <FiMessageCircle aria-hidden className="text-accent-ink" /> Tutor
        </h2>
        <span className="flex items-center gap-3 text-xs text-ink-muted">
          {status && `${status.turnsLeft} ${status.turnsLeft === 1 ? 'turn' : 'turns'} left today`}
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the tutor" className="rounded p-1 hover:bg-sunken">
            <FiX aria-hidden />
          </button>
        </span>
      </div>

      {turns.length > 0 && (
        <ol className="space-y-2" aria-live="polite">
          {turns.map((t, i) =>
            t.role === 'tutor' ? (
              <li key={i} className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink">
                {t.level && <div className="mb-1 text-xs font-medium text-accent-ink">{LEVEL_NAMES[t.level]}</div>}
                <Reply text={t.text} />
                {t.line != null && (
                  <button type="button" onClick={() => onPoint(t.line!)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
                    <FiCrosshair aria-hidden /> Show line {t.line}
                  </button>
                )}
              </li>
            ) : (
              <li key={i} className="ml-8 rounded-lg bg-sunken px-3 py-2 text-sm text-ink-soft">
                {t.text}
              </li>
            ),
          )}
        </ol>
      )}

      {(first || failedRun) && (
        <div>
          <label htmlFor="tutor-explain" className="mb-1 block text-sm font-medium text-ink">
            {first ? 'First, in a sentence: what do you think is happening?' : 'What do you think is wrong now? (a review needs this)'}
          </label>
          <textarea
            id="tutor-explain"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={2}
            maxLength={600}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
            placeholder="e.g. It works on the first example but returns the same index twice on the second."
          />
        </div>
      )}

      {lastTutor && (
        <div>
          <label htmlFor="tutor-reflect" className="mb-1 flex items-center gap-1.5 text-sm text-ink-soft">
            <FiCornerDownRight aria-hidden /> What will you try? <span className="text-ink-muted">(optional, sent with your next turn)</span>
          </label>
          <input
            id="tutor-reflect"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            maxLength={300}
            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !status || outOfTurns || (first && explanation.trim().length < 5)}
          onClick={() => void send('hint')}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-50"
        >
          {busy && <FiLoader aria-hidden className="animate-spin" />}
          {first ? 'Get a nudge' : unlocked > top ? `Next hint: ${LEVEL_NAMES[unlocked]}` : `Another hint: ${LEVEL_NAMES[unlocked]}`}
        </button>
        {!first && (
          <button
            type="button"
            disabled={busy || !status || outOfTurns || !failedRun || explanation.trim().length < 5}
            onClick={() => void send('review')}
            title={failedRun ? undefined : 'Run the tests first, so the review has something to explain'}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:bg-subtle disabled:opacity-50"
          >
            Review my code
          </button>
        )}
      </div>
      {!first && top >= 3 && unlocked < 4 && <p className="text-xs text-ink-muted">A partial fix unlocks after a failed run and two hints on this problem.</p>}

      {!first && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim().length >= 3) void send('ask');
          }}
        >
          <label htmlFor="tutor-question" className="sr-only">
            Ask a follow-up question
          </label>
          <input
            id="tutor-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={600}
            placeholder="Ask a follow-up question"
            className="min-w-0 grow rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink"
          />
          <button type="submit" disabled={busy || outOfTurns || question.trim().length < 3} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-subtle disabled:opacity-50">
            Ask
          </button>
        </form>
      )}
      <p className="text-xs text-ink-muted">The tutor is an AI and can be wrong. It never writes the whole solution: working it out is what makes it stick.</p>
    </section>
  );
}

/** A reply as Markdown, with no links, images or HTML: it comes from a model. */
function Reply({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 [&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface [&_pre]:p-2">
      <ReactMarkdown allowedElements={['p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'br']} unwrapDisallowed skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
