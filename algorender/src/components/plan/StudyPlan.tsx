'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { FiArrowRight, FiBookOpen, FiCheck, FiClock, FiCode, FiPlayCircle, FiRefreshCw, FiTarget } from 'react-icons/fi';
import { StatusChip } from '@/components/learn/Mastery';
import type { ConceptCatalogEntry } from '@/content/mastery';
import type { Goal } from '@/content/goals';
import { record, useMastery, useProblemProgress, useProgressSnapshot, useReviewCards } from '@/progress/hooks';
import { KNOWN, isReady, type MasteryGraph } from '@/progress/mastery';
import { goalConcepts, HOUR_CHOICES, planView, REVIEW_SHARE, type PlanSettings, type PlanView, type PlanWeek } from '@/progress/plan';
import { dueToday } from '@/progress/review';

type Props = { graph: MasteryGraph; goals: readonly Goal[]; catalog: Record<string, ConceptCatalogEntry> };

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const hoursOf = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.round((minutes / 60) * 10) / 10} h`);

/**
 * A study plan: pick a goal and hours a week, then see what to do next and
 * week by week. Everything is computed from the learner's events
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
    <form
      className="space-y-6 rounded-2xl border border-line-soft bg-surface p-6 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!placed && (
        <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          Tip: take the <Link href="/learn/placement" className="font-medium underline underline-offset-2">placement check</Link> first, so the plan
          skips what you already know.
        </p>
      )}
      <fieldset>
        <legend className="mb-3 font-semibold text-ink">Your goal</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => {
            const rest = left(g);
            const total = rest.reduce((s, id) => s + (minutes[id] ?? 20), 0);
            return (
              <label
                key={g.id}
                className={`flex cursor-pointer flex-col rounded-xl border p-4 text-sm ${goal === g.id ? 'border-accent-line bg-accent-soft' : 'border-line hover:bg-subtle'}`}
              >
                <span className="flex items-center gap-2 font-medium text-ink">
                  <input type="radio" name="goal" value={g.id} checked={goal === g.id} onChange={() => setGoal(g.id)} className="accent-[var(--color-accent)]" />
                  {g.title}
                </span>
                <span className="mt-1 text-ink-soft">{g.summary}</span>
                <span className="mt-2 text-xs text-ink-muted">
                  {rest.length} {rest.length === 1 ? 'concept' : 'concepts'} to go · about {Math.round(total / 60)} hours
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 font-semibold text-ink">Hours a week</legend>
        <div className="flex flex-wrap gap-2">
          {HOUR_CHOICES.map((h) => (
            <label key={h} className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm ${hours === h ? 'border-accent-line bg-accent-soft text-accent-ink' : 'border-line text-ink-soft hover:bg-subtle'}`}>
              <input type="radio" name="hours" value={h} checked={hours === h} onChange={() => setHours(h)} className="sr-only" />
              {h} h
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">About {Math.round(REVIEW_SHARE * 100)}% of it is kept for the daily review queue.</p>
      </fieldset>
      <div>
        <label htmlFor="target" className="mb-1 block font-semibold text-ink">
          Target date <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id="target"
          type="date"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-accent-strong">
          {current ? 'Update the plan' : 'Make my plan'} <FiArrowRight aria-hidden />
        </button>
        {current && (
          <button type="button" onClick={onDone} className="rounded-full px-4 py-2 text-sm text-ink-soft hover:bg-subtle">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function PlanBoard({ view, graph, catalog, now, onEdit }: { view: PlanView; graph: MasteryGraph; catalog: Record<string, ConceptCatalogEntry>; now: Date; onEdit: () => void }) {
  const titleOf = useMemo(() => new Map(graph.concepts.map((c) => [c.id, c.title])), [graph]);
  const cards = useReviewCards();
  const reviews = dueToday(cards, now).length;
  const total = view.concepts.length;
  const next = view.weeks[0]?.items[0];
  const status =
    view.weeks.length === 0
      ? { text: 'Goal reached: everything in it is known. Keep up the reviews to make it stick.', tone: 'text-good-ink' }
      : view.behind > 0
        ? { text: `${view.behind} ${view.behind === 1 ? 'concept' : 'concepts'} behind the schedule you set.`, tone: 'text-warn-ink' }
        : { text: 'On track.', tone: 'text-good-ink' };

  return (
    <div className="space-y-8">
      <section aria-labelledby="plan-goal" className="rounded-2xl border border-line-soft bg-surface p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-accent-ink">Your goal</div>
            <h2 id="plan-goal" className="text-2xl font-bold text-ink">
              {view.goal.title}
            </h2>
          </div>
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={onEdit} className="rounded-full border border-line px-3 py-1.5 text-ink-soft hover:bg-subtle">
              Change plan
            </button>
            <button type="button" onClick={() => record('plan.set', { goal: null, hours: view.settings.hours })} className="rounded-full px-3 py-1.5 text-ink-muted hover:bg-subtle">
              Stop plan
            </button>
          </div>
        </div>
        <div className="mt-4" aria-label={`${view.done.length} of ${total} concepts known`} role="img">
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-good" style={{ width: `${total ? (100 * view.done.length) / total : 0}%` }} />
          </div>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-ink-muted">Known</dt>
            <dd className="font-medium text-ink">
              {view.done.length} of {total} concepts
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-muted">Pace</dt>
            <dd className="font-medium text-ink">{view.settings.hours} h a week</dd>
          </div>
          {view.finish && (
            <div className="flex gap-1.5">
              <dt className="text-ink-muted">Projected finish</dt>
              <dd className="font-medium text-ink">{day(view.finish)}</dd>
            </div>
          )}
          {view.settings.target && (
            <div className="flex gap-1.5">
              <dt className="text-ink-muted">Target</dt>
              <dd className="font-medium text-ink">{day(`${view.settings.target}T12:00:00`)}</dd>
            </div>
          )}
        </dl>
        <p className={`mt-3 text-sm font-medium ${status.tone}`}>{status.text}</p>
        {view.hoursNeeded !== null && (
          <p className="mt-1 text-sm text-ink-soft">
            To finish by your target date you would need {view.hoursNeeded} hours a week, or a later date.
          </p>
        )}
        {view.targetOutOfReach && <p className="mt-1 text-sm text-ink-soft">Your target date is too close to make at any pace: pick a later one.</p>}
      </section>

      {(next || reviews > 0) && (
        <section aria-labelledby="up-next">
          <h2 id="up-next" className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">
            Up next
          </h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {next && <NextItem id={next.concept} title={titleOf.get(next.concept) ?? next.concept} entry={catalog[next.concept]} view={view} graph={graph} />}
            {reviews > 0 && (
              <Link href="/review" className="flex flex-col rounded-2xl border border-line-soft bg-surface p-5 shadow-xs hover:border-accent-line">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <FiRefreshCw aria-hidden className="text-accent-ink" /> {reviews} {reviews === 1 ? 'review' : 'reviews'} due today
                </span>
                <span className="mt-1 text-sm text-ink-soft">A few minutes of recall keeps what you have learned from fading.</span>
              </Link>
            )}
          </div>
        </section>
      )}

      {view.weeks.length > 0 && (
        <section aria-labelledby="schedule">
          <h2 id="schedule" className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">
            Schedule
          </h2>
          <ol className="space-y-3">
            {view.weeks.slice(0, 4).map((w) => (
              <Week key={w.index} week={w} current={view.week} titleOf={titleOf} catalog={catalog} view={view} graph={graph} />
            ))}
          </ol>
          {view.weeks.length > 4 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-accent-ink">
                {view.weeks.length - 4} more {view.weeks.length - 4 === 1 ? 'week' : 'weeks'}
              </summary>
              <ol className="mt-3 space-y-3">
                {view.weeks.slice(4).map((w) => (
                  <Week key={w.index} week={w} current={view.week} titleOf={titleOf} catalog={catalog} view={view} graph={graph} />
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      {view.done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-ink-soft">Known so far ({view.done.length})</summary>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {view.done.map((id) => (
              <li key={id} className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-0.5 text-xs text-ink-soft">
                {titleOf.get(id)} <StatusChip mastery={view.mastery.get(id)} ready={false} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Week({
  week,
  current,
  titleOf,
  catalog,
  view,
  graph,
}: {
  week: PlanWeek;
  current: number;
  titleOf: Map<string, string>;
  catalog: Record<string, ConceptCatalogEntry>;
  view: PlanView;
  graph: MasteryGraph;
}) {
  const label = week.index === current ? 'This week' : week.index === current + 1 ? 'Next week' : `Week of ${day(week.start)}`;
  return (
    <li className="rounded-xl border border-line-soft bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-ink">{label}</h3>
        <span className="text-xs text-ink-muted">
          <FiClock aria-hidden className="mr-1 inline" />
          {hoursOf(week.minutes)}
        </span>
      </div>
      <ul className="divide-y divide-line-soft">
        {week.items.map((item) => (
          <li key={item.concept} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <Link href={whereToLearn(item.concept, catalog[item.concept])} className="text-ink hover:text-accent-ink hover:underline">
              {titleOf.get(item.concept)}
            </Link>
            <span className="flex items-center gap-2">
              <StatusChip mastery={view.mastery.get(item.concept)} ready={isReady(item.concept, view.mastery, graph)} />
              <span className="text-xs text-ink-muted">{hoursOf(item.minutes)}</span>
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

const whereToLearn = (id: string, entry: ConceptCatalogEntry | undefined) =>
  entry?.lesson ? `/learn/${entry.lesson.slug}` : entry?.visualisers[0] ? `/visualisers/${entry.visualisers[0].slug}` : `/learn#${id}`;

/** The next concept in the plan, with its steps: learn it, practise it, or say you know it. */
function NextItem({ id, title, entry, view, graph }: { id: string; title: string; entry: ConceptCatalogEntry | undefined; view: PlanView; graph: MasteryGraph }) {
  const solved = useProblemProgress();
  const practice = (entry?.problems ?? []).filter((p) => !solved[p.slug]?.solved).slice(0, 2);
  return (
    <div className="rounded-2xl border border-accent-line bg-surface p-5 shadow-xs lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <FiTarget aria-hidden className="text-accent-ink" /> {title}
        </h3>
        <StatusChip mastery={view.mastery.get(id)} ready={isReady(id, view.mastery, graph)} />
      </div>
      <ol className="mt-3 space-y-2 text-sm">
        {entry?.lesson ? (
          <Step href={`/learn/${entry.lesson.slug}`} icon={<FiBookOpen aria-hidden />} text={`Lesson: ${entry.lesson.title}`} note={`${entry.lesson.minutes} min`} />
        ) : (
          entry?.visualisers.slice(0, 2).map((v) => <Step key={v.slug} href={`/visualisers/${v.slug}`} icon={<FiPlayCircle aria-hidden />} text={`Explore: ${v.name}`} />)
        )}
        {practice.map((p) => (
          <Step key={p.slug} href={`/practice/${p.slug}`} icon={<FiCode aria-hidden />} text={`Practise: ${p.title}`} note={p.difficulty} />
        ))}
        {practice.length === 0 &&
          entry?.exercises.slice(0, 1).map((e) => <Step key={e.slug} href={`/code/${e.slug}`} icon={<FiCode aria-hidden />} text={`Code it: ${e.title}`} />)}
        {!entry?.lesson &&
          entry?.links.filter((l) => !l.href.startsWith('/code/')).map((l) => <Step key={l.href} href={l.href} icon={<FiPlayCircle aria-hidden />} text={l.label} />)}
      </ol>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        It counts as done once your answers show you know it.
        <button
          type="button"
          onClick={() => record('concept.marked', { concept: id, known: true })}
          className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-ink-soft hover:bg-subtle"
        >
          <FiCheck aria-hidden /> I already know this
        </button>
      </p>
    </div>
  );
}

function Step({ href, icon, text, note }: { href: string; icon: ReactNode; text: string; note?: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:border-accent-line hover:bg-accent-soft">
        <span className="flex items-center gap-2 text-ink">
          <span className="text-accent-ink">{icon}</span> {text}
        </span>
        <span className="flex items-center gap-2 text-xs text-ink-muted">
          {note}
          <FiArrowRight aria-hidden className="text-accent-ink transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </li>
  );
}
