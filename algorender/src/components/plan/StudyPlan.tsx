'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FiArrowRight, FiCheck } from 'react-icons/fi';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, FeatureCard, TrackCard, trackTitle } from '@/components/ui/Card';
import { Chip, DifficultyChip, displayStatus, StatusChip } from '@/components/ui/Chip';
import { cx } from '@/components/ui/cx';
import type { ConceptCatalogEntry } from '@/content/mastery';
import type { Goal } from '@/content/goals';
import { TRACK_CLASSES, trackColour } from '@/data/tracks';
import { record, useMastery, useProblemProgress, useProgressSnapshot, useReviewCards } from '@/progress/hooks';
import { KNOWN, isReady, type MasteryGraph } from '@/progress/mastery';
import { goalConcepts, HOUR_CHOICES, planView, REVIEW_SHARE, type PlanSettings, type PlanView, type PlanWeek } from '@/progress/plan';
import { dueToday } from '@/progress/review';

type Props = { graph: MasteryGraph; goals: readonly Goal[]; catalog: Record<string, ConceptCatalogEntry> };

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const hoursOf = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ''}`);

/**
 * A study plan: pick a goal and hours a week, then see the goal, the weeks
 * and what's left this week. Everything is computed from the learner's events
 * (src/progress/plan.ts), so it re-plans itself as concepts become known.
 */
export function StudyPlan({ graph, goals, catalog }: Props) {
  const { ready, events } = useProgressSnapshot();
  const [editing, setEditing] = useState(false);
  // The plan is computed for the moment the page opened; it changes with the events, not the clock.
  const [now] = useState(() => new Date());
  const minutes = useMemo(() => Object.fromEntries(Object.entries(catalog).map(([id, c]) => [id, c.minutes])), [catalog]);
  const view = useMemo(() => planView(events, graph, goals, minutes, now), [events, graph, goals, minutes, now]);
  if (!ready) return <p className="text-sm text-ink-muted">Loading your progress…</p>;
  if (!view || editing) {
    return <PlanSetup graph={graph} goals={goals} minutes={minutes} current={view?.settings ?? null} onDone={() => setEditing(false)} placed={events.some((e) => e.kind === 'placement.answered')} />;
  }
  return <PlanBoard view={view} graph={graph} catalog={catalog} now={now} onEdit={() => setEditing(true)} />;
}

function PlanSetup({
  graph,
  goals,
  minutes,
  current,
  placed,
  onDone,
}: {
  graph: MasteryGraph;
  goals: readonly Goal[];
  minutes: Record<string, number>;
  current: PlanSettings | null;
  placed: boolean;
  onDone: () => void;
}) {
  const m = useMastery(graph);
  const [goal, setGoal] = useState(current?.goal ?? goals[0].id);
  const [hours, setHours] = useState(current?.hours ?? 5);
  const [target, setTarget] = useState(current?.target ?? '');
  const left = (g: Goal) => [...goalConcepts(g, graph)].filter((id) => !KNOWN.has(m.get(id)?.status ?? 'new'));
  const save = () => {
    record('plan.set', { goal, hours, ...(target && { target }) });
    onDone();
  };
  return (
    <Card
      as="div"
      className="gap-6 p-6 sm:p-8"
    >
      <form
        className="flex flex-col gap-7"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-title-section">{current ? 'Change your plan' : 'Make a study plan'}</h2>
          <p className="max-w-2xl text-[15px] text-ink-soft">
            A goal and a few hours a week become a schedule over the concept map, in the order the ideas build on each other. It skips what you already know and re-plans as you learn.
          </p>
        </div>
        {!placed && (
          <p className="rounded-well bg-accent-soft px-4 py-3 text-sm text-accent-ink">
            Tip: take the{' '}
            <Link href="/learn/placement" className="font-semibold underline underline-offset-2">
              placement check
            </Link>{' '}
            first, so the plan skips what you already know.
          </p>
        )}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-[15px] font-semibold">Your goal</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {goals.map((g) => {
              const rest = left(g);
              const total = rest.reduce((s, id) => s + (minutes[id] ?? 20), 0);
              const on = goal === g.id;
              return (
                <label
                  key={g.id}
                  className={cx(
                    'flex cursor-pointer gap-3 rounded-tile p-4 text-sm ring-[1.5px] ring-inset transition-colors duration-150 ease-standard',
                    on ? 'bg-sunken ring-2 ring-primary' : 'ring-line hover:ring-line-strong',
                  )}
                >
                  <input type="radio" name="goal" value={g.id} checked={on} onChange={() => setGoal(g.id)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
                  <span className="flex flex-col gap-1">
                    <span className="text-[15px] font-semibold text-ink">{g.title}</span>
                    <span className="text-ink-soft">{g.summary}</span>
                    <span className="text-xs text-ink-muted">
                      {rest.length} {rest.length === 1 ? 'concept' : 'concepts'} to go · about {Math.round(total / 60)} hours
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-[15px] font-semibold">Hours a week</legend>
          <div className="inline-flex flex-wrap gap-1 rounded-full bg-sunken p-1">
            {HOUR_CHOICES.map((h) => (
              <label
                key={h}
                className={cx(
                  'cursor-pointer rounded-full px-4 py-2 text-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                  hours === h ? 'bg-segment font-semibold text-ink shadow-segment' : 'text-ink-soft hover:text-ink',
                )}
              >
                <input type="radio" name="hours" value={h} checked={hours === h} onChange={() => setHours(h)} className="sr-only" />
                {h} h
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">About {Math.round(REVIEW_SHARE * 100)}% of it is kept for the daily review queue.</p>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="target" className="text-[15px] font-semibold">
            Target date <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id="target" type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="h-12 w-fit rounded-[16px] bg-sunken px-4 text-[15px] text-ink" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" size="l" trailing={<FiArrowRight aria-hidden />}>
            {current ? 'Update the plan' : 'Make my plan'}
          </Button>
          {current && (
            <Button kind="ghost" size="l" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function Ring({ known, learning, total }: { known: number; learning: number; total: number }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const share = (n: number) => (total ? (n / total) * c : 0);
  return (
    <svg viewBox="0 0 140 140" className="size-36 shrink-0 -rotate-90" aria-hidden>
      <circle cx="70" cy="70" r={r} fill="none" strokeWidth="14" className="stroke-on-feature/12" />
      <circle cx="70" cy="70" r={r} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-feature-accent" strokeDasharray={`${share(known)} ${c}`} />
      {learning > 0 && (
        <circle cx="70" cy="70" r={r} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-track-peach-bar" strokeDasharray={`${share(learning)} ${c}`} strokeDashoffset={-share(known)} />
      )}
    </svg>
  );
}

function PlanBoard({ view, graph, catalog, now, onEdit }: { view: PlanView; graph: MasteryGraph; catalog: Record<string, ConceptCatalogEntry>; now: Date; onEdit: () => void }) {
  const byId = useMemo(() => new Map(graph.concepts.map((c) => [c.id, c])), [graph]);
  const cards = useReviewCards();
  const reviews = dueToday(cards, now).length;
  const total = view.concepts.length;
  const known = view.done.length;
  const learning = view.concepts.filter((id) => view.mastery.get(id)?.status === 'learning').length;
  const reviewHours = Math.round(view.settings.hours * REVIEW_SHARE * 10) / 10;
  const status =
    view.weeks.length === 0
      ? { text: 'Goal reached: everything in it is known. Keep up the reviews to make it stick.', tone: 'good' as const }
      : view.behind > 0
        ? { text: `${view.behind} ${view.behind === 1 ? 'concept' : 'concepts'} behind the schedule you set.`, tone: 'warn' as const }
        : { text: 'On track.', tone: 'good' as const };
  const thisWeek = view.weeks.find((w) => w.index === view.week);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <FeatureCard aria-labelledby="plan-goal" className="gap-6 rounded-[36px] p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <span className="text-eyebrow text-feature-accent uppercase">Your goal</span>
            <h2 id="plan-goal" className="font-display text-[clamp(32px,3.6vw,44px)] leading-none font-bold tracking-[-0.03em]">
              {view.goal.title}
            </h2>
            <p className="max-w-xl text-[15px] leading-relaxed text-feature-muted">
              {view.goal.summary} {view.settings.hours} hours a week, about {reviewHours} of them for review.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button kind="onFeature" onClick={onEdit}>
              Change goal or hours
            </Button>
            <ButtonLink href="/learn/placement" className="bg-on-feature/10 text-on-feature hover:bg-on-feature/15">
              Retake placement
            </ButtonLink>
            <Button kind="ghost" className="text-feature-muted hover:bg-on-feature/10" onClick={() => record('plan.set', { goal: null, hours: view.settings.hours })}>
              Stop plan
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative" role="img" aria-label={`${known} of ${total} concepts known`}>
              <Ring known={known} learning={learning} total={total} />
              <span className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-[32px] leading-none font-bold">
                  {known}/{total}
                </span>
                <span className="text-xs text-feature-muted">known</span>
              </span>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-8 gap-y-2 text-sm">
              <dt className="flex items-center gap-2 text-feature-muted">
                <span aria-hidden className="size-2.5 rounded-full bg-feature-accent" /> Known
              </dt>
              <dd className="text-right font-semibold">{known}</dd>
              <dt className="flex items-center gap-2 text-feature-muted">
                <span aria-hidden className="size-2.5 rounded-full bg-track-peach-bar" /> Learning
              </dt>
              <dd className="text-right font-semibold">{learning}</dd>
              <dt className="flex items-center gap-2 text-feature-muted">
                <span aria-hidden className="size-2.5 rounded-full bg-on-feature/20" /> To go
              </dt>
              <dd className="text-right font-semibold">{total - known - learning}</dd>
              <dt className="pt-2 text-feature-muted">Weeks left</dt>
              <dd className="pt-2 text-right font-semibold">{view.weeks.length === 0 ? 'None' : `About ${view.weeks.length}`}</dd>
            </dl>
          </div>
          <Chip tone={status.tone} className="self-start text-[13px]">
            {status.text}
          </Chip>
        </FeatureCard>

        <Card className="gap-4 rounded-[36px] p-6 sm:p-7">
          <h2 className="text-base font-semibold">Skipped, because you know them</h2>
          {known > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {view.done.map((id) => (
                <li key={id}>
                  <Chip className="px-3 py-1.5 text-[13px]">{byId.get(id)?.title ?? id}</Chip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">Nothing yet: as your answers show you know a concept, it drops off the plan.</p>
          )}
          <p className="text-sm leading-relaxed text-ink-soft">The plan re-orders itself as you learn. A concept drops off once your answers show you know it, and anything it needs comes just before it.</p>
          {view.settings.target && (
            <div className="rounded-tile bg-warn-soft px-5 py-4 text-warn-title">
              <p className="text-[15px] font-semibold">
                Target {day(`${view.settings.target}T12:00:00`)}
                {view.behind > 0 && ` · ${view.behind} ${view.behind === 1 ? 'concept' : 'concepts'} behind`}
              </p>
              <p className="mt-1 text-sm">
                {view.targetOutOfReach
                  ? 'Your target date is too close to make at any pace: pick a later one.'
                  : view.hoursNeeded !== null
                    ? `About ${view.hoursNeeded} hours a week would get you there. Or move the date: the plan works either way.`
                    : view.finish
                      ? `On course to finish by ${day(view.finish)}.`
                      : 'Everything in it is known.'}
              </p>
            </div>
          )}
          {reviews > 0 && (
            <div className="flex items-center gap-4 rounded-tile bg-sunken px-5 py-4">
              <span className="font-display text-[32px] leading-none font-bold">{reviews}</span>
              <span className="flex-1 text-sm text-ink-soft">
                {reviews === 1 ? 'review' : 'reviews'} due today, inside the {Math.round(REVIEW_SHARE * 100)}% of your hours kept for review
              </span>
              <ButtonLink href="/review" size="s">
                Review
              </ButtonLink>
            </div>
          )}
        </Card>
      </div>

      {view.weeks.length > 0 && (
        <section aria-labelledby="schedule" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="schedule" className="font-display text-title-section">
              Week by week
            </h2>
            {view.weeks.length > 1 && <span className="text-sm text-ink-muted">Scroll for later weeks</span>}
          </div>
          <ol tabIndex={0} aria-labelledby="schedule" className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            {view.weeks.map((w) => (
              <Week key={w.index} week={w} now={w.index === view.week} byId={byId} view={view} />
            ))}
          </ol>
        </section>
      )}

      {thisWeek && <ThisWeek week={thisWeek} view={view} graph={graph} catalog={catalog} byId={byId} />}
    </div>
  );
}

function Week({ week, now, byId, view }: { week: PlanWeek; now: boolean; byId: Map<string, { title: string; track: string }>; view: PlanView }) {
  const end = new Date(new Date(week.end).getTime() - 1);
  return (
    <li className={cx('flex w-[260px] shrink-0 snap-start flex-col gap-3 rounded-tile bg-surface p-5', now && 'ring-2 ring-primary ring-inset')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">
          Week {week.index + 1}
          {now && ' · now'}
        </h3>
        {now && (
          <Chip tone="warn">
            {week.items.length} left
          </Chip>
        )}
      </div>
      <p className="text-[13px] text-ink-muted">
        {day(week.start)} – {day(end.toISOString())} · {hoursOf(week.minutes)}
      </p>
      <ul className="flex flex-col gap-2">
        {week.items.map((item) => {
          const c = byId.get(item.concept);
          const t = TRACK_CLASSES[trackColour(c?.track ?? '')];
          const learning = view.mastery.get(item.concept)?.status === 'learning';
          return (
            <li key={item.concept} className={cx('rounded-[14px] px-3 py-2 text-[13px] font-semibold', t.bg, t.ink)}>
              {c?.title ?? item.concept}
              {learning && <span className="font-medium"> · learning</span>}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

const whereToLearn = (id: string, entry: ConceptCatalogEntry | undefined) =>
  entry?.lesson ? `/learn/${entry.lesson.slug}` : entry?.visualisers[0] ? `/visualisers/${entry.visualisers[0].slug}` : `/learn?concept=${id}`;

/** What's left this week: the concept in hand, practice for this week's concepts, and the next new concept. */
function ThisWeek({
  week,
  view,
  graph,
  catalog,
  byId,
}: {
  week: PlanWeek;
  view: PlanView;
  graph: MasteryGraph;
  catalog: Record<string, ConceptCatalogEntry>;
  byId: Map<string, { title: string; track: string }>;
}) {
  const solved = useProblemProgress();
  const [first, second] = week.items;
  const practice = week.items
    .flatMap((i) => catalog[i.concept]?.problems ?? [])
    .filter((p) => !solved[p.slug]?.solved)
    .slice(0, 3);
  return (
    <Card aria-labelledby="this-week" className="gap-5 rounded-[36px] p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="this-week" className="font-display text-title-section">
          What’s left this week
        </h2>
        <span className="text-sm text-ink-muted">{hoursOf(week.minutes)} of work · do it in any order</span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {first && <ConceptCard id={first.concept} entry={catalog[first.concept]} view={view} graph={graph} byId={byId} lead />}
        {practice.length > 0 && (
          <div className="flex flex-col gap-3 rounded-tile bg-sunken p-5">
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="font-semibold text-ink-soft">
                Practise · {practice.length} {practice.length === 1 ? 'problem' : 'problems'}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {practice.map((p) => (
                <li key={p.slug}>
                  <Link href={`/practice/${p.slug}`} className="flex items-center justify-between gap-3 rounded-[12px] py-1 text-sm hover:text-accent-ink" aria-label={`Practise: ${p.title}`}>
                    <span className="min-w-0 truncate">{p.title}</span>
                    <DifficultyChip level={p.difficulty} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {second && <ConceptCard id={second.concept} entry={catalog[second.concept]} view={view} graph={graph} byId={byId} />}
      </div>
    </Card>
  );
}

/** One concept of the week: where to learn it, and a way to say you know it already. */
function ConceptCard({
  id,
  entry,
  view,
  graph,
  byId,
  lead = false,
}: {
  id: string;
  entry: ConceptCatalogEntry | undefined;
  view: PlanView;
  graph: MasteryGraph;
  byId: Map<string, { title: string; track: string }>;
  lead?: boolean;
}) {
  const c = byId.get(id);
  const m = view.mastery.get(id);
  const s = displayStatus(m?.status ?? 'new', isReady(id, view.mastery, graph));
  const started = m?.status === 'learning';
  const label = lead ? (started ? 'Finish' : 'Up next') : 'New concept';
  const action = entry?.lesson ? (started ? 'Resume' : 'Start lesson') : 'Explore';
  const extra = entry?.lesson ? `${entry.lesson.minutes} min` : entry?.visualisers.length ? 'Visualiser' : '';
  return (
    <TrackCard track={c?.track ?? 'foundations'} as="article" aria-labelledby={`concept-${id}`} dense className="gap-3 rounded-tile">
      <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
        <span>{label}</span>
        <span>{extra}</span>
      </div>
      <h3 id={`concept-${id}`} className={cx('font-display text-[22px] leading-tight font-bold', trackTitle(c?.track ?? 'foundations'))}>
        {c?.title ?? id}
      </h3>
      <StatusChip status={s} className="self-start bg-chip-on-track" />
      <ButtonLink href={whereToLearn(id, entry)} kind={lead ? 'primary' : 'onTrack'} block className="mt-auto">
        {action}
      </ButtonLink>
      <button
        type="button"
        onClick={() => record('concept.marked', { concept: id, known: true })}
        className="inline-flex items-center justify-center gap-1.5 self-center rounded-full px-3 py-1 text-[13px] font-semibold hover:bg-chip-on-track"
      >
        <FiCheck aria-hidden /> I already know this
      </button>
    </TrackCard>
  );
}
