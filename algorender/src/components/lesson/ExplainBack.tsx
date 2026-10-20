'use client';

import Link from 'next/link';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { FiAlertTriangle, FiEdit3, FiLoader, FiZap } from 'react-icons/fi';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
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
  yes: { label: 'Covered', chip: 'bg-good-soft text-good-ink' },
  partly: { label: 'Partly', chip: 'bg-warn-soft text-warn-ink' },
  no: { label: 'Missing', chip: 'bg-bad-soft text-bad-ink' },
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
    <div className="not-prose rounded-[28px] bg-track-lilac p-4 sm:p-5">
      <p className="rounded-tile bg-surface p-5 text-[15px] font-semibold text-ink">{props.prompt}</p>
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
    <div className="not-prose flex flex-col gap-3 rounded-[28px] bg-track-lilac p-4 text-track-lilac-ink sm:p-5">
      {canScore && phase === 'write' && (
        <p className="self-end px-1 text-xs font-semibold">
          Uses 1 of {status?.turnsLeft} tutor {status?.turnsLeft === 1 ? 'turn' : 'turns'} left today
        </p>
      )}
      <div className="flex flex-col gap-4 rounded-tile bg-surface p-5 text-ink">
        <div className="flex flex-col gap-1">
          {phase === 'write' ? (
            <label htmlFor={fieldId} className="text-[15px] font-semibold">
              {prompt}
            </label>
          ) : (
            <p className="text-[15px] font-semibold">{prompt}</p>
          )}
          <p className="text-[13px] text-ink-muted">Explain it in your own words, as if to a friend who missed the lesson. No peeking: writing it from memory is what makes it stick.</p>
          {last?.kind === 'explanation.scored' && phase === 'write' && (
            <p className="text-xs text-ink-muted">
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
              className="min-h-32 w-full rounded-[16px] bg-sunken p-4 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted"
              placeholder="Start with what it does, then why it works…"
            />
            <div className="flex flex-wrap items-center gap-3">
              {canScore && (
                <Button onClick={score} disabled={!enough || busy} icon={busy ? <FiLoader aria-hidden className="animate-spin" /> : undefined}>
                  Score my explanation
                </Button>
              )}
              {canScore ? (
                <button
                  type="button"
                  onClick={() => setPhase('self')}
                  disabled={!enough || busy}
                  className="rounded-full px-1 py-1 text-sm font-semibold text-accent-ink underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Check it myself instead
                </button>
              ) : (
                <Button onClick={() => setPhase('self')} disabled={!enough || busy}>
                  Check it against the key points
                </Button>
              )}
              <span className="ml-auto text-xs text-ink-muted" aria-live="polite">
                {enough ? `${count} words` : `${count} of at least ${MIN_WORDS} words`} · draft saved on this device
              </span>
            </div>
            {status?.enabled && !status.signedIn && (
              <p className="text-xs text-ink-muted">
                <Link href={`/account?next=${encodeURIComponent(`/learn/${lesson}`)}`} className="font-semibold text-accent-ink underline underline-offset-2">
                  Sign in
                </Link>{' '}
                to have your explanation scored point by point.
              </p>
            )}
            {canScore && <p className="text-xs text-ink-muted">Your text isn’t stored.</p>}
            {error && (
              <p role="alert" className="rounded-well bg-bad-soft px-4 py-3 text-sm text-bad-title">
                {error}
              </p>
            )}
          </>
        ) : (
          <blockquote className="rounded-[16px] bg-sunken px-4 py-3 text-sm whitespace-pre-wrap text-ink-soft">{text}</blockquote>
        )}
      </div>

      {phase === 'self' && (
        <div className="flex flex-col gap-3 rounded-tile bg-surface p-5 text-ink">
          <div>
            <p className="text-base font-semibold">Checking it yourself</p>
            <p className="text-sm text-ink-muted">For each key point, did your explanation say it?</p>
          </div>
          <ol className="flex flex-col gap-2">
            {rubric.map((point, i) => (
              <li key={i}>
                <fieldset className="rounded-[18px] bg-sunken p-3.5">
                  <legend className="float-left mb-2 w-full text-sm font-medium">{point}</legend>
                  <div className="clear-both flex flex-wrap gap-1.5">
                    {(['yes', 'partly', 'no'] as const).map((v) => (
                      <label
                        key={v}
                        className={cx(
                          'inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold',
                          self[i] === v ? 'bg-surface text-ink shadow-segment' : 'text-ink-soft hover:text-ink',
                        )}
                      >
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
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveSelf} disabled={self.some((v) => v === null)}>
              Save my score
            </Button>
            <button type="button" onClick={revise} className="rounded-full px-1 py-1 text-sm font-semibold text-accent-ink underline underline-offset-4">
              Back to my explanation
            </button>
          </div>
        </div>
      )}

      {phase === 'scored' && result && (
        <div className="flex flex-col gap-3 rounded-tile bg-surface p-5 text-ink" aria-live="polite">
          <p className="text-base font-semibold">
            {result.points.filter((p) => p.verdict === 'yes').length} of {rubric.length} key points covered
            {result.points.some((p) => p.verdict === 'partly') && `, ${result.points.filter((p) => p.verdict === 'partly').length} partly`}.
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 align-middle text-xs font-semibold text-accent-ink">
              {result.by === 'model' && <FiZap aria-hidden className="size-3" />}
              {result.by === 'model' ? 'Scored by the tutor model' : 'Scored by you'}
            </span>
          </p>
          <ul className="flex flex-col gap-2">
            {rubric.map((point, i) => {
              const p = result.points[i];
              const v = VERDICT[p.verdict];
              return (
                <li key={i} className="flex items-start gap-3 rounded-[18px] bg-sunken px-3.5 py-3 text-sm">
                  <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', v.chip)}>{v.label}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold">{point}</span>
                    {p.evidence && <span className="text-ink-muted">You wrote: “{p.evidence}”</span>}
                    {p.feedback && <span className="text-ink-soft">{p.feedback}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {result.feedback && <p className="rounded-[16px] bg-sunken px-4 py-3 text-sm">{result.feedback}</p>}
          {result.mistake && (
            <p className="flex gap-2 rounded-[18px] bg-warn-soft px-4 py-3 text-sm text-warn-title">
              <FiAlertTriangle aria-hidden className="mt-0.5 shrink-0 text-warn-ink" />
              <span>
                <strong>Your explanation says something the lesson lists as a common mistake:</strong>{' '}
                <a href={`#${mistakeAnchor(result.mistake.id)}`} className="font-semibold underline underline-offset-2">
                  {result.mistake.title}
                </a>
                . It will come back in your daily review.
              </span>
            </p>
          )}
          {result.by === 'model' && <Example example={example} />}
          <Button onClick={revise} icon={<FiEdit3 aria-hidden />} className="self-start">
            Revise it and check again
          </Button>
        </div>
      )}
    </div>
  );
}

function Example({ example, open = false }: { example: string; open?: boolean }) {
  return (
    <details open={open} className="rounded-[16px] bg-sunken px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-accent-ink">An example answer</summary>
      <p className="mt-2 text-ink-soft">{example}</p>
    </details>
  );
}
