'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FiArrowRight, FiShuffle } from 'react-icons/fi';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, TrackCard } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SelectField } from '@/components/ui/Field';
import { CountTile } from '@/components/ui/Numbers';
import { Segmented } from '@/components/ui/Segmented';
import { DEFAULT_LENGTH, LENGTHS, PHASE_INFO, PHASES, dimensionLabel, meetsBar, suggestedMinutes, workPhasesOf, type RoundLength, type RoundPhase } from '@/interview/rules';
import { authClient } from '@/lib/auth-client';
import { PROBLEM_LANGUAGE_IDS, PROBLEM_LANGUAGES, type ProblemLanguage } from '@/problems/languages';
import { loadProblemLanguage } from '@/workspace/storage';
import type { InterviewStatus } from '@/server/interview';
import { minutesText, postInterview } from './api';

// The mock interviews hub (/practice/interview): start a coding round (its
// length, level, pattern and language, or "surprise me") or a system-design
// round (its length and case study), resume one in progress, and reread
// past rounds' debriefs. Signed-in learners only.
// TODO(billing): free to signed-in learners until billing exists.

type Status = { enabled: boolean; signedIn?: boolean } & Partial<InterviewStatus>;

export function InterviewHub({
  enabled,
  patterns,
  problems,
  cases,
}: {
  enabled: boolean;
  patterns: { id: string; title: string }[];
  problems: number;
  /** The case studies a design round can be on, and how many interview briefs each has. */
  cases: { slug: string; title: string; variants: number }[];
}) {
  const session = authClient.useSession();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [length, setLength] = useState<RoundLength>(DEFAULT_LENGTH);
  const [level, setLevel] = useState('');
  const [pattern, setPattern] = useState('');
  const [language, setLanguage] = useState<ProblemLanguage>(() => loadProblemLanguage() ?? 'python');
  const [designLength, setDesignLength] = useState<RoundLength>(DEFAULT_LENGTH);
  const [study, setStudy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; round?: string } | null>(null);
  const signedIn = session.data != null;

  useEffect(() => {
    if (!enabled || !signedIn) return;
    let live = true;
    fetch('/api/interview')
      .then((r) => r.json() as Promise<Status>)
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus({ enabled: true }));
    return () => {
      live = false;
    };
  }, [enabled, signedIn]);

  if (!enabled) {
    return <Alert tone="warn" role={null} title="Mock interviews aren’t switched on here." />;
  }
  if (session.isPending) return null;
  if (!signedIn) {
    return (
      <TrackCard track="lilac" className="max-w-2xl">
        <h2 className="text-title-card font-bold text-track-lilac-title">Sign in to take a mock interview</h2>
        <p className="text-sm">The interviewer runs on our server, so a round needs an account. Practice problems stay open to everyone.</p>
        <ButtonLink href={`/account?next=${encodeURIComponent('/practice/interview')}`} kind="onTrack" className="self-start" trailing={<FiArrowRight aria-hidden />}>
          Sign in or create an account
        </ButtonLink>
      </TrackCard>
    );
  }

  const begin = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await postInterview({ action: 'start', ...body });
    if (!res.ok) {
      setBusy(false);
      setError({ message: res.message, round: res.round });
      return;
    }
    router.push(`/practice/interview/${res.body.round.id}`);
  };
  const start = (surprise: boolean) => begin({ limit: length, language, ...(!surprise && level && { level }), ...(!surprise && pattern && { pattern }) });
  const startDesign = () => begin({ format: 'design', limit: designLength, ...(study && { study }) });
  const designSuggested = suggestedMinutes(designLength, 'design');
  const briefs = cases.reduce((n, c) => n + c.variants, 0);

  const left = status?.roundsLeft;
  const suggested = suggestedMinutes(length);
  const out = left === 0 || status?.budget === false;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TrackCard track="sky" aria-labelledby="coding-title" className="gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="coding-title" className="text-title-card font-bold text-track-sky-title">
                Coding round
              </h2>
              <p className="max-w-[560px] text-sm">
                One of {problems} practice problems, one you haven’t solved if there is one. Hints, the pattern and the visualisers stay hidden until the debrief; your own test
                stays.
              </p>
            </div>
            <CountTile value={left ?? '–'} label={`of ${status?.roundsPerDay ?? 2} rounds left today`} className="min-w-[120px] bg-surface" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Length</span>
            <Segmented
              label="Length"
              size="m"
              value={String(length) as `${RoundLength}`}
              onChange={(v) => setLength(Number(v) as RoundLength)}
              options={LENGTHS.map((n) => ({ value: String(n) as `${RoundLength}`, label: `${n} min` }))}
            />
            <p className="text-xs">
              {(['clarify', 'approach', 'code', 'test'] as const).map((p) => `${PHASE_INFO[p].label} ${suggested[p]}`).join(' · ')} minutes, suggested.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SelectField label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Any</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </SelectField>
            <SelectField label="Pattern" value={pattern} onChange={(e) => setPattern(e.target.value)}>
              <option value="">Any</option>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </SelectField>
            <SelectField label="Language" value={language} onChange={(e) => setLanguage(e.target.value as ProblemLanguage)}>
              {PROBLEM_LANGUAGE_IDS.map((l) => (
                <option key={l} value={l}>
                  {PROBLEM_LANGUAGES[l].label}
                </option>
              ))}
            </SelectField>
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
          {status?.budget === false && left !== 0 && <Alert tone="warn" role={null} title="Mock interviews have reached today’s budget and will be back tomorrow." />}
          <div className="flex flex-wrap gap-2">
            <Button kind="primary" onClick={() => void start(false)} disabled={busy || !status || out}>
              Start interview
            </Button>
            <Button kind="onTrack" icon={<FiShuffle aria-hidden />} onClick={() => void start(true)} disabled={busy || !status || out}>
              Surprise me
            </Button>
          </div>
        </TrackCard>
        <TrackCard track="peach" aria-labelledby="design-title" className="gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="design-title" className="text-title-card font-bold text-track-peach-title">
              System-design round
            </h2>
            <p className="text-sm">
              Requirements, estimates, a design on the canvas checked by the simulator, then a deep dive into a failure. One of {briefs} interview briefs, each a new story on a
              case study, so a case you’ve passed doesn’t give the answer away.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Length</span>
            <Segmented
              label="Design round length"
              size="m"
              value={String(designLength) as `${RoundLength}`}
              onChange={(v) => setDesignLength(Number(v) as RoundLength)}
              options={LENGTHS.map((n) => ({ value: String(n) as `${RoundLength}`, label: `${n} min` }))}
            />
            <p className="text-xs">
              {workPhasesOf('design')
                .map((p) => `${PHASE_INFO[p].label} ${designSuggested[p]}`)
                .join(' · ')}{' '}
              minutes, suggested.
            </p>
          </div>
          <SelectField label="Case study" value={study} onChange={(e) => setStudy(e.target.value)}>
            <option value="">Any</option>
            {cases.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </SelectField>
          <Button kind="onTrack" className="self-start" onClick={() => void startDesign()} disabled={busy || !status || out}>
            Start design round
          </Button>
        </TrackCard>
      </div>

      {status?.open && status.open.length > 0 && (
        <Card aria-labelledby="open-title">
          <h2 id="open-title" className="font-display text-title-section">
            In progress
          </h2>
          <ul className="flex flex-col gap-2">
            {status.open.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-well bg-sunken px-4 py-3 text-sm">
                <span>
                  <span className="font-semibold text-ink">{r.title}</span> <span className="text-ink-soft">· {PHASE_INFO[r.phase as RoundPhase].label} phase</span>
                </span>
                <ButtonLink href={`/practice/interview/${r.id}`} kind="secondary" size="s">
                  Resume
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-labelledby="past-title">
        <h2 id="past-title" className="font-display text-title-section">
          Past rounds
        </h2>
        {!status?.recent?.length ? (
          <p className="text-sm text-ink-soft">
            Your rounds show here with their scores, and the debrief stays to reread. Each round goes {PHASES.filter((p) => p !== 'debrief')
              .map((p) => PHASE_INFO[p].label.toLowerCase())
              .join(', ')}
            , then a debrief.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {status.recent.map((r) => {
              const bar = r.scoredBy !== 'pending' && meetsBar(r.scores, r.hints, r.passed);
              return (
                <li key={r.id}>
                  <Link href={`/practice/interview/${r.id}`} className="flex flex-col gap-2 rounded-well bg-sunken px-4 py-3 text-sm transition-colors duration-150 ease-standard hover:bg-line-soft">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{r.title}</span>
                      <Chip tone={r.scoredBy === 'pending' ? 'warn' : bar ? 'good' : 'neutral'}>{r.scoredBy === 'pending' ? 'To score' : bar ? 'Meets the bar' : 'Not yet'}</Chip>
                      <span className="text-ink-soft">
                        {r.language ? PROBLEM_LANGUAGES[r.language].label : 'System design'} · {minutesText(r.minutes)} of {r.limit} ·{' '}
                        {new Date(r.endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {r.scores.map((s) => (
                        <Chip key={s.dimension} tone={s.score >= 3 ? 'good' : 'neutral'} className="bg-surface">
                          {dimensionLabel(s.dimension)} {s.score}
                        </Chip>
                      ))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
