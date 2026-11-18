'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { minutesText, postInterview } from '@/components/interview/api';
import { useLearner } from '@/components/shell/hooks';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TrackCard, trackTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DEFAULT_LENGTH, PHASE_INFO, type Phase } from '@/interview/rules';
import type { PatternId } from '@/problems/patterns';
import { useProgressSnapshot } from '@/progress/hooks';
import { interviewPick, lastRound } from '@/progress/interviews';
import type { InterviewItem } from '@/progress/plan';
import type { InterviewStatus } from '@/server/interview';
import { loadProblemLanguage } from '@/workspace/storage';

// Today's mock interview card (REVAMP_PLAN.md 6f-3): resume an unfinished
// round, or start one on a pattern picked from the learner's own events
// (interviewPick: practised, but no round on it meets the bar yet), with the
// last round's result under it. Signed-in learners only, and only while
// interviews are on and a round is left today; an unfinished round still
// shows, since resuming it takes none. Rounds left and unfinished rounds come
// from the server (GET /api/interview), the rest from events.
// TODO(redesign): no board for this card; it follows the interview hub's
// coding-round card (sky) and Today's card sizes.

/** What Today needs from content for the card; null when interviews are off (read at build time, like the hub's switch). */
export type TodayInterviews = {
  /** Each problem's patterns, as the server's pattern filter reads them. */
  patterns: Record<string, readonly PatternId[]>;
  titles: Record<string, string>;
  patternTitles: Partial<Record<PatternId, string>>;
} | null;

type Status = { enabled: boolean; signedIn?: boolean } & Partial<InterviewStatus>;

export function InterviewCard({ data, planRound }: { data: TodayInterviews; planRound: InterviewItem | null }) {
  const learner = useLearner();
  const [status, setStatus] = useState<Status | null>(null);
  const signedIn = learner != null;
  const on = data != null && signedIn;

  useEffect(() => {
    if (!on) return;
    let live = true;
    fetch('/api/interview')
      .then((r) => r.json() as Promise<Status>)
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus({ enabled: false }));
    return () => {
      live = false;
    };
  }, [on]);

  if (!on || !status?.enabled || status.signedIn === false) return null;
  const open = status.open?.[0];
  const canStart = (status.roundsLeft ?? 0) > 0 && status.budget !== false;
  if (!open && !canStart) return null;
  return <RoundCard data={data} status={status} open={open} planRound={planRound} />;
}

function RoundCard({ data, status, open, planRound }: { data: NonNullable<TodayInterviews>; status: Status; open: InterviewStatus['open'][number] | undefined; planRound: InterviewItem | null }) {
  const router = useRouter();
  const { events } = useProgressSnapshot();
  const pick = useMemo(() => interviewPick(events, data.patterns), [events, data.patterns]);
  const last = useMemo(() => lastRound(events), [events]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; round?: string } | null>(null);
  const patternTitle = pick ? (data.patternTitles[pick.pattern] ?? pick.pattern) : null;

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await postInterview({ action: 'start', limit: DEFAULT_LENGTH, language: loadProblemLanguage() ?? 'python', ...(pick && { pattern: pick.pattern }) });
    if (!res.ok) {
      setBusy(false);
      setError({ message: res.message, round: res.round });
      return;
    }
    router.push(`/practice/interview/${res.body.round.id}`);
  };

  return (
    <TrackCard track="sky" aria-labelledby="interview-title" className="gap-4 rounded-[36px] p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="interview-title" className="text-base font-semibold">
          Mock interview
        </h2>
        <span className="text-[13px] font-semibold">
          {status.roundsLeft} of {status.roundsPerDay} {status.roundsPerDay === 1 ? 'round' : 'rounds'} left today
        </span>
      </div>
      {planRound && (
        <Chip tone={planRound.done ? 'good' : 'onTrack'} className="self-start">
          {planRound.done ? 'This week’s round is done' : 'In this week’s plan'}
        </Chip>
      )}
      {open ? (
        <>
          <div className="flex flex-col gap-1">
            <p className={`font-display text-[26px] leading-tight font-bold tracking-[-0.02em] ${trackTitle('sky')}`}>{open.title}</p>
            <p className="text-sm">Unfinished, in the {PHASE_INFO[open.phase as Phase]?.label.toLowerCase() ?? open.phase} phase. Pick it up where you left it.</p>
          </div>
          <ButtonLink href={`/practice/interview/${open.id}`} size="l" block trailing={<FiArrowRight aria-hidden />}>
            Resume the round
          </ButtonLink>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-eyebrow uppercase">{pick ? 'A round on' : 'A round on any pattern'}</span>
            <p className={`font-display text-[26px] leading-tight font-bold tracking-[-0.02em] ${trackTitle('sky')}`}>{patternTitle ?? 'Surprise me'}</p>
            <p className="text-sm">
              {pick
                ? `You’ve solved ${pick.solved} ${pick.solved === 1 ? 'problem' : 'problems'} in it, and no round on one meets the bar yet. ${minutesText(DEFAULT_LENGTH)}, on a problem you haven’t solved if there is one.`
                : `${minutesText(DEFAULT_LENGTH)} on a problem you haven’t solved: clarify, approach, code and test, then a debrief.`}
            </p>
          </div>
          {error && (
            <Alert tone="warn" role="alert" title={error.message}>
              {error.round && (
                <Link href={`/practice/interview/${error.round}`} className="font-semibold underline underline-offset-2">
                  Go back to it
                </Link>
              )}
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button size="l" onClick={() => void start()} disabled={busy} trailing={<FiArrowRight aria-hidden />}>
              Start the round
            </Button>
            <Link href="/practice/interview" className="py-2.5 text-sm font-semibold underline-offset-2 hover:underline">
              Choose the settings
            </Link>
          </div>
        </>
      )}
      {last && (
        <Link
          href="/practice/interview"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[20px] bg-surface px-4 py-3 text-sm text-ink hover:ring-1 hover:ring-line-strong hover:ring-inset"
        >
          <span className="text-ink-muted">Last round</span>
          <span className="font-semibold">{data.titles[last.item] ?? last.item}</span>
          <Chip tone={last.meetsBar ? 'good' : 'neutral'}>{last.meetsBar ? 'Meets the bar' : 'Not yet'}</Chip>
          <span className="ml-auto text-xs text-ink-muted">{new Date(last.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        </Link>
      )}
    </TrackCard>
  );
}
