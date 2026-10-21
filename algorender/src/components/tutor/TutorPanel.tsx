'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FiCornerDownRight, FiEye, FiLoader, FiX, FiZap } from 'react-icons/fi';
import { Button, ButtonLink } from '@/components/ui/Button';
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-surface px-5 py-4 text-sm text-ink-soft">
        <span className="max-w-xs">Stuck? The tutor gives hints that point the way, never the answer.</span>
        <ButtonLink href={`/account?next=${encodeURIComponent(`/${item.kind === 'problem' ? 'practice' : 'code'}/${item.slug}`)}`} size="s">
          Sign in to ask it
        </ButtonLink>
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
        className="flex w-full flex-col gap-1.5 rounded-tile bg-feature px-6 py-5 text-left text-on-feature transition-transform duration-150 ease-standard hover:-translate-y-0.5"
      >
        <span className="font-display text-[24px] leading-tight font-bold">Stuck? Ask the tutor.</span>
        <span className="text-sm text-feature-muted">Hints that point the way, one step at a time, never the answer.</span>
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
    <section aria-labelledby="tutor-title" className="flex flex-col gap-3 rounded-[28px] bg-track-lilac p-5 text-track-lilac-ink">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tutor-title" className="font-display text-[22px] font-bold text-track-lilac-title">
          Tutor
        </h2>
        <span className="flex items-center gap-2">
          {status && (
            <span className="rounded-full bg-chip-on-track px-3 py-1 text-xs font-semibold">
              {status.turnsLeft} {status.turnsLeft === 1 ? 'turn' : 'turns'} left today
            </span>
          )}
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the tutor" className="inline-flex size-9 items-center justify-center rounded-full bg-surface text-ink hover:bg-subtle">
            <FiX aria-hidden />
          </button>
        </span>
      </div>

      {turns.length > 0 && (
        <ol className="flex flex-col gap-2" aria-live="polite">
          {turns.map((t, i) =>
            t.role === 'tutor' ? (
              <li key={i} className="rounded-[18px] bg-surface px-4 py-3 text-sm text-ink">
                {t.level && (
                  <div className="mb-1 text-xs font-bold tracking-[0.04em] text-accent-ink uppercase">
                    {t.level} · {LEVEL_NAMES[t.level]}
                  </div>
                )}
                <Reply text={t.text} />
                {t.line != null && (
                  <button type="button" onClick={() => onPoint(t.line!)} className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-ink hover:bg-sunken">
                    <FiEye aria-hidden /> Show line {t.line}
                  </button>
                )}
              </li>
            ) : (
              <li key={i} className="ml-8 rounded-[18px] bg-primary px-4 py-3 text-sm text-on-primary">
                {t.text}
              </li>
            ),
          )}
        </ol>
      )}

      {(first || failedRun) && (
        <div>
          <label htmlFor="tutor-explain" className="mb-1.5 block text-sm font-semibold">
            {first ? 'First, in a sentence: what do you think is happening?' : 'What do you think is wrong now? (a review needs this)'}
          </label>
          <textarea
            id="tutor-explain"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={2}
            maxLength={600}
            className="w-full rounded-[18px] bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-muted"
            placeholder="e.g. It works on the first example but returns the same index twice on the second."
          />
        </div>
      )}

      {lastTutor && (
        <div>
          <label htmlFor="tutor-reflect" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <FiCornerDownRight aria-hidden /> What will you try? <span className="font-normal">(optional, sent with your next turn)</span>
          </label>
          <input
            id="tutor-reflect"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            maxLength={300}
            className="h-11 w-full rounded-[18px] bg-surface px-4 text-sm text-ink"
          />
        </div>
      )}

      {outOfTurns && (
        <p className="rounded-[18px] bg-track-peach px-4 py-3 text-sm text-track-peach-title">
          <strong>You’ve used today’s turns,</strong> so they come back tomorrow. The hints so far stay here.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-[18px] bg-warn-soft px-4 py-3 text-sm text-warn-title">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy || !status || outOfTurns || (first && explanation.trim().length < 5)}
          onClick={() => void send('hint')}
          icon={busy ? <FiLoader aria-hidden className="animate-spin" /> : first ? <FiZap aria-hidden /> : undefined}
          block={first}
        >
          {first ? 'Get a nudge' : unlocked > top ? `Next hint: ${LEVEL_NAMES[unlocked]}` : `Another hint: ${LEVEL_NAMES[unlocked]}`}
        </Button>
        {!first && (
          <Button
            kind="onTrack"
            disabled={busy || !status || outOfTurns || !failedRun || explanation.trim().length < 5}
            onClick={() => void send('review')}
            title={failedRun ? undefined : 'Run the tests first, so the review has something to explain'}
          >
            Review my code
          </Button>
        )}
      </div>
      {!first && top >= 3 && unlocked < 4 && <p className="text-xs">A partial fix unlocks after a failed run and two hints on this problem.</p>}

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
            className="h-11 min-w-0 grow rounded-[18px] bg-surface px-4 text-sm text-ink placeholder:text-ink-muted"
          />
          <Button type="submit" kind="onTrack" disabled={busy || outOfTurns || question.trim().length < 3}>
            Ask
          </Button>
        </form>
      )}
      <p className="text-xs">The tutor is an AI and can be wrong. It never writes the whole solution: working it out is what makes it stick.</p>
    </section>
  );
}

/** A reply as Markdown, with no links, images or HTML: it comes from a model. */
function Reply({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 leading-relaxed [&_code]:rounded [&_code]:bg-sunken [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_pre]:overflow-x-auto [&_pre]:rounded-[12px] [&_pre]:bg-sunken [&_pre]:p-3">
      <ReactMarkdown allowedElements={['p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'pre', 'br']} unwrapDisallowed skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
