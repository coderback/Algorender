'use client';

import Link from 'next/link';
import { FiArrowRight, FiAward, FiCheckCircle, FiCircle, FiLoader, FiZap } from 'react-icons/fi';
import { useMinute } from '@/lib/now';
import { GAMES } from '@/play/games';
import { useMastery, usePlay, useProgressSnapshot, useReviewCards } from '@/progress/hooks';
import { nextSteps, type MasteryGraph } from '@/progress/mastery';
import { BADGES, didToday, LEVELS, xpTotals } from '@/progress/play';
import { dueToday } from '@/progress/review';
import { conceptHref } from '../learn/Mastery';

/**
 * The Play hub: XP, today's challenge, the games, levels per concept and
 * badges. Everything comes from the learner's own events and waits for the
 * progress store, so the server render shows only the games.
 */
export function PlayHub({ graph }: { graph: MasteryGraph }) {
  const { ready, events } = useProgressSnapshot();
  const now = useMinute();
  const play = usePlay(graph);
  const m = useMastery(graph);
  const cards = useReviewCards();
  const loaded = ready && !!now;

  return (
    <div className="space-y-10">
      {loaded ? <Today graph={graph} play={play} m={m} cards={cards} events={events} now={now} /> : (
        <p className="flex items-center gap-2 text-ink-soft" role="status">
          <FiLoader aria-hidden className="animate-spin" /> Loading your progress…
        </p>
      )}

      <section aria-labelledby="games">
        <h2 id="games" className="mb-3 text-xl font-semibold text-ink">
          Games
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {GAMES.map((g) => (
            <li key={g.id}>
              <Link href={g.href} className="group flex h-full flex-col rounded-xl border border-line-soft bg-surface p-4 shadow-xs hover:border-accent-line">
                <span className="font-semibold text-ink">{g.title}</span>
                <span className="mt-1 text-sm text-ink-soft">{g.summary}</span>
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-accent-ink">
                  Play <FiArrowRight aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {loaded && <Levels graph={graph} levels={play.levels} />}
      {loaded && <Badges earned={play.badges} />}

      <details className="rounded-xl border border-line-soft bg-surface p-4 text-sm text-ink-soft">
        <summary className="cursor-pointer font-medium text-ink">How XP works</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>XP is for learning that sticks: questions right first time, cards remembered a day, a week and a month later, first solves, explanations that cover their key points, and mistakes you clear.</li>
          <li>Games earn XP for moves and wins, less for replaying the same thing on the same day, and a broken challenge pays once.</li>
          <li>Watching, reading, marking lessons done and time spent earn nothing. There are no streaks to lose and nothing to buy.</li>
        </ul>
      </details>
    </div>
  );
}

type Play = ReturnType<typeof usePlay>;

function Today({
  graph,
  play,
  m,
  cards,
  events,
  now,
}: {
  graph: MasteryGraph;
  play: Play;
  m: ReturnType<typeof useMastery>;
  cards: ReturnType<typeof useReviewCards>;
  events: ReturnType<typeof useProgressSnapshot>['events'];
  now: Date;
}) {
  const { total, today } = xpTotals(play.ledger, now);
  const due = dueToday(cards, now).length;
  const did = didToday(events, now);
  const next = nextSteps(m, graph, { limit: 1 })[0]?.concept;
  const learnedNew = !!next?.lesson && did.learned.has(next.lesson);
  const items = [
    {
      done: due === 0,
      text: due === 0 ? (did.reviewed ? 'Reviews done for today' : 'No reviews due today') : `Clear your ${due} due ${due === 1 ? 'review' : 'reviews'}`,
      href: '/review',
      cta: 'Review',
    },
    ...(next ? [{ done: learnedNew, text: `Something new: ${next.title}`, href: conceptHref(next), cta: 'Start' }] : []),
    { done: did.played, text: 'A round of a game', href: '/play/be-the-algorithm', cta: 'Play' },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <section aria-labelledby="xp" className="rounded-2xl border border-line-soft bg-surface p-5 shadow-xs">
        <h2 id="xp" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          <FiZap aria-hidden className="text-accent-ink" /> Mastery XP
        </h2>
        <p className="mt-2 text-4xl font-bold text-ink tabular-nums">{total.toLocaleString()}</p>
        <p className="mt-1 text-sm text-ink-soft">
          {today > 0 ? `+${today} today` : 'None yet today'} · {play.badges.size} of {BADGES.length} badges
        </p>
      </section>
      <section aria-labelledby="daily" className="rounded-2xl border border-line-soft bg-surface p-5 shadow-xs">
        <h2 id="daily" className="text-lg font-semibold text-ink">
          Today’s challenge
        </h2>
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.text} className="flex items-center gap-3 text-sm">
              {it.done ? <FiCheckCircle aria-label="done" className="shrink-0 text-good-ink" /> : <FiCircle aria-label="to do" className="shrink-0 text-ink-muted" />}
              <span className={it.done ? 'text-ink-soft' : 'text-ink'}>{it.text}</span>
              {!it.done && (
                <Link href={it.href} className="ml-auto inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
                  {it.cta} <FiArrowRight aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Levels({ graph, levels }: { graph: MasteryGraph; levels: Play['levels'] }) {
  const started = graph.concepts.filter((c) => (levels.get(c.id)?.size ?? 0) > 0);
  return (
    <section aria-labelledby="levels">
      <h2 id="levels" className="text-xl font-semibold text-ink">
        Levels
      </h2>
      <p className="mt-1 mb-3 text-sm text-ink-soft">
        Each concept has four levels: {LEVELS.map((l) => l.label.toLowerCase()).join(', ')}. Not every concept has all four: there is nothing to implement in Bayes’ rule.
      </p>
      {started.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
          Levels appear as you answer questions, play rounds, write code and explain ideas. <Link href="/learn" className="text-accent-ink underline underline-offset-2">Start on the concept map</Link>.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {started.map((c) => {
            const reached = levels.get(c.id)!;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface px-4 py-3">
                <Link href={conceptHref(c)} className="font-medium text-ink hover:text-accent-ink">
                  {c.title}
                </Link>
                <span className="flex gap-1" role="img" aria-label={`${c.title}: ${LEVELS.filter((l) => reached.has(l.id)).map((l) => l.label).join(', ')}`}>
                  {LEVELS.map((l) => (
                    <span
                      key={l.id}
                      title={`${l.label}${reached.has(l.id) ? '' : `: ${l.hint}`}`}
                      className={`grid size-6 place-items-center rounded-full text-[10px] font-bold ${reached.has(l.id) ? 'bg-accent text-on-accent' : 'border border-line text-ink-muted'}`}
                    >
                      {l.label[0]}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Badges({ earned }: { earned: Play['badges'] }) {
  return (
    <section aria-labelledby="badges">
      <h2 id="badges" className="text-xl font-semibold text-ink">
        Badges
      </h2>
      <p className="mt-1 mb-3 text-sm text-ink-soft">They mark good learning habits. None is required for anything.</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {BADGES.map((b) => {
          const at = earned.get(b.id);
          return (
            <li key={b.id} data-badge={b.id} data-earned={!!at} className={`rounded-xl border p-3 ${at ? 'border-accent-line bg-accent-soft' : 'border-dashed border-line bg-surface'}`}>
              <p className={`flex items-center gap-1.5 font-medium ${at ? 'text-ink' : 'text-ink-soft'}`}>
                <FiAward aria-hidden className={at ? 'text-accent-ink' : 'text-ink-muted'} /> {b.title}
              </p>
              <p className="mt-1 text-xs text-ink-soft">{b.how}</p>
              <p className="mt-1 text-xs text-ink-muted">{at ? `Earned ${new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not yet'}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
