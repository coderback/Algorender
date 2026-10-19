'use client';

import Link from 'next/link';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiCircle, FiEdit3, FiLoader, FiXCircle } from 'react-icons/fi';
import { useProgressSnapshot } from '@/progress/hooks';
import { mistakeAnchor } from './anchors';
import { useLessonSlug } from './LessonContext';
import { recordExplanation, recordMistake } from './progress';

type Verdict = 'yes' | 'partly' | 'no';
type Point = { verdict: Verdict; evidence: string; feedback: string };
type Result = { points: Point[]; feedback: string; mistake: { id: string; title: string } | null; by: 'self' | 'model' };
type Status = { enabled: boolean; signedIn?: boolean; turnsLeft?: number };

/** Fewer words than this isn't an explanation yet (the server checks it too). */
const MIN_WORDS = 8;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const draftKey = (lesson: string, id: string) => `algorender:explain:${lesson}:${id}`;

function loadDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function saveDraft(key: string, text: string) {
  try {
    if (text) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: the draft just isn't kept.
  }
}

const VERDICT = {
  yes: { label: 'Covered', icon: FiCheckCircle, className: 'text-good-ink' },
  partly: { label: 'Partly', icon: FiCircle, className: 'text-warn-ink' },
  no: { label: 'Missing', icon: FiXCircle, className: 'text-bad-ink' },
} as const;

/**
 * Explain it back (self-explanation): the learner explains the lesson's idea
 * in their own words, then sees how it measures up to the prompt's rubric.
 * Signed in, with the tutor switched on, the model scores each point and
 * says whether the explanation states one of the lesson's common mistakes;
 * otherwise the learner scores themselves against the points and an example
 * answer. Either way the score is an event that counts toward mastery; the
 * text stays on the device as a draft and is never stored.
 */
export function ExplainBack(props: Props) {
  // The draft lives in this browser's storage, so the editor waits for hydration.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated ? (
    <Explainer {...props} />
  ) : (
    <div className="not-prose rounded-xl border border-line bg-surface p-5">
      <p className="font-medium text-ink">{props.prompt}</p>
    </div>
  );
}

type Props = { id: string; prompt: string; rubric: string[]; example: string };

const noSubscribe = () => () => {};

