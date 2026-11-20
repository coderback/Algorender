'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FiArrowRight, FiBookOpen, FiCheck, FiCheckCircle, FiX, FiXCircle } from 'react-icons/fi';
import type { Grade } from 'ts-fsrs';
import { useXp } from '@/components/shell/hooks';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DifficultyChip, type Difficulty } from '@/components/ui/Chip';
import { Kbd } from '@/components/ui/CodeBlock';
import { TRACK_CLASSES, trackColour } from '@/data/tracks';
import { choiceOrder } from '@/lib/choices';
import { useMinute } from '@/lib/now';
import type { ProgressEvent } from '@/progress/events';
import { record, useProgressSnapshot, useReviewCards } from '@/progress/hooks';
import { CLEAR_AFTER } from '@/progress/misconceptions';
import { dueToday, endOfDay, GRADE_LABEL, intervals, nextDue, upcoming, type ReviewCard } from '@/progress/review';
import { checkTyped, type TaskVerdict } from '@/tasks/check';
import type { TaskLanguage } from '@/tasks/schema';
import { OutputDiff } from '@/tasks/ui/OutputDiff';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { TextAreaField } from '@/components/ui/Field';
import { LANGUAGES } from '@/workspace/protocol';

/** What a card shows. Built on the server (src/app/(focused)/review/page.tsx). */
export type CardFace = (
  | {
      id: string;
      kind: 'problem';
      slug: string;
      title: string;
      summary: string;
      pattern: string;
      difficulty: Difficulty;
      why: string;
      /** The approach, rendered. */
      approach: ReactNode;
      complexity: string;
    }
  | { id: string; kind: 'quiz'; lesson: string; lessonTitle: string; q: string; choices: string[]; answer: number; why: string }
  | {
      id: string;
      kind: 'misconception';
      lesson: string;
      lessonTitle: string;
      /** The mistake's name: shown only after answering, so it doesn't give the question away. */
      title: string;
      /** The lesson's correction, rendered. */
      correction: ReactNode;
      /** Questions that test for the mistake, asked in turn. */
      probes: { q: string; choices: string[]; answer: number; why: string }[];
    }
  | {
      id: string;
      kind: 'output';
      /** The task (src/content/tasks), and its topic's lesson. */
      slug: string;
      title: string;
      lesson?: string;
      language: TaskLanguage;
      stdin: string;
      /** The snippet's variants, each with what it prints; a review asks the next one along. */
      variants: { code: string; output: string }[];
    }
) & {
  /** The concept or pattern it's about, for its chip. */
  topic: string;
  /** Its concept-map track, for the chip's colour. */
  track: string;
};

const KIND_TEXT: Record<CardFace['kind'], string> = { problem: 'Problem', quiz: 'Quiz', misconception: 'Common mistake', output: 'Prediction' };
const SEEN_TEXT: Record<CardFace['kind'], string> = { problem: 'Solved', quiz: 'Answered', misconception: 'First made', output: 'First predicted' };

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
const ago = (when: Date, now: Date) => {
  const n = daysBetween(when, now);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
};
const daysText = (n: number) => (n === 1 ? '1 day' : n < 30 ? `${n} days` : n < 365 ? `${Math.round(n / 30)} mo` : `${(n / 365).toFixed(1)} yr`);

/** How many cards one round of "Practise ahead" offers. */
const AHEAD = 10;

/** A rough guide for "about N minutes" of review. */
const SECONDS_PER_CARD = 30;

const GRADE_STYLE: Record<Grade, { button: string; square: string }> = {
  1: { button: 'bg-bad-soft text-bad-ink', square: 'bg-grade-again' },
  2: { button: 'bg-warn-soft text-warn-ink', square: 'bg-grade-hard' },
  3: { button: 'bg-good-soft text-good-ink', square: 'bg-grade-good' },
  4: { button: 'bg-accent-soft text-accent-ink', square: 'bg-grade-easy' },
};

/** Ratings given today, in order. */
function ratedToday(events: readonly ProgressEvent[], now: Date): { card: string; rating: Grade }[] {
  const from = startOfDay(now).getTime();
  const out: { card: string; rating: Grade }[] = [];
  for (const e of events) if (e.kind === 'review.rated' && new Date(e.at).getTime() >= from) out.push({ card: e.data.card, rating: e.data.rating as Grade });
  return out;
}

