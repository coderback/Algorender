'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { FiClock } from 'react-icons/fi';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { ANNOUNCE_AT, edgeCaseList, nextPhase, PHASE_INFO, PHASES, type Phase, type WorkPhase } from '@/interview/rules';
import type { ProblemSpec } from '@/problems/judge';
import { ProblemWorkspace, type ProblemHeading } from '@/problems/ui/ProblemWorkspace';
import type { ServerAnswer } from '@/problems/ui/serverJudge';
import { loadCode } from '@/workspace/storage';
import { clockText, postInterview, type RoundView } from './api';
import { Debrief, type DebriefContent } from './Debrief';
import { InterviewerPanel } from './InterviewerPanel';

// A mock interview round's page (REVAMP_PLAN.md 6f): the practice workspace
// under interview conditions, with the phases, the clock and End in a bar
// under the header, and the interviewer in the right column; once the round
// has ended, its debrief. The server owns the round: every action posts to
// /api/interview and the page shows the round that comes back.

export function InterviewRound({
  initial,
  spec,
  heading,
  problem,
  debrief,
}: {
  initial: RoundView;
  spec: ProblemSpec;
  heading: ProblemHeading;
  /** The statement pane, rendered on the server. */
  problem: ReactNode;
  debrief: DebriefContent;
}) {
  const [round, setRound] = useState(initial);
  /** The server's clock minus this device's, so the timer follows the server. */
  const [skew, setSkew] = useState(() => Date.parse(initial.now) - Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState(initial.edgeCases);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const slot = `interview:${round.id}`;

  const accept = (r: RoundView) => {
    setSkew(Date.parse(r.now) - Date.now());
    setRound(r);
  };

  /** Posts an action; true when the round came back. */
  const act = async (body: Record<string, unknown>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const res = await postInterview({ round: round.id, ...body });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return false;
    }
    accept(res.body.round);
    return true;
  };

  /** The code as it stands: the editor saves it on this device as it changes. */
  const currentCode = () => loadCode(slot, round.language) ?? undefined;

  if (round.phase === 'debrief') {
    return <Debrief round={round} content={debrief} onChange={accept} />;
  }

  const phase = round.phase as WorkPhase;
  const coding = phase === 'code' || phase === 'test';
  const listed = edgeCaseList(cases).length > 0;
  const end = () => {
    setConfirmEnd(false);
    void act({ action: 'end', code: currentCode() });
  };

  const bar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-surface px-3 py-2.5">
      <PhaseStrip current={round.phase} />
      <Clock round={round} skew={skew} />
      <span className="ml-auto flex items-center gap-2">
        {confirmEnd ? (
          <>
            <span className="text-sm text-ink-soft">End the interview now?</span>
            <Button kind="danger" size="s" onClick={end} disabled={busy}>
              End it
            </Button>
            <Button kind="ghost" size="s" onClick={() => setConfirmEnd(false)}>
              Keep going
            </Button>
          </>
        ) : (
          <Button kind="ghost" size="s" onClick={() => setConfirmEnd(true)} disabled={busy}>
            End interview
          </Button>
        )}
      </span>
      {busy && round.phase === 'test' && (
        <span role="status" className="sr-only">
          Working…
        </span>
      )}
    </div>
  );

  const submitResults = async (code: string, tests: number, failed: number) => {
    await act({ action: 'submit', code, cases, results: { tests, failed } });
  };

  const submitOnServer = async (code: string): Promise<ServerAnswer> => {
    setBusy(true);
    setError(null);
    const res = await postInterview({ action: 'submit', round: round.id, code, cases });
    setBusy(false);
    if (!res.ok) return { ok: false, status: res.status, message: res.message };
    accept(res.body.round);
    if (!res.body.judge) return { ok: false, status: 500, message: 'The judge didn’t answer.' };
    return { ok: true, body: res.body.judge };
  };

  return (
    <ProblemWorkspace
      spec={spec}
      heading={heading}
      statement={{ problem }}
      interview={{
        slot,
        language: round.language,
        back: { href: '/practice/interview', label: 'Back to mock interviews (the round keeps going)' },
        bar,
        canEdit: coding,
        canRun: coding,
        canSubmit: phase === 'test' && listed && !busy,
        submitHint: phase !== 'test' ? 'Submitting opens in the Test phase' : 'List the cases you’d test first',
        onSubmitted: (code, tests, failed) => void submitResults(code, tests, failed),
        submitOnServer,
        side: (code, point) => (
          <InterviewerPanel
            key={round.phase}
            round={round}
            busy={busy}
            error={error}
            cases={cases}
            onCases={setCases}
            onPoint={point}
            actions={{
              say: (text) => act({ action: 'say', text, ...(coding && { code }) }),
              approach: (text, time, space) => act({ action: 'approach', text, time, space }),
              hint: (account) => act({ action: 'hint', account, ...(coding && { code }) }),
              next: () => {
                const to = nextPhase(round.phase);
                if (to && to !== 'debrief') void act({ action: 'phase', to, ...(coding && { code }) });
              },
              end: () => void act({ action: 'end', code }),
            }}
          />
        ),
      }}
    />
  );
}

/** The phases as a read-only strip: done, current (aria-current) and to come. */
function PhaseStrip({ current }: { current: Phase }) {
  const at = PHASES.indexOf(current);
  return (
    <ol aria-label="Interview phases" className="flex min-w-0 gap-0.5 overflow-x-auto rounded-full bg-sunken p-[3px]">
      {PHASES.map((p, i) => (
        <li
          key={p}
          aria-current={p === current ? 'step' : undefined}
          className={cx(
            'shrink-0 rounded-full px-3 py-1.5 text-[13px] whitespace-nowrap',
            p === current ? 'bg-segment font-semibold text-ink shadow-segment' : i < at ? 'font-medium text-ink-soft' : 'font-medium text-ink-muted',
          )}
        >
          {PHASE_INFO[p].label}
          {i < at && <span className="sr-only"> (done)</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * The round's clock, from the server's start time. It ticks silently; only
 * five and one minutes left, and the time running out, are announced. Past
 * the limit the learner may finish, and the overtime shows.
 */
const noSubscribe = () => () => {};

function Clock({ round, skew }: { round: RoundView; skew: number }) {
  // The server renders no time: the page's own clock takes over once it runs.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = now + skew - Date.parse(round.startedAt);
  const left = round.limit * 60_000 - elapsed;
  const over = left < 0;
  const mark = ANNOUNCE_AT.find((m) => left <= m * 60_000 && left > (m - 1) * 60_000);
  const announcement = mark ? `${mark} minute${mark === 1 ? '' : 's'} left` : over && left > -60_000 ? 'Time is up. You can still finish; the overtime is noted.' : '';
  return (
    <span className={cx('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tabular-nums', hydrated && over ? 'bg-warn-soft text-warn-ink' : 'bg-sunken text-ink')}>
      <FiClock aria-hidden />
      <span>
        {hydrated ? clockText(elapsed) : '--:--'} <span className="font-normal text-ink-muted">of {round.limit}:00</span>
      </span>
      {hydrated && over && <span className="font-normal">· {Math.ceil(-left / 60_000)} min over</span>}
      <span role="status" className="sr-only">
        {hydrated ? announcement : ''}
      </span>
    </span>
  );
}
