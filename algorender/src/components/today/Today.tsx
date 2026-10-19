'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { useMemo, type ReactNode } from 'react';
import { FiArrowRight, FiBookOpen, FiCheck, FiCode, FiFlag, FiPlay } from 'react-icons/fi';
import { mistakeAnchor } from '@/components/lesson/anchors';
import { conceptHref } from '@/components/learn/Mastery';
import { dailyChallenge } from '@/components/play/challenge';
import { useLearner, useXp } from '@/components/shell/hooks';
import { ButtonLink } from '@/components/ui/Button';
import { Card, FeatureCard, TrackCard, TrackCardLink, trackTitle } from '@/components/ui/Card';
import { Chip, DifficultyChip, displayStatus, StatusChip, type Difficulty } from '@/components/ui/Chip';
import { BigNumber } from '@/components/ui/Numbers';
import type { Goal } from '@/content/goals';
import { TRACK_CLASSES, trackColour, trackLabel } from '@/data/tracks';
import { useMinute } from '@/lib/now';
import { useLessonProgress, useMastery, useMistakes, useProblemProgress, useProgressSnapshot, useReviewCards } from '@/progress/hooks';
import { isReady, nextSteps, type ConceptMastery, type MasteryConcept, type MasteryGraph } from '@/progress/mastery';
import { CLEAR_AFTER } from '@/progress/misconceptions';
import { BADGES, badges } from '@/progress/play';
import { planView, WEEK_MS, type PlanView } from '@/progress/plan';
import { dueToday, nextDue, type ReviewCard } from '@/progress/review';
import { firstUnsolved, greeting, lessonInProgress, trackMastery, weekActivity, type WeekDay } from './select';

// Today (/): the learner's home. Everything comes from their own events and
// waits for the progress store, so the server renders a placeholder.

export type TodayConcept = {
  summary: string;
  minutes: number;
  lesson?: { slug: string; title: string; minutes: number };
  visualisers: number;
  /** Easiest first. */
  problems: {
    slug: string;
    title: string;
    difficulty: Difficulty;
    pattern: string;
  }[];
};

export type TodayData = {
  graph: MasteryGraph;
  goals: readonly Goal[];
  tracks: { id: string; title: string }[];
  concepts: Record<string, TodayConcept>;
  /** Each common mistake's review card id → its name and lesson. */
  mistakes: Record<string, { title: string; lesson: string; lessonTitle: string }>;
};

/** A rough guide for "about N minutes" of review. */
const SECONDS_PER_CARD = 30;
const reviewMinutes = (cards: number) => Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60));

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const inWords = (n: number) => WORDS[n] ?? String(n);
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function Today({ data }: { data: TodayData }) {
  const { ready } = useProgressSnapshot();
  const now = useMinute();
  if (!ready || !now) return <Placeholder />;
  return <TodayFor data={data} now={now} />;
}