/**
 * Today's review: one due card at a time, on a full-bleed page. A problem
 * card asks the learner to recall the pattern and key idea, then rate how
 * well they did; a quiz card asks its question again and is rated from the
 * answer, and so does a card for a common mistake, which asks the next of the
 * questions that test for it. Every rating is an event, so the queue syncs
 * and works offline.
 */
export function ReviewQueue({ faces }: { faces: CardFace[] }) {
  const { ready, events } = useProgressSnapshot();
  const cards = useReviewCards();
  const now = useMinute();
  const byId = useMemo(() => new Map(faces.map((f) => [f.id, f])), [faces]);

  // The cards picked by "Practise ahead", once today's are done; each leaves the round once rated.
  const [ahead, setAhead] = useState<string[] | null>(null);

  const loading = !ready || !now;
  const known = (id: string) => byId.has(id);
  const due = loading ? [] : dueToday(cards, now, known);
  const today = loading ? [] : ratedToday(events, now);
  const done = today.length;
  // A card rated today never comes round again today, so an Again while practising ahead waits for tomorrow.
  const ratedIds = new Set(today.map((t) => t.card));
  const early = loading ? [] : upcoming(cards, now, known).filter((c) => !ratedIds.has(c.id));
  const aheadLeft = due.length === 0 && ahead ? ahead.map((id) => cards.get(id)).filter((c): c is ReviewCard => !!c && !ratedIds.has(c.id)) : [];
  const queue = due.length > 0 ? due : aheadLeft;

  let body: ReactNode;
  if (loading) {
    body = (
      <p role="status" className="mt-10 text-track-butter-title">
        Loading your cards…
      </p>
    );
  } else if (cards.size === 0) body = <NoCards />;
  else if (queue.length === 0)
    body = <AllDone reviewed={done} cards={cards} now={now} early={early.length} onAhead={() => setAhead(early.slice(0, AHEAD).map((c) => c.id))} />;
  else {
    const card = queue[0];
    body = (
      <Session
        key={card.id}
        face={byId.get(card.id)!}
        card={card}
        now={now}
        events={events}
        today={today}
        ahead={due.length === 0}
        onRate={(grade) => record('review.rated', { card: card.id, rating: grade })}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-review-page text-ink">
      <Header done={done} total={done + queue.length} />
      <main className="flex flex-1 flex-wrap items-start justify-center gap-6 px-4 pt-2 pb-10 sm:px-6">{body}</main>
    </div>
  );
}

function Header({ done, total }: { done: number; total: number }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-6">
      <Link
        href="/"
        aria-label="Close review, back to Today"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-review-card text-ink sm:size-12"
      >
        <FiX aria-hidden className="size-5" />
      </Link>
      <h1 className="sr-only font-display text-[22px] font-bold text-track-butter-title sm:not-sr-only">Daily review</h1>
      <div className="flex min-w-0 flex-[1_1_200px] items-center gap-3">
        <div
          role="progressbar"
          aria-label="Review progress"
          aria-valuemin={0}
          aria-valuemax={Math.max(total, 1)}
          aria-valuenow={done}
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-review-track"
        >
          <div className="h-full rounded-full bg-review-progress transition-[width] duration-300 ease-standard" style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }} />
        </div>
        <span className="font-mono text-sm font-semibold text-track-butter-title tabular-nums">
          {done} / {total}
        </span>
      </div>
      <span className="hidden text-sm text-track-butter-title sm:inline">Works offline</span>
    </header>
  );
}