function Explainer({ id, prompt, rubric, example }: Props) {
  const lesson = useLessonSlug();
  const fieldId = useId();
  const { ready, events } = useProgressSnapshot();
  const [text, setText] = useState(() => loadDraft(draftKey(lesson, id)));
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<'write' | 'self' | 'scored'>('write');
  const [self, setSelf] = useState<(Verdict | null)[]>(() => rubric.map(() => null));
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch('/api/explain')
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : { enabled: false }))
      .catch(() => ({ enabled: false }))
      .then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);

  const edit = (value: string) => {
    setText(value);
    saveDraft(draftKey(lesson, id), value);
  };

  const count = words(text);
  const enough = count >= MIN_WORDS;
  const canScore = !!status?.enabled && !!status.signedIn && (status.turnsLeft ?? 0) > 0;
  const last = ready ? events.findLast((e) => e.kind === 'explanation.scored' && e.data.lesson === lesson && e.data.prompt === id) : undefined;

  const finish = (r: Result) => {
    const covered = r.points.filter((p) => p.verdict === 'yes').length;
    const partly = r.points.filter((p) => p.verdict === 'partly').length;
    recordExplanation(lesson, id, { covered, partly, total: rubric.length }, r.by);
    if (r.mistake) recordMistake(lesson, r.mistake.id, 'explanation');
    setResult(r);
    setPhase('scored');
  };

  const score = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lesson, prompt: id, text }) });
      const body = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string; turnsLeft?: number };
      if (!res.ok || !body.points) {
        setError(body.error ?? 'Your explanation couldn’t be scored just now. Check it yourself against the points instead.');
        return;
      }
      setStatus((s) => (s ? { ...s, turnsLeft: body.turnsLeft } : s));
      finish({ points: body.points, feedback: body.feedback ?? '', mistake: body.mistake ?? null, by: 'model' });
    } catch {
      setError('Your explanation couldn’t be scored just now. Check it yourself against the points instead.');
    } finally {
      setBusy(false);
    }
  };

  const saveSelf = () => finish({ points: self.map((v) => ({ verdict: v ?? 'no', evidence: '', feedback: '' })), feedback: '', mistake: null, by: 'self' });

  const revise = () => {
    setPhase('write');
    setResult(null);
    setSelf(rubric.map(() => null));
  };

  return (
    <div className="not-prose space-y-4 rounded-xl border border-line bg-surface p-5">
      <div>
        {phase === 'write' ? (
          <label htmlFor={fieldId} className="block font-medium text-ink">
            {prompt}
          </label>
        ) : (
          <p className="font-medium text-ink">{prompt}</p>
        )}
        <p className="mt-1 text-sm text-ink-soft">
          Explain it in your own words, as if to a friend who missed the lesson. No peeking: writing it from memory is what makes it stick.
        </p>
        {last?.kind === 'explanation.scored' && phase === 'write' && (
          <p className="mt-1 text-xs text-ink-muted">
            Last time: {last.data.covered} of {last.data.total} points covered{last.data.partly ? `, ${last.data.partly} partly` : ''}.
          </p>
        )}
      </div>

      {phase === 'write' ? (
        <>
          <textarea
            id={fieldId}
            value={text}
            onChange={(e) => edit(e.target.value)}
            rows={5}
            maxLength={2000}
            className="w-full rounded-lg border border-line-strong bg-page p-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            placeholder="Start with what it does, then why it works…"
          />
          <div className="flex flex-wrap items-center gap-3">
            {canScore && (
              <button
                type="button"
                onClick={score}
                disabled={!enough || busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && <FiLoader aria-hidden className="animate-spin" />} Score my explanation
              </button>
            )}
            <button
              type="button"
              onClick={() => setPhase('self')}
              disabled={!enough || busy}
              className={
                canScore
                  ? 'text-sm text-accent-ink underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50'
                  : 'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              {canScore ? 'Check it myself instead' : 'Check it against the key points'}
            </button>
            <span className="text-xs text-ink-muted" aria-live="polite">
              {enough ? `${count} words` : `${count} of at least ${MIN_WORDS} words`}
            </span>
          </div>
          {status?.enabled && !status.signedIn && (
            <p className="text-xs text-ink-muted">
              <Link href={`/account?next=${encodeURIComponent(`/learn/${lesson}`)}`} className="text-accent-ink underline underline-offset-2">
                Sign in
              </Link>{' '}
              to have your explanation scored point by point.
            </p>
          )}
          {canScore && <p className="text-xs text-ink-muted">Scoring uses one of your {status?.turnsLeft} tutor turns left today. Your text isn’t stored.</p>}
          {error && (
            <p role="alert" className="text-sm text-bad-ink">
              {error}
            </p>
          )}
        </>
      ) : (
        <blockquote className="rounded-lg border-l-4 border-line bg-subtle px-4 py-2 text-sm whitespace-pre-wrap text-ink-soft">{text}</blockquote>
      )}

      {phase === 'self' && (
        <div className="space-y-3">
          <p className="text-sm text-ink">For each key point, did your explanation say it?</p>
          <ol className="space-y-2">
            {rubric.map((point, i) => (
              <li key={i}>
                <fieldset className="rounded-lg border border-line p-3">
                  <legend className="px-1 text-sm text-ink">{point}</legend>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {(['yes', 'partly', 'no'] as const).map((v) => (
                      <label key={v} className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
                        <input
                          type="radio"
                          name={`${fieldId}-point-${i}`}
                          checked={self[i] === v}
                          onChange={() => setSelf((s) => s.map((x, j) => (j === i ? v : x)))}
                          className="accent-[var(--color-accent)]"
                        />
                        {v === 'yes' ? 'Yes' : v === 'partly' ? 'Partly' : 'No'}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </li>
            ))}
          </ol>
          <Example example={example} open />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveSelf}
              disabled={self.some((v) => v === null)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save my score
            </button>
            <button type="button" onClick={revise} className="text-sm text-accent-ink underline-offset-2 hover:underline">
              Back to my explanation
            </button>
          </div>
        </div>
      )}

      {phase === 'scored' && result && (
        <div className="space-y-3" aria-live="polite">
          <p className="font-medium text-ink">
            {result.points.filter((p) => p.verdict === 'yes').length} of {rubric.length} key points covered
            {result.points.some((p) => p.verdict === 'partly') && `, ${result.points.filter((p) => p.verdict === 'partly').length} partly`}.
            <span className="ml-2 text-xs font-normal text-ink-muted">{result.by === 'model' ? 'Scored by the tutor model' : 'Scored by you'}</span>
          </p>
          <ul className="space-y-2">
            {rubric.map((point, i) => {
              const p = result.points[i];
              const v = VERDICT[p.verdict];
              return (
                <li key={i} className="flex gap-2 text-sm">
                  <v.icon aria-hidden className={`mt-0.5 shrink-0 ${v.className}`} />
                  <span>
                    <span className={`font-medium ${v.className}`}>{v.label}: </span>
                    <span className="text-ink">{point}</span>
                    {p.evidence && <span className="block text-ink-muted">You wrote: “{p.evidence}”</span>}
                    {p.feedback && <span className="block text-ink-soft">{p.feedback}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {result.feedback && <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-ink">{result.feedback}</p>}
          {result.mistake && (
            <p className="flex gap-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-ink">
              <FiAlertTriangle aria-hidden className="mt-0.5 shrink-0 text-warn-ink" />
              <span>
                Your explanation says something the lesson lists as a common mistake:{' '}
                <a href={`#${mistakeAnchor(result.mistake.id)}`} className="font-medium text-warn-ink underline underline-offset-2">
                  {result.mistake.title}
                </a>
                . It will come back in your daily review.
              </span>
            </p>
          )}
          {result.by === 'model' && <Example example={example} />}
          <button type="button" onClick={revise} className="inline-flex items-center gap-1.5 text-sm text-accent-ink underline-offset-2 hover:underline">
            <FiEdit3 aria-hidden /> Revise it and check again
          </button>
        </div>
      )}
    </div>
  );
}

function Example({ example, open = false }: { example: string; open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-line-soft bg-subtle px-4 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-ink">An example answer</summary>
      <p className="mt-2 text-ink-soft">{example}</p>
    </details>
  );
}