function TodayFor({ data, now }: { data: TodayData; now: Date }) {
  const { graph, goals, concepts } = data;
  const { events } = useProgressSnapshot();
  const learner = useLearner();
  const m = useMastery(graph);
  const cards = useReviewCards();
  const lessons = useLessonProgress();
  const problems = useProblemProgress();
  const xp = useXp();
  const minutes = useMemo(() => Object.fromEntries(Object.entries(concepts).map(([id, c]) => [id, c.minutes])), [concepts]);
  const plan = useMemo(() => planView(events, graph, goals, minutes, now), [events, graph, goals, minutes, now]);
  const byId = useMemo(() => new Map(graph.concepts.map((c) => [c.id, c])), [graph]);
  const week = weekActivity(events, now);
  const due = dueToday(cards, now);
  const steps = nextSteps(m, graph, { limit: 8 });

  // Continue: the lesson in progress, else the next step with a lesson.
  const inProgress = lessonInProgress(events, new Set(lessons.completed));
  const resume = inProgress ? byId.get(graph.lessons[inProgress]) : undefined;
  const upNext = resume ?? steps.find((s) => s.concept.lesson)?.concept ?? steps[0]?.concept;
  const mode: ContinueMode = resume ? 'resume' : events.length === 0 ? 'first' : 'next';

  // This week's plan: what is left in the current window.
  const thisWeek = plan?.weeks.find((w) => w.index === plan.week) ?? null;
  const left = thisWeek?.items.length ?? 0;

  const first = learner?.name?.trim().split(/\s+/)[0];
  const planLine = plan
    ? left > 0
      ? `${inWords(left)} ${plural(left, 'concept')} left in this week’s plan`
      : 'nothing left in this week’s plan'
    : due.length > 0
      ? `${inWords(due.length)} ${plural(due.length, 'card')} due for review`
      : 'pick up where you left off';

  // Problem for today: an unsolved one for this week's concept, else for what is next.
  const focus = [...(thisWeek?.items.map((i) => i.concept) ?? []), ...(upNext ? [upNext.id] : []), ...steps.map((s) => s.concept.id)];
  const solved = (slug: string) => !!problems[slug]?.solved;
  let problem: {
    concept: string;
    p: TodayConcept['problems'][number];
    fromPlan: boolean;
  } | null = null;
  for (const [i, id] of focus.entries()) {
    const p = concepts[id] && firstUnsolved(concepts[id].problems, solved);
    if (p) {
      problem = { concept: id, p, fromPlan: i < (thisWeek?.items.length ?? 0) };
      break;
    }
  }

  const ready = steps.filter((s) => s.reason === 'ready' && s.concept.id !== upNext?.id).slice(0, 3);

  return (
    <main className="flex flex-col gap-6 px-4 pb-6 md:px-0 md:pt-2">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-title-page">
            {greeting(now)}
            {first ? `, ${first}` : ''}
          </h1>
          <p className="text-base text-ink-soft">
            {now.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}{' '}
            · {planLine}.
          </p>
        </div>
        <WeekStrip week={week} />
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {upNext ? <ContinueCard concept={upNext} info={concepts[upNext.id]} mode={mode} /> : null}
          <PhoneTiles due={due.length} xp={xp?.total ?? 0} week={week} />
          <PlanCard plan={plan} m={m} graph={graph} concepts={concepts} byId={byId} now={now} />
          {ready.length > 0 && <ReadyFor steps={ready.map((s) => s.concept)} concepts={concepts} />}
          <Mistakes titles={data.mistakes} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <ReviewDue due={due} cards={cards} now={now} />
          <MasteryByTrack graph={graph} m={m} tracks={data.tracks} />
          {problem && <ProblemForToday {...problem} title={byId.get(problem.concept)?.title ?? ''} />}
          <Challenge graph={graph} m={m} cards={cards} now={now} xp={xp} />
        </div>
      </div>
    </main>
  );
}

function Placeholder() {
  return (
    <main aria-busy="true" className="flex flex-col gap-6 px-4 pb-6 md:px-0 md:pt-2">
      <h1 className="font-display text-title-page">Today</h1>
      <p role="status" className="sr-only">
        Loading your day…
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]" aria-hidden>
        <div className="flex flex-col gap-4">
          <div className="h-80 animate-pulse rounded-card bg-track-lilac" />
          <div className="h-64 animate-pulse rounded-card bg-surface" />
        </div>
        <div className="flex flex-col gap-4">
          <div className="h-72 animate-pulse rounded-card bg-track-butter" />
          <div className="h-60 animate-pulse rounded-card bg-surface" />
        </div>
      </div>
    </main>
  );
}

