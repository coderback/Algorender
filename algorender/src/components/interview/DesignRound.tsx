'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { FiChevronLeft, FiLayers } from 'react-icons/fi';
import { DesignCanvas, type ServerCheck } from '@/components/design/DesignCanvas';
import { compact, pct, targetList } from '@/components/design/format';
import { loadSaved, save } from '@/components/design/url';
import { Card } from '@/components/ui/Card';
import { MAX_CHECKS, type PublicVariant } from '@/interview/design';
import { nextPhase, type DesignWorkPhase } from '@/interview/rules';
import type { CaseStudy, Design } from '@/systems/design/types';
import { postInterview, type RoundView } from './api';
import { Debrief, type DebriefContent } from './Debrief';
import { InterviewerPanel } from './InterviewerPanel';
import { RoundBar } from './InterviewRound';

// A system-design round's page (REVAMP_PLAN.md 6f-2): the brief on the left
// (the traffic the simulator runs appears once the estimates are in), the
// canvas under it from the Design phase on, and the interviewer on the right.
// The server keeps the round, the design included: every action posts the
// design as it stands, every check runs there, and the page shows the round
// that comes back. A draft of the design is also kept on this device, so a
// reload doesn't lose edits made since the last action.

const noSubscribe = () => () => {};

export function DesignRound({ initial, variant, brief, debrief }: { initial: RoundView; variant: PublicVariant; brief: ReactNode; debrief: DebriefContent }) {
  const router = useRouter();
  const [round, setRound] = useState(initial);
  const [skew, setSkew] = useState(() => Date.parse(initial.now) - Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const draftKey = `interview:${initial.id}`;
  const serverDesign = initial.design ?? variant.start;
  // Once hydrated, a draft on this device wins: it is at least as new as the server's copy.
  const start = hydrated ? (loadSaved(draftKey) ?? serverDesign) : serverDesign;
  const design = useRef<Design | null>(null);
  const current = () => design.current ?? start;
  // The canvas works on a case study; a round's has no reference or hints to show.
  const study: CaseStudy = { ...variant, reference: variant.start, hints: [] };

  const accept = (r: RoundView) => {
    setSkew(Date.parse(r.now) - Date.now());
    // What passes (the trade-off, a design that meets the targets, the estimates' answers) is rendered on the server once the round has ended.
    if (r.phase === 'debrief' && round.phase !== 'debrief') {
      save(draftKey, null);
      router.refresh();
    }
    setRound(r);
  };

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

  if (round.phase === 'debrief') return <Debrief round={round} content={debrief} onChange={accept} />;

  const phase = round.phase as DesignWorkPhase;
  const designing = phase === 'design' || phase === 'deepdive';

  const check = async (d: Design): Promise<ServerCheck | string> => {
    setBusy(true);
    setError(null);
    const res = await postInterview({ action: 'check', round: round.id, design: d });
    setBusy(false);
    if (!res.ok) return res.message;
    accept(res.body.round);
    return res.body.check ?? 'The check didn’t come back. Try again in a moment.';
  };

  return (
    <>
      <header className="flex flex-col gap-2 px-3 pt-3 sm:px-4">
        <div className="flex items-center gap-3 rounded-card bg-surface py-2.5 pr-3 pl-2.5 sm:gap-4">
          <Link
            href="/practice/interview"
            aria-label="Back to mock interviews (the round keeps going)"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sunken text-ink transition-colors duration-150 ease-standard hover:bg-line-soft"
          >
            <FiChevronLeft aria-hidden className="size-5" />
          </Link>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs text-ink-muted">Mock interview · System design · {round.limit} minutes</span>
            <h1 className="truncate text-base font-bold text-ink sm:text-[17px]">{variant.title}</h1>
          </div>
        </div>
        <RoundBar round={round} skew={skew} busy={busy} working={busy} onEnd={() => void act({ action: 'end', design: current() })} />
      </header>

      <div className="grid grid-cols-1 items-start gap-4 px-3 pt-4 pb-10 sm:px-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <Brief variant={variant} brief={brief} showTraffic={designing} />
        <div className="min-w-0 xl:sticky xl:top-4 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <InterviewerPanel
            key={round.phase}
            round={round}
            busy={busy}
            error={error}
            cases=""
            onCases={() => {}}
            onPoint={() => {}}
            estimates={variant.estimates}
            actions={{
              say: (text) => act({ action: 'say', text, ...(designing && { design: current() }) }),
              approach: async () => false,
              estimate: (answers) => act({ action: 'estimate', answers }),
              explain: (text) => act({ action: 'explain', text, design: current() }),
              hint: (account) => act({ action: 'hint', account, ...(designing && { design: current() }) }),
              next: () => {
                const to = nextPhase(round.phase);
                if (to && to !== 'debrief') void act({ action: 'phase', to, ...(designing && { design: current() }) });
              },
              end: () => void act({ action: 'end', design: current() }),
            }}
          />
        </div>
        <div className="min-w-0 xl:col-start-1">
          {designing ? (
            <section aria-labelledby="canvas-title" className="flex flex-col gap-3">
              <h2 id="canvas-title" className="sr-only">
                Your design
              </h2>
              <DesignCanvas
                initial={start}
                study={study}
                variant="interview"
                interview={{
                  check,
                  onChange: (d) => {
                    design.current = d;
                    save(draftKey, d);
                  },
                  checksLeft: round.checksLeft,
                  maxChecks: MAX_CHECKS,
                  deepLabel: round.deepDive?.label ?? null,
                }}
              />
            </section>
          ) : (
            <Card aria-labelledby="canvas-later" className="items-start">
              <FiLayers aria-hidden className="size-6 text-ink-muted" />
              <h2 id="canvas-later" className="text-title-card font-bold">
                The canvas opens in the Design phase
              </h2>
              <p className="text-sm text-ink-soft">First the requirements, then your estimates of what the system has to handle. Then you build it, and check it against the targets.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/** The variant's brief: the story, the requirements, the targets, and the traffic once the estimates are in. */
function Brief({ variant, brief, showTraffic }: { variant: PublicVariant; brief: ReactNode; showTraffic: boolean }) {
  const w = variant.workload;
  return (
    <Card as="article" aria-labelledby="brief-title" className="min-w-0 gap-4 xl:col-start-1">
      <h2 id="brief-title" className="font-display text-title-section">
        The brief
      </h2>
      <div className="text-[15px] leading-relaxed text-ink [&_a]:font-semibold [&_a]:underline">{brief}</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section aria-labelledby="requirements-title" className="flex flex-col gap-1.5 rounded-well bg-sunken p-4">
          <h3 id="requirements-title" className="text-sm font-semibold text-ink">
            Requirements
          </h3>
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-ink-soft">
            {variant.requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="targets-title" className="flex flex-col gap-1.5 rounded-well bg-sunken p-4">
          <h3 id="targets-title" className="text-sm font-semibold text-ink">
            Targets
          </h3>
          <ul className="flex flex-col gap-0.5 text-sm text-ink-soft">
            {targetList(variant.targets, { plain: true }).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      </div>
      <section aria-labelledby="traffic-title" className="flex flex-col gap-1 rounded-well bg-sunken p-4 text-sm text-ink-soft">
        <h3 id="traffic-title" className="font-semibold text-ink">
          The traffic you’ll design for
        </h3>
        {showTraffic ? (
          <>
            <p>
              {compact(w.rps)} requests a second, {pct(w.readShare)} reads
            </p>
            <p>
              {compact(w.keys)} distinct keys, {w.skew === 0 ? 'all equally popular' : w.skew >= 0.8 ? 'a few of them very hot' : 'some hotter than others'}
            </p>
            {w.spike && (
              <p>
                A surge to {w.spike.factor}× for {w.spike.seconds} s from {w.spike.at} s
              </p>
            )}
          </>
        ) : (
          <p>Shown once you’ve given the interviewer your estimates.</p>
        )}
      </section>
    </Card>
  );
}
