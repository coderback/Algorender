'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { FiArrowRight, FiChevronLeft, FiTrash2 } from 'react-icons/fi';
import { Reply } from '@/components/tutor/TutorPanel';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, FeatureCard } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { cx } from '@/components/ui/cx';
import { ProgressBar } from '@/components/ui/Numbers';
import { DIMENSIONS, MODEL_DIMENSIONS, PHASE_INFO, SCORE_LABELS, dimensionLabel, hintCap, meetsBar, suggestedMinutes, type Score, type WorkPhase } from '@/interview/rules';
import { PROBLEM_LANGUAGES } from '@/problems/languages';
import { minutesText, postInterview, type RoundView } from './api';

/** What the debrief shows about the problem, rendered on the server. */
export type DebriefContent = {
  title: string;
  /** The authored approach, open now that the round has ended. */
  approach: ReactNode;
  complexity: { time: string; space: string };
  /** Where to practise: the pattern's lesson and visualiser, and a similar problem. */
  links: { href: string; label: string }[];
};

const WORK: WorkPhase[] = ['clarify', 'approach', 'code', 'test'];

/**
 * A round's debrief: the outcome and the time, a card per dimension (score,
 * evidence quotes, a line of feedback), time per phase against the
 * suggested, what to work on, and the problem's approach, open now. The
 * transcript stays to reread until the learner deletes it.
 */