function WeekStrip({ week }: { week: WeekDay[] }) {
  return (
    <ol aria-label="Your activity this week" className="hidden gap-1 rounded-tile bg-surface p-2 sm:flex">
      {week.map((d) => {
        const label = d.date.toLocaleDateString('en-GB', { weekday: 'short' });
        return (
          <li
            key={d.date.toISOString()}
            aria-current={d.today ? 'date' : undefined}
            className={clsx('flex w-13 flex-col items-center gap-1.5 rounded-[16px] py-2 text-xs', d.today ? 'bg-primary font-semibold text-on-primary' : 'text-ink-muted')}
          >
            <span aria-hidden>{label}</span>
            <span className="sr-only">
              {d.date.toLocaleDateString('en-GB', { weekday: 'long' })}: {d.active ? 'active' : 'no activity'}
            </span>
            {d.active ? (
              <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-track-mint text-track-mint-ink">
                <FiCheck className="size-4" strokeWidth={2.5} />
              </span>
            ) : (
              <span aria-hidden className={clsx('size-7 rounded-full border-2', d.today ? 'border-dashed border-accent' : 'border-line')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

type ContinueMode = 'resume' | 'next' | 'first';

function ContinueCard({ concept, info, mode }: { concept: MasteryConcept; info: TodayConcept | undefined; mode: ContinueMode }) {
  const lesson = info?.lesson;
  const chip = mode === 'resume' ? 'Continue' : mode === 'first' ? 'Start here' : 'Up next';
  const action = lesson ? (mode === 'resume' ? 'Resume the lesson' : mode === 'first' ? 'Start your first lesson' : 'Start the lesson') : 'Open the visualiser';
  const n = info?.problems.length ?? 0;
  return (
    <TrackCard track="lilac" as="article" aria-labelledby="continue-title" className="flex-row flex-wrap gap-7 rounded-[36px] p-6 sm:p-8">
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary">{chip}</span>
          <span className="text-[13px] font-semibold">{[lesson ? 'Lesson' : 'Concept', trackLabel(concept.track), lesson && `${lesson.minutes} min`].filter(Boolean).join(' · ')}</span>
        </div>
        <h2 id="continue-title" className={clsx('font-display text-[32px] leading-[1.04] font-bold tracking-[-0.03em] sm:text-[40px]', trackTitle('lilac'))}>
          {lesson?.title ?? concept.title}
        </h2>
        {/* TODO(redesign): the board's step pills (Hook ✓ … Predict) and "about 8 minutes left" need lesson progress step by step, which isn't recorded yet. */}
        {info && <p className="max-w-xl text-[15px] leading-relaxed">{info.summary}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <ButtonLink href={conceptHref(concept)} size="l" trailing={<FiArrowRight aria-hidden />}>
            {action}
          </ButtonLink>
          {lesson && <span className="text-sm">About {lesson.minutes} minutes</span>}
        </div>
      </div>
      <div className="hidden min-w-[240px] flex-[0_1_300px] self-stretch sm:flex">
        <div className="flex w-full flex-col justify-center gap-3 rounded-[28px] bg-surface p-5 text-ink">
          <span className="text-eyebrow text-ink-muted uppercase">In this concept</span>
          <ul className="flex flex-col gap-2.5 text-sm">
            {lesson && (
              <li className="flex items-center gap-2.5">
                <FiBookOpen aria-hidden className="size-4 shrink-0 text-accent-ink" /> A lesson, about {lesson.minutes} minutes
              </li>
            )}
            {(info?.visualisers ?? 0) > 0 && (
              <li className="flex items-center gap-2.5">
                <FiPlay aria-hidden className="size-4 shrink-0 text-accent-ink" /> {info!.visualisers} {plural(info!.visualisers, 'visualiser')} to step through
              </li>
            )}
            {n > 0 && (
              <li className="flex items-center gap-2.5">
                <FiCode aria-hidden className="size-4 shrink-0 text-accent-ink" /> {n} practice {plural(n, 'problem')}
              </li>
            )}
          </ul>
        </div>
      </div>
    </TrackCard>
  );
}

/** Phones: review due and Mastery XP side by side, as on the board. */
function PhoneTiles({ due, xp, week }: { due: number; xp: number; week: WeekDay[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:hidden">
      <Link href="/review" className={clsx('flex min-h-40 flex-col gap-2 rounded-[28px] p-4', TRACK_CLASSES.butter.bg, TRACK_CLASSES.butter.ink)}>
        <span className="text-sm font-semibold">Review due</span>
        <span className={clsx('font-display text-[44px] leading-none font-bold tracking-[-0.03em]', TRACK_CLASSES.butter.title)}>{due}</span>
        <span className="mt-auto text-[13px]">{due > 0 ? `About ${reviewMinutes(due)} min · Start` : 'Nothing due, nice'}</span>
      </Link>
      <Link href="/play" className="flex min-h-40 flex-col gap-2 rounded-[28px] bg-feature p-4 text-on-feature">
        <span className="text-sm font-semibold text-feature-muted">Mastery XP</span>
        <span className="font-display text-[34px] leading-none font-bold tracking-[-0.03em] tabular-nums">{xp.toLocaleString('en-GB')}</span>
        <span className="mt-auto flex gap-1" aria-label={`Active on ${week.filter((d) => d.active).length} of 7 days this week`}>
          {week.map((d) => (
            <span key={d.date.toISOString()} className={clsx('h-2 flex-1 rounded-full', d.active ? 'bg-track-mint-bar' : 'bg-on-feature/20')} />
          ))}
        </span>
      </Link>
    </div>
  );
}

function PlanCard({
  plan,
  m,
  graph,
  concepts,
  byId,
  now,
}: {
  plan: PlanView | null;
  m: Map<string, ConceptMastery>;
  graph: MasteryGraph;
  concepts: Record<string, TodayConcept>;
  byId: Map<string, MasteryConcept>;
  now: Date;
}) {
  if (!plan) {
    return (
      <Card aria-labelledby="plan-title" className="p-7">
        <h2 id="plan-title" className="font-display text-title-section">
          This week’s plan
        </h2>
        <p className="max-w-xl text-[15px] text-ink-soft">
          Pick a goal and the hours you have each week, and Algorender plans the weeks for you: in the order the ideas build on each other, skipping what you know.
        </p>
        <ButtonLink href="/plan" kind="secondary" className="self-start" trailing={<FiArrowRight aria-hidden />}>
          Set a goal
        </ButtonLink>
      </Card>
    );
  }
  const total = (plan.weeks.at(-1)?.index ?? plan.week) + 1;
  const windowStart = new Date(plan.settings.since).getTime() + plan.week * WEEK_MS;
  // The most recent concept to become known this week, then what is left in the window.
  const justDone = [...plan.done]
    .filter((id) => {
      const last = m.get(id)?.last;
      return !!last && new Date(last).getTime() >= windowStart && new Date(last) <= now;
    })
    .sort((a, b) => (m.get(b)!.last ?? '').localeCompare(m.get(a)!.last ?? ''))[0];
  const current = plan.weeks.find((w) => w.index === plan.week)?.items.map((i) => i.concept) ?? [];
  const rows: { id: string; state: 'done' | 'current' | 'next' }[] = [
    ...(justDone ? [{ id: justDone, state: 'done' as const }] : []),
    ...current.map((id, i) => ({
      id,
      state: i === 0 ? ('current' as const) : ('next' as const),
    })),
  ].slice(0, 3);

  return (
    <Card aria-labelledby="plan-title" className="gap-4 p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="plan-title" className="font-display text-title-section">
            This week’s plan
          </h2>
          <p className="text-sm text-ink-muted">
            {plan.goal.title} · week {Math.min(plan.week + 1, total)} of {total} · {plan.settings.hours} h a week
          </p>
        </div>
        <Link href="/plan" className="inline-flex items-center gap-1.5 py-2.5 text-sm font-semibold text-accent-ink hover:underline">
          Open plan <FiArrowRight aria-hidden />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-[20px] bg-sunken px-4 py-3.5 text-[15px] text-ink-soft">
          {plan.weeks.length === 0 ? `You know everything in “${plan.goal.title}”. Set a new goal when you’re ready.` : 'Nothing left this week. Next week’s concepts are on the plan.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ id, state }) => {
            const c = byId.get(id);
            const info = concepts[id];
            if (!c) return null;
            const s = displayStatus(m.get(id)?.status ?? 'new', isReady(id, m, graph));
            const n = info?.problems.length ?? 0;
            const sub = [info?.lesson ? `Lesson · ${info.lesson.minutes} min` : 'Visualiser', n > 0 && `${n} ${plural(n, 'problem')}`].filter(Boolean).join(' · ');
            return (
              <li key={id}>
                <Link
                  href={conceptHref(c)}
                  className={clsx(
                    'flex items-center gap-4 rounded-[20px] px-4 py-3.5 transition-colors duration-150 ease-standard',
                    state === 'done' && 'bg-sunken',
                    state === 'current' && 'ring-2 ring-primary ring-inset',
                    state === 'next' && 'hover:bg-subtle',
                  )}
                >
                  <PlanMark state={state} />
                  <span aria-hidden className={clsx('h-9 w-2.5 shrink-0 rounded-full', TRACK_CLASSES[trackColour(c.track)].bg)} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={clsx('truncate text-[15px] font-semibold', state === 'done' && 'text-ink-muted line-through')}>{c.title}</span>
                    <span className="truncate text-[13px] text-ink-muted">{sub}</span>
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <StatusChip status={s} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PlanMark({ state }: { state: 'done' | 'current' | 'next' }) {
  if (state === 'done')
    return (
      <span role="img" aria-label="Done" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
        <FiCheck aria-hidden className="size-4" strokeWidth={2.5} />
      </span>
    );
  if (state === 'current')
    return (
      <span aria-label="Now" role="img" className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-accent">
        <span className="size-3 rounded-full bg-accent" />
      </span>
    );
  return <span aria-label="Next" role="img" className="size-8 shrink-0 rounded-full border-2 border-dashed border-line-strong" />;
}

function ReadyFor({ steps, concepts }: { steps: MasteryConcept[]; concepts: Record<string, TodayConcept> }) {
  return (
    <section aria-labelledby="ready-title" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="ready-title" className="font-display text-title-section">
          You’re ready for
        </h2>
        <span className="text-sm text-ink-muted">Everything they build on is known</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
        {steps.map((c) => {
          const info = concepts[c.id];
          return (
            <TrackCardLink key={c.id} href={conceptHref(c)} track={c.track} className="min-h-[170px] justify-between gap-6 rounded-[28px] p-[22px]">
              <span className="flex items-start justify-between gap-2">
                <Chip tone="onTrack">{trackLabel(c.track)}</Chip>
                <span className="text-[13px] font-semibold whitespace-nowrap">{info?.lesson ? `${info.lesson.minutes} min` : 'Visualiser'}</span>
              </span>
              <span>
                <span className={clsx('block font-display text-[22px] leading-tight font-bold tracking-[-0.01em]', trackTitle(c.track))}>{c.title}</span>
                {info && <span className="line-clamp-2 text-[13px]">{info.summary}</span>}
              </span>
            </TrackCardLink>
          );
        })}
      </div>
    </section>
  );
}

function Mistakes({ titles }: { titles: TodayData['mistakes'] }) {
  const all = useMistakes();
  const open = [...all.entries()].filter(([card, mk]) => mk.status !== 'cleared' && titles[card]).slice(0, 2);
  if (open.length === 0) return null;
  return (
    <TrackCard track="peach" aria-labelledby="mistakes-title" className="gap-3 rounded-[28px] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mistakes-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <FiFlag aria-hidden className="size-[18px]" /> Mistakes to clear
        </h2>
        <span className="text-xs">{inWords(CLEAR_AFTER).replace(/^./, (c) => c.toUpperCase())} right answers in a row clear one</span>
      </div>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {open.map(([card, mk]) => (
          <li key={card}>
            <Link
              href={`/learn/${mk.lesson}#${mistakeAnchor(mk.id)}`}
              className="flex h-full flex-col gap-0.5 rounded-[18px] bg-surface px-3.5 py-3 text-ink hover:ring-1 hover:ring-line-strong hover:ring-inset"
            >
              <span className="text-[15px] font-semibold">{titles[card].title}</span>
              <span className="text-xs text-ink-muted">
                {titles[card].lessonTitle} · right {mk.right} of {CLEAR_AFTER} times so far
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TrackCard>
  );
}

function ReviewDue({ due, cards, now }: { due: ReviewCard[]; cards: Map<string, ReviewCard>; now: Date }) {
  const count = (kind: ReviewCard['kind']) => due.filter((c) => c.kind === kind).length;
  const parts = [
    {
      kind: 'problem' as const,
      n: count('problem'),
      label: (n: number) => `${n} ${plural(n, 'problem')}`,
      className: 'bg-track-butter-ink',
    },
    {
      kind: 'quiz' as const,
      n: count('quiz'),
      label: (n: number) => `${n} quiz ${plural(n, 'question')}`,
      className: 'bg-track-butter-bar',
    },
    {
      kind: 'misconception' as const,
      n: count('misconception'),
      label: (n: number) => `${n} ${plural(n, 'mistake')}`,
      className: 'bg-grade-again',
    },
  ].filter((p) => p.n > 0);
  const next = due.length === 0 ? nextDue(cards, now) : null;
  return (
    // Phones show the compact tile in PhoneTiles instead.
    <div className="hidden sm:block">
      <TrackCard track="butter" aria-labelledby="due-title" className="gap-4 rounded-[36px] p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="due-title" className="text-base font-semibold">
            Review due
          </h2>
          {due.length > 0 && <span className="text-sm font-semibold">About {reviewMinutes(due.length)} min</span>}
        </div>
        {due.length > 0 ? (
          <>
            <BigNumber value={due.length} unit={plural(due.length, 'card')} className={trackTitle('butter')} />
            <div className="flex h-2.5 gap-1" aria-hidden>
              {parts.map((p) => (
                <span key={p.kind} className={clsx('rounded-full', p.className)} style={{ flexGrow: p.n }} />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              {parts.map((p) => (
                <li key={p.kind} className="flex items-center gap-1.5">
                  <span aria-hidden className={clsx('size-2 rounded-full', p.className)} />
                  {p.label(p.n)}
                </li>
              ))}
            </ul>
            <ButtonLink href="/review" size="l" block>
              Start review
            </ButtonLink>
          </>
        ) : (
          <>
            <p className={clsx('font-display text-[32px] leading-tight font-bold tracking-[-0.02em]', trackTitle('butter'))}>Nothing due, nice.</p>
            <p className="text-sm">
              {next
                ? `The next card comes back ${next.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`
                : 'Cards arrive as you solve problems and answer lesson questions.'}
            </p>
          </>
        )}
      </TrackCard>
    </div>
  );
}

function MasteryByTrack({ graph, m, tracks }: { graph: MasteryGraph; m: Map<string, ConceptMastery>; tracks: TodayData['tracks'] }) {
  const titles = new Map(tracks.map((t) => [t.id, t.title]));
  const rows = trackMastery(
    graph,
    m,
    tracks.map((t) => t.id),
  )
    .filter((t) => t.started)
    .slice(0, 5);
  if (rows.length === 0) return null;
  return (
    <Card aria-labelledby="mastery-title" className="gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="mastery-title" className="text-base font-semibold">
          Mastery by track
        </h2>
        <Link href="/learn" className="text-sm font-semibold text-accent-ink hover:underline">
          Path
        </Link>
      </div>
      <ul className="flex flex-col gap-3.5">
        {rows.map((t) => {
          const c = TRACK_CLASSES[trackColour(t.track)];
          return (
            <li key={t.track} className="flex flex-col gap-1.5">
              <span className="flex justify-between gap-3 text-sm">
                <span className="font-semibold">{titles.get(t.track)}</span>
                <span className="text-ink-muted tabular-nums">
                  {t.known} / {t.total}
                </span>
              </span>
              <span
                role="progressbar"
                aria-label={`${titles.get(t.track)}: ${t.known} of ${t.total} known`}
                aria-valuemin={0}
                aria-valuemax={t.total}
                aria-valuenow={t.known}
                className={clsx('h-2 overflow-hidden rounded-full', c.bg)}
              >
                <span className={clsx('block h-full rounded-full', c.fill)} style={{ width: `${(t.known / t.total) * 100}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ProblemForToday({ p, fromPlan, title }: { concept: string; p: TodayConcept['problems'][number]; fromPlan: boolean; title: string }) {
  return (
    <FeatureCard aria-labelledby="problem-title" className="gap-4 rounded-[36px] p-6">
      <span className="text-eyebrow text-feature-muted uppercase">Problem for today</span>
      <h2 id="problem-title" className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em]">
        {p.title}
      </h2>
      <div className="flex flex-wrap gap-2">
        <DifficultyChip level={p.difficulty} />
        {p.pattern && <Chip tone="onFeature">{p.pattern}</Chip>}
        <Chip tone="onFeature">{fromPlan ? 'Uses this week’s concept' : `Uses ${title}`}</Chip>
      </div>
      <ButtonLink href={`/practice/${p.slug}`} kind="onFeature" size="l" block trailing={<FiArrowRight aria-hidden />}>
        Solve it
      </ButtonLink>
    </FeatureCard>
  );
}

function Challenge({ graph, m, cards, now, xp }: { graph: MasteryGraph; m: Map<string, ConceptMastery>; cards: Map<string, ReviewCard>; now: Date; xp: { total: number; today: number } | null }) {
  const { events } = useProgressSnapshot();
  const items = dailyChallenge({ events, cards, mastery: m, graph, now });
  const earned = useMemo(() => badges(events).size, [events]);
  return (
    <Card aria-labelledby="challenge-title" className="gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="challenge-title" className="text-base font-semibold">
          Today’s challenge
        </h2>
        <Link href="/play" className="text-sm font-semibold text-accent-ink hover:underline">
          Play
        </Link>
      </div>
      <p className="flex flex-wrap items-baseline gap-2.5">
        <span className="font-display text-[44px] leading-[0.9] font-bold tracking-[-0.03em] tabular-nums">{(xp?.total ?? 0).toLocaleString('en-GB')}</span>
        <span className="text-sm font-semibold">Mastery XP</span>
        <Chip tone="good" className="ml-auto">
          +{xp?.today ?? 0} today
        </Chip>
      </p>
      <ul className="flex flex-col gap-1 rounded-[20px] bg-sunken p-2">
        {items.map((it) => (
          <ChallengeRow key={it.id} done={it.done} text={it.text} detail={it.detail}>
            {!it.done && (
              <Link href={it.href} className="ml-auto shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface">
                {it.cta}
              </Link>
            )}
          </ChallengeRow>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">
        XP counts what you can do and remember, not time spent. {earned} of {BADGES.length} badges.
      </p>
    </Card>
  );
}

function ChallengeRow({ done, text, detail, children }: { done: boolean; text: string; detail: string; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-[16px] px-3 py-2.5">
      {done ? (
        <span role="img" aria-label="Done" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
          <FiCheck aria-hidden className="size-3.5" strokeWidth={3} />
        </span>
      ) : (
        <span aria-label="To do" role="img" className="size-6 shrink-0 rounded-full border-2 border-dashed border-line-strong" />
      )}
      <span className="flex min-w-0 flex-col">
        <span className={clsx('text-sm font-semibold', done && 'text-ink-muted line-through')}>{text}</span>
        <span className="truncate text-xs text-ink-muted">{detail}</span>
      </span>
      {children}
    </li>
  );
}
