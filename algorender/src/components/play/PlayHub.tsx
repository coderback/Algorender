'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FiAward, FiCheck, FiChevronRight } from 'react-icons/fi';
import { ButtonLink } from '@/components/ui/Button';
import { Card, FeatureCard, TrackCardLink, trackTitle } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { TRACK_CLASSES, type TrackColour } from '@/data/tracks';
import { useMinute } from '@/lib/now';
import { MAX_CARDS, MIN_CARDS } from '@/play/comparison-budget/budget';
import { SUPPORTED } from '@/play/be-the-algorithm/moves';
import { GAMES, type GameId } from '@/play/games';
import { useMastery, usePlay, useProgressSnapshot, useReviewCards } from '@/progress/hooks';
import type { MasteryGraph } from '@/progress/mastery';
import { BADGES, LEVELS, xpTotals } from '@/progress/play';
import { conceptHref } from '../learn/Mastery';
import { dailyChallenge } from './challenge';

/** Each game's tile: its colour, a chip and a count. */
const TILE: Record<GameId, { colour: TrackColour; chip: string; count: string; line: string }> = {
  'be-the-algorithm': { colour: 'peach', chip: 'Sorting', count: `${SUPPORTED.length} algorithms`, line: 'Pick the swap it makes next' },
  'comparison-budget': { colour: 'sky', chip: 'Comparisons', count: `${MIN_CARDS} to ${MAX_CARDS} cards`, line: 'Sort face-down cards within the bound' },
  'break-it': { colour: 'rose', chip: 'Worst cases', count: '3 challenges', line: 'Find the input that makes it fail' },
};

/** Earned badges take a pastel each, in turn. */
const BADGE_COLOURS: TrackColour[] = ['butter', 'mint', 'peach', 'lilac', 'sky', 'rose', 'teal'];

const LEVELS_SHOWN = 6;

/**
 * The Play hub: today's challenge, Mastery XP, the three games, levels per
 * concept and badges. Everything about the learner comes from their events and
 * waits for the progress store, so the server render shows the games alone.
 */