function Session({
  face,
  card,
  now,
  events,
  today,
  ahead,
  onRate,
}: {
  face: CardFace;
  card: ReviewCard;
  now: Date;
  events: readonly ProgressEvent[];
  today: { card: string; rating: Grade }[];
  /** Practising ahead: the card isn’t due yet. */
  ahead: boolean;
  onRate: (g: Grade) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [predicted, setPredicted] = useState<TaskVerdict | null>(null);
  const days = intervals(card.card, now);
  // What a multiple-choice card asks: a quiz card its question, a mistake card its next probe.
  const question = face.kind === 'quiz' ? face : face.kind === 'misconception' ? face.probes[card.reviews % face.probes.length] : null;
  // A prediction card shows the variant after the one last seen (the topic showed variant 0), so the output is new.
  const variant = face.kind === 'output' ? face.variants[(card.reviews + 1) % face.variants.length] : null;
  const answered = question ? picked !== null : predicted !== null;
  const right = question ? picked === question.answer : predicted?.passed === true;
  // A wrong answer can only be rated Again.
  const grades = useMemo<Grade[]>(() => (answered && !right ? [1] : question || variant ? [2, 3, 4] : [1, 2, 3, 4]), [question, variant, answered, right]);
  const showing = face.kind === 'problem' ? revealed : answered;

  // Keyboard: Space shows the answer, 1–4 rate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, button, a')) return;
      if (e.key === ' ' && face.kind === 'problem' && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (showing && /^[1-4]$/.test(e.key) && grades.includes(Number(e.key) as Grade)) {
        onRate(Number(e.key) as Grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [face.kind, revealed, showing, grades, onRate]);

  const track = TRACK_CLASSES[trackColour(face.track)];
  const kind = KIND_TEXT[face.kind];
  const born = new Date(card.born);
  const seen = `${SEEN_TEXT[face.kind]} ${ago(born, now)}`;
  const lastRating = [...events].reverse().find((e): e is Extract<ProgressEvent, { kind: 'review.rated' }> => e.kind === 'review.rated' && e.data.card === card.id)?.data.rating as Grade | undefined;

  return (
    <>
      <div className="flex min-w-0 flex-[0_1_760px] flex-col gap-4">
        <div className="relative pt-[18px]">
          <div aria-hidden className="absolute inset-x-10 top-0 h-15 rounded-card bg-review-ghost" />
          <div aria-hidden className="absolute inset-x-5 top-[9px] h-15 rounded-card bg-review-ghost" />
          <article
            aria-labelledby={`card-${face.id}`}
            className="relative flex min-h-[420px] flex-col gap-5 rounded-[36px] bg-review-card p-[clamp(24px,4vw,40px)] shadow-review"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap gap-2">
                <span className={clsx('rounded-full px-3 py-1 text-xs font-semibold', track.bg, track.ink)}>
                  {kind} · {face.topic}
                </span>
                {face.kind === 'problem' && <DifficultyChip level={face.difficulty} />}
              </div>
              <span className="text-[13px] text-ink-muted">{seen}</span>
            </div>

            {face.kind === 'problem' ? (
              <>
                <h2 id={`card-${face.id}`} className="font-display text-[clamp(30px,3.4vw,42px)] leading-[1.05] font-bold tracking-[-0.025em]">
                  {face.title}
                </h2>
                <p className="text-[17px] leading-relaxed text-ink-soft">{face.summary}</p>
                <p className="rounded-[20px] bg-review-well px-[18px] py-4 text-base font-semibold">Without looking: which pattern cracks it, and what’s the key idea?</p>
                {revealed && (
                  <div className="flex flex-col gap-3 border-t-2 border-dashed border-line pt-5">
                    <span className="text-eyebrow text-accent-ink uppercase">Answer</span>
                    <p className="text-lg font-semibold">{face.pattern}</p>
                    <p className="text-[17px] leading-relaxed">{face.why}</p>
                    <div className="text-ink-soft">{face.approach}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[10px] bg-review-well px-2.5 py-1.5 font-mono text-[13px]">{face.complexity}</span>
                      <Link href={`/practice/${face.slug}`} className="inline-flex items-center gap-1.5 px-1 py-1.5 text-sm font-semibold text-accent-ink hover:underline">
                        Solve it again <FiArrowRight aria-hidden />
                      </Link>
                    </div>
                  </div>
                )}
              </>
            ) : variant && face.kind === 'output' ? (
              <>
                <h2 id={`card-${face.id}`} className="font-display text-[clamp(26px,3vw,36px)] leading-[1.1] font-bold tracking-[-0.02em]">
                  What does this print?
                </h2>
                <p className="text-[15px] text-ink-soft">
                  {face.title}
                  {face.variants.length > 1 && ' · its values may differ from last time'}
                </p>
                <CodeBlock lines={variant.code.replace(/\n$/, '').split('\n')} label={`The ${LANGUAGES[face.language].label} program`} />
                {face.stdin && (
                  <p className="text-sm text-ink-soft">
                    Its input, line by line: <span className="font-mono">{face.stdin.replace(/\n$/, '').split('\n').join(' ⏎ ')}</span>
                  </p>
                )}
                <TextAreaField
                  label="What does it print?"
                  mono
                  rows={4}
                  value={typed}
                  readOnly={predicted !== null}
                  onChange={(e) => setTyped(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                />
                {predicted === null ? (
                  <button
                    type="button"
                    disabled={typed.trim() === ''}
                    onClick={() => setPredicted(checkTyped(typed, variant.output, face.stdin))}
                    className="h-12 self-start rounded-full bg-primary px-6 text-[15px] font-semibold text-on-primary transition-colors duration-150 ease-standard hover:bg-primary-hover disabled:opacity-50"
                  >
                    Check
                  </button>
                ) : (
                  <div aria-live="polite" className="flex flex-col gap-3" data-verdict={right ? 'passed' : 'failed'}>
                    <p className={clsx('rounded-well px-4 py-3 text-sm', right ? 'bg-good-soft text-good-title' : 'bg-bad-soft text-bad-title')}>
                      <span className="font-semibold">{right ? 'Right. ' : 'Not quite. '}</span>
                      {right ? 'That is exactly what it prints.' : 'Here is what it prints, beside what you typed.'}
                    </p>
                    {!right && <OutputDiff expected={variant.output} got={typed} />}
                    {face.lesson && (
                      <Link href={`/learn/${face.lesson}`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
                        Back to the topic <FiArrowRight aria-hidden />
                      </Link>
                    )}
                  </div>
                )}
              </>
            ) : question && (face.kind === 'quiz' || face.kind === 'misconception') ? (
              <>
                <h2 id={`card-${face.id}`} className="font-display text-[clamp(26px,3vw,36px)] leading-[1.1] font-bold tracking-[-0.02em]">
                  {question.q}
                </h2>
                <p className="text-[15px] text-ink-soft">
                  From {face.lessonTitle}
                  {face.kind === 'misconception' && ' · a mistake you made before'}
                </p>
                <div role="group" aria-label="Choices" className="flex flex-col gap-2.5">
                  {choiceOrder(question.q, question.choices.length).map((i) => {
                    const c = question.choices[i];
                    const state = picked === null ? 'open' : i === question.answer ? 'right' : i === picked ? 'wrong' : 'other';
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={picked !== null}
                        aria-pressed={picked === i}
                        onClick={() => setPicked(i)}
                        className={clsx(
                          'flex items-center justify-between gap-3 rounded-[18px] px-4 py-3.5 text-left text-[15px] font-medium transition-colors duration-150 ease-standard',
                          state === 'open' && 'bg-review-well hover:ring-[1.5px] hover:ring-accent hover:ring-inset',
                          state === 'right' && 'bg-good-soft font-semibold text-good-title ring-2 ring-good-ink ring-inset',
                          state === 'wrong' && 'bg-bad-soft text-bad-title',
                          state === 'other' && 'bg-review-well text-ink-muted',
                        )}
                      >
                        {c}
                        {state === 'right' && <FiCheckCircle aria-label="the right answer" className="size-5 shrink-0 text-good-ink" />}
                        {state === 'wrong' && <FiXCircle aria-label="your answer" className="size-5 shrink-0 text-bad-ink" />}
                      </button>
                    );
                  })}
                </div>
                {picked !== null && (
                  <p aria-live="polite" className={clsx('rounded-well px-4 py-3 text-sm', right ? 'bg-good-soft text-good-title' : 'bg-bad-soft text-bad-title')}>
                    <span className="font-semibold">{right ? 'Right. ' : 'Not quite. '}</span>
                    {question.why}
                  </p>
                )}
                {picked !== null && face.kind === 'misconception' && (
                  <div className="flex flex-col gap-1 rounded-well bg-warn-soft px-4 py-3 text-sm text-warn-title">
                    <p className="font-semibold">The mistake this checks: {face.title}</p>
                    {face.correction}
                    <Link href={`/learn/${face.lesson}`} className="mt-1 inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline">
                      Back to the lesson <FiArrowRight aria-hidden />
                    </Link>
                  </div>
                )}
              </>
            ) : null}
          </article>
        </div>

        {face.kind === 'problem' && !revealed && (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            aria-keyshortcuts="Space"
            className="flex h-16 items-center justify-center gap-3 rounded-full bg-primary text-[17px] font-semibold text-on-primary transition-colors duration-150 ease-standard hover:bg-primary-hover"
          >
            Show answer <Kbd tone="onPrimary">Space</Kbd>
          </button>
        )}

        {showing && (
          // On phones the grades stay pinned to the bottom, so a long answer never hides them.
          <div data-sticks="bottom-tall" className="flex flex-col gap-2.5 max-sm:sticky max-sm:bottom-0 max-sm:-mx-4 max-sm:bg-review-page max-sm:px-4 max-sm:pt-3 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <p className="text-center text-sm text-track-butter-title">{answered && !right ? 'It comes back tomorrow.' : 'How well did you remember it?'}</p>
            <div role="group" aria-label="Rate your recall" className={clsx('grid gap-2.5', grades.length === 1 ? 'grid-cols-1' : grades.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
              {grades.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onRate(g)}
                  aria-keyshortcuts={String(g)}
                  className={clsx('flex h-[76px] flex-col items-center justify-center gap-1 rounded-tile text-base font-semibold transition-transform duration-150 ease-standard hover:-translate-y-0.5', GRADE_STYLE[g].button)}
                >
                  {answered && !right ? 'Next' : GRADE_LABEL[g]}
                  <span className="text-xs font-medium opacity-90">
                    {daysText(days[g])} · {g}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside aria-label="About this card" className="hidden min-w-0 flex-[0_1_300px] flex-col gap-3 pt-[18px] md:flex">
        <section className="flex flex-col gap-2.5 rounded-[28px] bg-review-panel p-5">
          <h2 className="text-[13px] font-semibold tracking-[0.06em] text-track-butter-ink uppercase">Why this card now</h2>
          <p className="text-sm leading-relaxed text-track-butter-title">{whyNow(face, card, lastRating, now, ahead)}</p>
        </section>
        <section className="flex flex-col gap-3 rounded-[28px] bg-review-panel p-5">
          <h2 className="text-[13px] font-semibold tracking-[0.06em] text-track-butter-ink uppercase">Today so far</h2>
          {today.length > 0 ? (
            <div role="img" aria-label={tally(today)} className="flex flex-wrap gap-1.5">
              {today.map((t, i) => (
                <span key={i} className={clsx('size-[22px] rounded-[7px]', GRADE_STYLE[t.rating].square)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-track-butter-title">Nothing graded yet today.</p>
          )}
          <p className="text-[13px] text-track-butter-title">Each answer moves the card’s next date. Again brings it back tomorrow.</p>
        </section>
      </aside>
    </>
  );
}

function tally(today: { rating: Grade }[]): string {
  const counts = ([1, 2, 3, 4] as Grade[]).map((g) => [g, today.filter((t) => t.rating === g).length] as const).filter(([, n]) => n > 0);
  return `${today.length} ${today.length === 1 ? 'card' : 'cards'} graded today: ${counts.map(([g, n]) => `${n} ${GRADE_LABEL[g]}`).join(', ')}`;
}

function whyNow(face: CardFace, card: ReviewCard, lastRating: Grade | undefined, now: Date, ahead: boolean): string {
  if (ahead) {
    const date = card.card.due.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return `You’re practising ahead: it isn’t due until ${date}. An early review still helps, but it moves the card on less than one on time, since you’re less likely to have forgotten it yet.`;
  }
  const overdue = daysBetween(card.card.due, now);
  const timing = overdue > 0 ? `It was due ${overdue === 1 ? 'yesterday' : `${overdue} days ago`}, so it may be slipping.` : 'It’s due today, just before you’d start to forget it.';
  if (face.kind === 'misconception') return `You made this mistake ${ago(new Date(card.born), now)}. It keeps coming back until you answer right ${CLEAR_AFTER} times in a row.`;
  if (card.reviews === 0)
    return face.kind === 'problem'
      ? `You solved this ${ago(new Date(card.born), now)}. ${timing}`
      : 'A new card from a lesson. New cards come back quickly at first, then less and less often.';
  const last = card.card.last_review ? new Date(card.card.last_review) : new Date(card.born);
  return `You last reviewed this ${ago(last, now)}${lastRating ? ` and graded it ${GRADE_LABEL[lastRating]}` : ''}. ${timing}`;
}

function Done({ icon, title, children, actions }: { icon: ReactNode; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <section role="status" className="mt-6 flex max-w-[640px] flex-[0_1_640px] flex-col items-center gap-[18px] rounded-[40px] bg-review-card p-8 text-center sm:mt-10 sm:p-12">
      <span aria-hidden className="flex size-[88px] items-center justify-center rounded-full bg-primary text-review-page">
        {icon}
      </span>
      <h2 className="font-display text-[clamp(30px,4vw,44px)] leading-none font-bold tracking-[-0.03em]">{title}</h2>
      <div className="flex flex-col gap-1 text-[17px] leading-relaxed text-ink-soft">{children}</div>
      <div className="flex flex-wrap justify-center gap-2.5">{actions}</div>
    </section>
  );
}

/** Where cards come from, so an empty queue says how to fill it. */
function WhereCardsComeFrom() {
  return (
    <p className="text-[15px]">
      New cards come from what you do: each quiz question you answer in a lesson, each{' '}
      <Link href="/practice" className="font-semibold text-accent-ink underline underline-offset-2">
        practice problem
      </Link>{' '}
      you solve, each “What does it print?” task in a{' '}
      <Link href="/learn?area=languages" className="font-semibold text-accent-ink underline underline-offset-2">
        Python topic
      </Link>
      , and any common mistake you make.
    </p>
  );
}

function AllDone({ reviewed, cards, now, early, onAhead }: { reviewed: number; cards: Map<string, ReviewCard>; now: Date; early: number; onAhead: () => void }) {
  const xp = useXp();
  const tomorrow = new Date(endOfDay(now).getTime() + 1);
  const dueTomorrow = dueToday(cards, tomorrow).length;
  const next = nextDue(cards, now);
  const round = Math.min(early, AHEAD);
  return (
    <Done
      icon={<FiCheck className="size-10" strokeWidth={2.5} />}
      title={reviewed > 0 ? `All done for today: ${reviewed} reviewed.` : 'Nothing due today.'}
      actions={
        <>
          {round > 0 && (
            <Button size="l" onClick={onAhead}>
              Practise ahead
            </Button>
          )}
          <ButtonLink href="/learn" kind={round > 0 ? 'secondary' : 'primary'} size="l">
            Keep learning
          </ButtonLink>
          <ButtonLink href="/" kind="ghost" size="l">
            Back to Today
          </ButtonLink>
        </>
      }
    >
      {reviewed > 0 && xp && xp.today > 0 && <p className="font-semibold text-ink">+{xp.today} XP today.</p>}
      <p>
        {dueTomorrow > 0
          ? `Tomorrow: ${dueTomorrow} ${dueTomorrow === 1 ? 'card' : 'cards'}, about ${Math.max(1, Math.round((dueTomorrow * SECONDS_PER_CARD) / 60))} min.`
          : next
            ? `The next card is due ${next.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`
            : ''}
      </p>
      <p>
        You have {cards.size} {cards.size === 1 ? 'card' : 'cards'} in all.
        {round > 0 && ` Practise ahead asks the ${round === 1 ? 'one' : round} due soonest now, before ${round === 1 ? 'it’s' : 'they’re'} due.`}
      </p>
      <WhereCardsComeFrom />
    </Done>
  );
}

function NoCards() {
  return (
    <Done
      icon={<FiBookOpen className="size-9" />}
      title="No cards yet"
      actions={
        <>
          <ButtonLink href="/practice" size="l">
            Solve a problem
          </ButtonLink>
          <ButtonLink href="/learn" kind="secondary" size="l">
            Take a lesson
          </ButtonLink>
        </>
      }
    >
      <p>
        Cards arrive as you learn: every practice problem you solve, every quiz question you answer in a lesson, and every “What does it print?” task in a Python topic comes back here a few
        days later, then less and less often as it sticks. A common mistake you make comes back until you’ve cleared it.
      </p>
    </Done>
  );
}