export function Debrief({ round, content, onChange }: { round: RoundView; content: DebriefContent; onChange: (round: RoundView) => void }) {
  const d = round.debrief;
  const scores = d?.dimensions ?? [];
  const pending = round.scoredBy === 'pending';
  const bar = !pending && meetsBar(scores, round.hints, !!round.passed);
  const minutes = round.endedAt ? Math.round((Date.parse(round.endedAt) - Date.parse(round.startedAt)) / 60_000) : 0;
  const over = minutes - round.limit;
  const reviewDue = !pending && (!bar || round.hints >= 2);

  return (
    <>
      <header className="px-3 pt-3 sm:px-4">
        <div className="flex items-center gap-3 rounded-card bg-surface py-2.5 pr-3 pl-2.5 sm:gap-4">
          <Link
            href="/practice/interview"
            aria-label="Back to mock interviews"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sunken text-ink transition-colors duration-150 ease-standard hover:bg-line-soft"
          >
            <FiChevronLeft aria-hidden className="size-5" />
          </Link>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs text-ink-muted">Mock interview · Debrief</span>
            <h1 className="truncate text-base font-bold text-ink sm:text-[17px]">{content.title}</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-3 pt-4 pb-10 sm:px-4">
        <FeatureCard className="gap-4">
          <span className="text-eyebrow text-feature-muted uppercase">
            Coding round · {PROBLEM_LANGUAGES[round.language].label} · {round.limit} minutes
          </span>
          <p className="font-display text-title-page">{pending ? 'Score the rest yourself' : bar ? 'Meets the bar' : 'Not yet'}</p>
          <p className="text-[15px] text-feature-muted">
            Took {minutesText(minutes)} of {round.limit}
            {over > 0 ? ` (${minutesText(over)} over)` : ''}. {round.hints === 0 ? 'No hints.' : `Hints up to level ${round.hints}.`}{' '}
            {round.passed ? 'Every test passed at the end.' : 'The last submission didn’t pass every test.'}
            {round.repeat ? ' You’d solved this problem before this round.' : ''}
          </p>
          {d?.summary && <p className="max-w-[760px] text-[15px] leading-relaxed">{d.summary}</p>}
          {!pending && !bar && <p className="text-sm text-feature-muted">Meeting the bar takes a 3 or more on every dimension, every test passing, and no level-3 hint.</p>}
        </FeatureCard>

        {pending && <SelfScore round={round} onChange={onChange} />}
        {d?.withheld && (
          <Alert tone="warn" title="The written feedback is held back" role={null}>
            It gave too much of the solution away, so only the scores are shown. The approach below explains the solution.
          </Alert>
        )}

        <section aria-labelledby="dimensions-title" className="flex flex-col gap-3">
          <h2 id="dimensions-title" className="font-display text-title-section">
            Scores
          </h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {scores.map((s) => (
              <Card as="li" dense key={s.dimension}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-title-card font-bold">{dimensionLabel(s.dimension)}</h3>
                  <span className="text-sm font-semibold text-ink-soft">
                    {s.score} of 4 · {SCORE_LABELS[s.score]}
                  </span>
                </div>
                <ProgressBar value={s.score} max={4} label={`${dimensionLabel(s.dimension)}: ${s.score} of 4`} fill={s.score >= 3 ? 'bg-good' : 'bg-accent'} />
                {s.evidence.map((q, i) => (
                  <blockquote key={i} className="rounded-well bg-sunken px-3.5 py-2 text-sm text-ink-soft">
                    “{q}”
                  </blockquote>
                ))}
                {s.feedback && <p className="text-sm text-ink">{s.feedback}</p>}
                {s.dimension === 'approach' && round.hints > 0 && <p className="text-xs text-ink-muted">Capped at {hintCap(round.hints)} by the hints used.</p>}
                {s.dimension === 'analysis' && round.approach && (
                  <p className="text-xs text-ink-muted">
                    You said time {round.approach.time}, space {round.approach.space}. The best known: time {content.complexity.time}; space {content.complexity.space}.
                  </p>
                )}
              </Card>
            ))}
          </ul>
        </section>

        <Timeline round={round} />

        {(d?.workOn.length || content.links.length) && (
          <section aria-labelledby="work-title" className="flex flex-col gap-3">
            <h2 id="work-title" className="font-display text-title-section">
              What to work on
            </h2>
            {!!d?.workOn.length && (
              <ul className="flex flex-col gap-2">
                {d.workOn.map((w, i) => (
                  <li key={i} className="rounded-well bg-warn-soft px-4 py-3 text-sm text-warn-title">
                    <Reply text={w} />
                  </li>
                ))}
              </ul>
            )}
            {reviewDue && (
              <Alert tone="warn" role={null} title="This problem is in your review for tomorrow">
                Recalling it a day from now is what makes it stick.
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {content.links.map((l) => (
                <ButtonLink key={l.href} href={l.href} kind="secondary" size="s" trailing={<FiArrowRight aria-hidden />}>
                  {l.label}
                </ButtonLink>
              ))}
            </div>
          </section>
        )}

        <Card aria-labelledby="approach-title">
          <h2 id="approach-title" className="font-display text-title-section">
            The approach
          </h2>
          <div className="text-[15px] text-ink-soft">{content.approach}</div>
        </Card>

        <Transcript round={round} onChange={onChange} />

        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/practice/interview" kind="primary">
            Try another
          </ButtonLink>
          <ButtonLink href={`/practice/${round.item}`} kind="secondary">
            Practise this problem
          </ButtonLink>
        </div>
      </div>
    </>
  );
}

/** Time in each phase against the suggested, with the numbers in a table for screen readers. */
function Timeline({ round }: { round: RoundView }) {
  const suggested = suggestedMinutes(round.limit);
  const stamps = [...WORK, 'debrief' as const].map((p) => round.phases[p]);
  const spent = WORK.map((p, i) => {
    const from = stamps[i];
    const to = stamps.slice(i + 1).find(Boolean) ?? round.endedAt;
    return from && to ? Math.max(0, (Date.parse(to) - Date.parse(from)) / 60_000) : null;
  });
  const most = Math.max(1, ...spent.map((s) => s ?? 0), ...WORK.map((p) => suggested[p]));
  return (
    <Card aria-labelledby="timeline-title">
      <h2 id="timeline-title" className="font-display text-title-section">
        Time per phase
      </h2>
      <div aria-hidden className="flex flex-col gap-2.5">
        {WORK.map((p, i) => (
          <div key={p} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <span className="font-semibold text-ink">{PHASE_INFO[p].label}</span>
            <span className="relative h-3 rounded-full bg-sunken">
              <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${((spent[i] ?? 0) / most) * 100}%` }} />
              <span className="absolute inset-y-[-3px] w-0.5 rounded-full bg-ink" style={{ left: `${(suggested[p] / most) * 100}%` }} />
            </span>
            <span className="text-ink-soft tabular-nums">{spent[i] == null ? 'skipped' : `${Math.round(spent[i]!)} / ${suggested[p]} min`}</span>
          </div>
        ))}
      </div>
      <p aria-hidden className="text-xs text-ink-muted">
        Bars are the time you took; the line marks the time suggested.
      </p>
      <table className="sr-only">
        <caption>Minutes per phase, taken and suggested</caption>
        <thead>
          <tr>
            <th scope="col">Phase</th>
            <th scope="col">Taken</th>
            <th scope="col">Suggested</th>
          </tr>
        </thead>
        <tbody>
          {WORK.map((p, i) => (
            <tr key={p}>
              <th scope="row">{PHASE_INFO[p].label}</th>
              <td>{spent[i] == null ? 'skipped' : Math.round(spent[i]!)}</td>
              <td>{suggested[p]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** When the model couldn't score, the learner scores its dimensions against the rubric. */
function SelfScore({ round, onChange }: { round: RoundView; onChange: (round: RoundView) => void }) {
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = MODEL_DIMENSIONS.every((id) => scores[id]);
  return (
    <Card aria-labelledby="self-title">
      <h2 id="self-title" className="font-display text-title-section">
        Score your round
      </h2>
      <p className="text-sm text-ink-soft">The interviewer couldn’t score this round just now, so score these yourself against each rubric. Correctness is scored from your submissions already.</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!done || busy) return;
          setBusy(true);
          const res = await postInterview({ action: 'self', round: round.id, scores });
          setBusy(false);
          if (!res.ok) setError(res.message);
          else onChange(res.body.round);
        }}
      >
        {DIMENSIONS.filter((x) => x.by === 'model').map((x) => (
          <fieldset key={x.id} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-ink">{x.label}</legend>
            <p className="text-[13px] text-ink-soft">{x.rubric}</p>
            <div className="flex flex-wrap gap-2">
              {([1, 2, 3, 4] as Score[]).map((n) => (
                <label
                  key={n}
                  className={cx(
                    'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent',
                    scores[x.id] === n ? 'bg-primary text-on-primary' : 'bg-sunken text-ink',
                  )}
                >
                  <input type="radio" name={x.id} value={n} checked={scores[x.id] === n} onChange={() => setScores((s) => ({ ...s, [x.id]: n }))} className="sr-only" />
                  {n} · {SCORE_LABELS[n]}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {error && (
          <p role="alert" className="text-sm text-bad-ink">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!done || busy} className="self-start">
          Save my scores
        </Button>
      </form>
    </Card>
  );
}

/** The conversation, kept to reread until the learner deletes it. */
function Transcript({ round, onChange }: { round: RoundView; onChange: (round: RoundView) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (round.transcript.length === 0) {
    return <p className="px-1 text-sm text-ink-muted">The transcript of this round was deleted. The scores stay.</p>;
  }
  return (
    <Card aria-labelledby="transcript-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="transcript-title" className="font-display text-title-section">
          Transcript
        </h2>
        {confirm ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft">Delete what you wrote in this round? It can’t be undone.</span>
            <Button
              kind="danger"
              size="s"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await postInterview({ action: 'delete', round: round.id });
                setBusy(false);
                setConfirm(false);
                if (res.ok) onChange(res.body.round);
              }}
            >
              Delete it
            </Button>
            <Button kind="ghost" size="s" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </span>
        ) : (
          <Button kind="soft" size="s" icon={<FiTrash2 aria-hidden />} onClick={() => setConfirm(true)}>
            Delete the transcript
          </Button>
        )}
      </div>
      <details className="rounded-well bg-sunken">
        <summary className="cursor-pointer rounded-well px-4 py-3 text-sm font-semibold text-accent-ink">Reread the interview ({round.transcript.length} lines)</summary>
        <ol className="flex flex-col gap-2 px-4 pb-4">
          {round.transcript.map((t, i) => (
            <li key={i} className={cx('rounded-[16px] px-4 py-2.5 text-sm', t.role === 'interviewer' ? 'bg-surface text-ink' : 'ml-8 bg-primary whitespace-pre-wrap text-on-primary')}>
              <span className="mb-0.5 block text-xs font-semibold opacity-80">
                {t.role === 'interviewer' ? (t.level ? `Interviewer · hint ${t.level}` : 'Interviewer') : 'You'} · {PHASE_INFO[t.phase].label}
              </span>
              {t.role === 'interviewer' ? <Reply text={t.text} /> : t.text}
            </li>
          ))}
        </ol>
      </details>
      {round.edgeCases && (
        <p className="text-sm text-ink-soft">
          <span className="font-semibold text-ink">Cases you listed:</span> {round.edgeCases.split('\n').filter(Boolean).join('; ')}
        </p>
      )}
      <Chip className="self-start">Kept for you only; delete it any time</Chip>
    </Card>
  );
}