export function PlayHub({ graph }: { graph: MasteryGraph }) {
  const { ready, events } = useProgressSnapshot();
  const now = useMinute();
  const play = usePlay(graph);
  const m = useMastery(graph);
  const cards = useReviewCards();
  const loaded = ready && !!now;
  const { total, today } = loaded ? xpTotals(play.ledger, now) : { total: 0, today: 0 };
  const items = loaded ? dailyChallenge({ events, cards, mastery: m, graph, now }) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="daily" className="flex flex-col gap-3 rounded-card bg-track-butter p-5 text-track-butter-ink sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="daily" className="font-semibold text-track-butter-title">
                Today’s challenge
              </h2>
              {loaded && (
                <span className="text-[13px] font-semibold">
                  {items.filter((i) => i.done).length} of {items.length} done
                </span>
              )}
            </div>
            {loaded ? (
              <ul className="flex flex-col gap-2">
                {items.map((it) => (
                  <li key={it.text} className="flex items-center gap-3 rounded-well bg-surface px-3.5 py-3 text-ink">
                    {it.done ? (
                      <span role="img" aria-label="done" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                        <FiCheck aria-hidden strokeWidth={3} className="size-3.5" />
                      </span>
                    ) : (
                      <span role="img" aria-label="to do" className="size-7 shrink-0 rounded-full border-2 border-dashed border-line-strong" />
                    )}
                    <span className={cx('min-w-0 flex-1 text-[15px] font-semibold', it.done && 'text-ink-muted line-through')}>{it.text}</span>
                    {!it.done && (
                      <ButtonLink href={it.href} size="s">
                        {it.cta}
                      </ButtonLink>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="text-sm">
                Loading your progress…
              </p>
            )}
          </section>

          <ul aria-label="Games" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {GAMES.map((g) => {
              const t = TILE[g.id];
              return (
                <li key={g.id} className="flex">
                  <TrackCardLink track={t.colour} href={g.href} dense className="min-h-[200px] w-full gap-3">
                    <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-surface/70 px-2.5 py-1">{t.chip}</span>
                      <span>{t.count}</span>
                    </span>
                    <strong className={cx('mt-auto font-display text-[24px] leading-[1.1] font-bold', trackTitle(t.colour))}>{g.title}</strong>
                    <span className="text-sm">{t.line}</span>
                  </TrackCardLink>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <FeatureCard aria-labelledby="xp" className="gap-3">
            <h2 id="xp" className="text-[13px] font-semibold tracking-[0.06em] text-feature-muted uppercase">
              Mastery XP
            </h2>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-[72px] leading-none font-bold tracking-[-0.03em] tabular-nums">{loaded ? total.toLocaleString() : '–'}</span>
              <span className="text-lg font-bold">XP</span>
            </p>
            {loaded && (
              <p className="flex flex-wrap gap-2 text-[13px] font-semibold">
                <span className={cx('rounded-full px-2.5 py-1', today > 0 ? 'bg-good-soft text-good-ink' : 'bg-on-feature/10')}>{today > 0 ? `+${today} today` : 'None yet today'}</span>
                <span className="rounded-full bg-on-feature/10 px-2.5 py-1">
                  {play.badges.size} of {BADGES.length} badges
                </span>
              </p>
            )}
            <p className="text-sm text-feature-muted">XP counts what you can do and remember, not how long you spent. No streaks to lose, nothing to buy.</p>
          </FeatureCard>
          {loaded && <Levels graph={graph} levels={play.levels} />}
        </div>
      </div>

      {loaded && <Badges earned={play.badges} />}

      <details className="group rounded-card bg-surface px-6 py-4 text-sm text-ink-soft">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <FiChevronRight aria-hidden className="transition-transform duration-150 ease-standard group-open:rotate-90" />
          How XP works
        </summary>
        <ul className="mt-3 mb-2 flex list-disc flex-col gap-1.5 pl-9 leading-relaxed">
          <li>XP is for learning that sticks: questions right first time, cards remembered a day, a week and a month later, first solves, explanations that cover their key points, and mistakes you clear.</li>
          <li>Games earn XP for moves and wins, less for replaying the same thing on the same day, and a broken challenge pays once.</li>
          <li>Watching, reading, marking lessons done and time spent earn nothing. There are no streaks to lose and nothing to buy.</li>
        </ul>
      </details>
    </div>
  );
}

type Play = ReturnType<typeof usePlay>;

function Levels({ graph, levels }: { graph: MasteryGraph; levels: Play['levels'] }) {
  const [all, setAll] = useState(false);
  const started = graph.concepts.filter((c) => (levels.get(c.id)?.size ?? 0) > 0);
  const shown = all ? started : started.slice(0, LEVELS_SHOWN);
  return (
    <Card aria-labelledby="levels" className="gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="levels" className="font-semibold">
          Levels
        </h2>
        <span className="text-xs text-ink-muted">{LEVELS.map((l) => l.label).join(' · ')}</span>
      </div>
      {started.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Levels appear as you answer questions, play rounds, write code and explain ideas.{' '}
          <Link href="/learn" className="font-semibold text-accent-ink underline underline-offset-2">
            Start on the path
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((c) => {
            const reached = levels.get(c.id)!;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <Link href={conceptHref(c)} className="min-w-0 truncate text-[15px] font-semibold text-ink hover:text-accent-ink">
                  {c.title}
                </Link>
                <span className="flex shrink-0 gap-1.5" role="img" aria-label={`${c.title}: ${LEVELS.filter((l) => reached.has(l.id)).map((l) => l.label).join(', ') || 'no levels yet'}`}>
                  {LEVELS.map((l) => (
                    <span
                      key={l.id}
                      title={`${l.label}${reached.has(l.id) ? '' : `: ${l.hint}`}`}
                      className={cx(
                        'grid size-8 place-items-center rounded-full font-mono text-xs font-bold',
                        reached.has(l.id) ? 'bg-track-lilac-ink text-track-lilac' : 'border-[1.5px] border-dashed border-track-lilac-ink text-track-lilac-ink',
                      )}
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
      {started.length > LEVELS_SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="w-fit text-sm font-semibold text-accent-ink hover:underline">
          {all ? 'Show fewer' : `Show all ${started.length}`}
        </button>
      )}
      <p className="text-xs text-ink-muted">Levels come in any order: there is nothing to implement in Bayes’ rule.</p>
    </Card>
  );
}

function Badges({ earned }: { earned: Play['badges'] }) {
  const colour = new Map(BADGES.filter((b) => earned.has(b.id)).map((b, i) => [b.id, BADGE_COLOURS[i % BADGE_COLOURS.length]]));
  return (
    <section aria-labelledby="badges" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="badges" className="font-display text-title-section">
          Badges
        </h2>
        <p className="text-[13px] text-ink-muted">They mark good learning habits. None is required for anything.</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
        {BADGES.map((b) => {
          const at = earned.get(b.id);
          const c = at ? TRACK_CLASSES[colour.get(b.id)!] : null;
          return (
            <li
              key={b.id}
              data-badge={b.id}
              data-earned={!!at}
              className={cx('flex flex-col gap-1.5 rounded-tile p-4', c ? cx(c.bg, c.ink) : 'bg-surface text-ink-muted')}
            >
              <span aria-hidden className={cx('mb-1.5 flex size-10 items-center justify-center rounded-full', c ? 'bg-surface/70' : 'bg-sunken')}>
                <FiAward className="size-5" />
              </span>
              <p className={cx('font-bold', c ? c.title : 'text-ink')}>{b.title}</p>
              <p className="text-xs leading-snug">{b.how}</p>
              <p className={cx('text-xs', at && 'font-semibold')}>{at ? `Earned ${new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Not yet'}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
