'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FiArrowRight, FiCheckCircle, FiLoader, FiXCircle } from 'react-icons/fi';
import type { Grade } from 'ts-fsrs';
import { useMinute } from '@/lib/now';
import { record, useProgressSnapshot, useReviewCards } from '@/progress/hooks';
import { dueToday, GRADE_LABEL, intervals, nextDue, type ReviewCard } from '@/progress/review';

/** What a card shows. Built on the server (src/app/review/page.tsx). */
export type CardFace =
  | {
      id: string;
      kind: 'problem';
      slug: string;
      title: string;
      summary: string;
      pattern: string;
      why: string;
      /** The approach, rendered. */
      approach: ReactNode;
      complexity: string;
    }
  | { id: string; kind: 'quiz'; lesson: string; lessonTitle: string; q: string; choices: string[]; answer: number; why: string };

/**
 * Today's review: one due card at a time. A problem card asks the learner to
 * recall the pattern and key idea, then rate how well they did; a quiz card
 * asks its question again and is rated from the answer. Every rating is an
 * event, so the queue syncs and works offline.
 */
export function ReviewQueue({ faces }: { faces: CardFace[] }) {
  const { ready } = useProgressSnapshot();
  const cards = useReviewCards();
  const now = useMinute();
  const byId = useMemo(() => new Map(faces.map((f) => [f.id, f])), [faces]);
  const [reviewed, setReviewed] = useState(0);

  if (!ready || !now) {
    return (
      <p className="flex items-center gap-2 text-ink-soft" role="status">
        <FiLoader aria-hidden className="animate-spin" /> Loading your cards…
      </p>
    );
  }

  const due = dueToday(cards, now, (id) => byId.has(id));
  if (cards.size === 0) return <NoCards />;
  if (due.length === 0) return <AllDone reviewed={reviewed} next={nextDue(cards, now)} total={cards.size} />;

  const card = due[0];
  const rate = (grade: Grade) => {
    record('review.rated', { card: card.id, rating: grade });
    setReviewed((n) => n + 1);
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft" role="status">
        {due.length} {due.length === 1 ? 'card' : 'cards'} left today{reviewed > 0 ? ` · ${reviewed} done` : ''}
      </p>
      <Card key={card.id} face={byId.get(card.id)!} card={card} now={now} onRate={rate} />
    </div>
  );
}

function Card({ face, card, now, onRate }: { face: CardFace; card: ReviewCard; now: Date; onRate: (g: Grade) => void }) {
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const days = intervals(card.card, now);
  const right = face.kind === 'quiz' && picked === face.answer;
  // A wrong quiz answer can only be rated Again.
  const grades = useMemo<Grade[]>(() => (face.kind === 'quiz' && picked !== null && !right ? [1] : face.kind === 'quiz' ? [2, 3, 4] : [1, 2, 3, 4]), [face.kind, picked, right]);
  const showing = face.kind === 'problem' ? revealed : picked !== null;

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

  return (
    <article aria-labelledby={`card-${face.id}`} className="space-y-4 rounded-xl border border-line-soft bg-surface p-5 shadow-xs">
      {face.kind === 'problem' ? (
        <>
          <header>
            <p className="text-xs font-semibold tracking-wider text-accent-ink uppercase">Problem you solved</p>
            <h2 id={`card-${face.id}`} className="mt-1 text-xl font-semibold text-ink">
              {face.title}
            </h2>
            <p className="mt-1 text-ink-soft">{face.summary}</p>
          </header>
          <p className="rounded-lg bg-subtle px-4 py-3 text-sm text-ink">
            Without looking: which pattern cracks it, and what is the key idea? Say it, or jot it down, then check.
          </p>
          {revealed ? (
            <div className="space-y-2 border-t border-line-soft pt-4 text-sm">
              <p className="font-semibold text-ink">{face.pattern}</p>
              <p className="text-ink-soft">{face.why}</p>
              {face.approach}
              <p className="text-ink-soft">{face.complexity}</p>
              <Link href={`/practice/${face.slug}`} className="inline-flex items-center gap-1 text-accent-ink hover:underline">
                Solve it again <FiArrowRight aria-hidden />
              </Link>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              aria-keyshortcuts="Space"
              autoFocus
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
            >
              Show the answer
            </button>
          )}
        </>
      ) : (
        <>
          <header>
            <p className="text-xs font-semibold tracking-wider text-accent-ink uppercase">From {face.lessonTitle}</p>
            <h2 id={`card-${face.id}`} className="mt-1 text-lg font-semibold text-ink">
              {face.q}
            </h2>
          </header>
          <div role="group" aria-label="Choices" className="grid gap-2 sm:grid-cols-2">
            {face.choices.map((c, i) => {
              const style =
                picked === null
                  ? 'border-line-strong hover:border-accent-line hover:bg-accent-soft'
                  : i === face.answer
                    ? 'border-good-line bg-good-soft text-good-ink'
                    : i === picked
                      ? 'border-bad-line bg-bad-soft text-bad-ink'
                      : 'border-line text-ink-muted';
              return (
                <button
                  key={i}
                  type="button"
                  disabled={picked !== null}
                  aria-pressed={picked === i}
                  onClick={() => setPicked(i)}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${style}`}
                >
                  {c}
                  {picked !== null && i === face.answer && <FiCheckCircle aria-label="the right answer" />}
                  {picked === i && i !== face.answer && <FiXCircle aria-label="your answer" />}
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <p className="text-sm text-ink-soft" aria-live="polite">
              <span className={`font-semibold ${right ? 'text-good-ink' : 'text-bad-ink'}`}>{right ? 'Right. ' : 'Not quite. '}</span>
              {face.why}
            </p>
          )}
        </>
      )}

      {showing && (
        <div className="border-t border-line-soft pt-4">
          <p className="mb-2 text-sm text-ink-soft">{face.kind === 'quiz' && !right ? 'It comes back tomorrow.' : 'How well did you remember it?'}</p>
          <div role="group" aria-label="Rate your recall" className="flex flex-wrap gap-2">
            {grades.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onRate(g)}
                aria-keyshortcuts={String(g)}
                className={`rounded-lg border px-3.5 py-2 text-sm font-medium ${
                  g === 1 ? 'border-bad-line text-bad-ink hover:bg-bad-soft' : g === 3 ? 'border-accent bg-accent text-white hover:bg-accent-strong' : 'border-line text-ink hover:bg-sunken'
                }`}
              >
                {face.kind === 'quiz' && !right ? 'Next' : GRADE_LABEL[g]}
                <span className={`ml-1.5 text-xs font-normal ${g === 3 ? 'text-white' : 'text-ink-muted'}`}>{daysText(days[g])}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Keys: {face.kind === 'problem' ? 'Space shows the answer, ' : ''}1 to 4 rate.</p>
        </div>
      )}
    </article>
  );
}

const daysText = (n: number) => (n === 1 ? '1 day' : n < 30 ? `${n} days` : n < 365 ? `${Math.round(n / 30)} mo` : `${(n / 365).toFixed(1)} yr`);

function NoCards() {
  return (
    <div className="space-y-3 rounded-xl border border-line-soft bg-surface p-5 shadow-xs">
      <h2 className="text-lg font-semibold text-ink">No cards yet</h2>
      <p className="text-ink-soft">
        Cards arrive as you learn: every practice problem you solve, and every quiz question you answer in a lesson, comes
        back here a few days later, then less and less often as it sticks.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/practice" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
          Solve a problem <FiArrowRight aria-hidden />
        </Link>
        <Link href="/learn" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
          Take a lesson <FiArrowRight aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function AllDone({ reviewed, next, total }: { reviewed: number; next: Date | null; total: number }) {
  return (
    <div className="space-y-2 rounded-xl border border-good-line bg-good-soft p-5" role="status">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-good-ink">
        <FiCheckCircle aria-hidden /> {reviewed > 0 ? `All done for today: ${reviewed} reviewed.` : 'Nothing due today.'}
      </h2>
      <p className="text-ink">
        {next ? `The next card is due ${next.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.` : ''} You have {total}{' '}
        {total === 1 ? 'card' : 'cards'} in all.
      </p>
    </div>
  );
}
