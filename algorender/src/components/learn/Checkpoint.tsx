'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FiArrowRight } from 'react-icons/fi';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { ProgressBar } from '@/components/ui/Numbers';
import { useMinute } from '@/lib/now';
import {
  buildRound,
  canOpen,
  canTake,
  CHECKPOINT_MIN,
  latestRounds,
  MINUTES_PER_QUESTION,
  mistakesMade,
  retakeFrom,
  ROUND_SIZE,
  type CheckpointPools,
  type CheckpointQuestion,
  type CheckpointRound,
} from '@/progress/checkpoint';
import { record, useProgressSnapshot } from '@/progress/hooks';

type Answer = { question: CheckpointQuestion; picked: number | null; correct: boolean };

const dateText = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * A stage's checkpoint: a short mixed round (src/progress/checkpoint.ts),
 * each answer recorded as it is given. It advises, never blocks: the result
 * says what is worth another look, and the round can be taken again a week on.
 */
export function Checkpoint({ pools, titles, covered }: { pools: CheckpointPools; titles: Record<string, string>; covered: string[] }) {
  const { ready, events } = useProgressSnapshot();
  const now = useMinute();
  const [phase, setPhase] = useState<'intro' | 'asking' | 'done'>('intro');
  const [round, setRound] = useState<CheckpointQuestion[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const last = useMemo(() => latestRounds(events).get(pools.stage), [events, pools.stage]);
  const size = Math.min(ROUND_SIZE, pools.probes.length + pools.quiz.length + pools.earlier.length);

  const start = () => {
    const seed = events.filter((e) => e.kind === 'checkpoint.answered' && e.data.stage === pools.stage).length + pools.stage * 1009;
    setRound(buildRound(pools, mistakesMade(events), seed));
    setAnswers([]);
    setPhase('asking');
  };

  if (!canOpen(pools)) {
    return (
      <Card className="gap-4 rounded-[36px] p-6 sm:p-8">
        <h2 className="font-display text-title-section">Not open yet</h2>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          A checkpoint needs at least {CHECKPOINT_MIN} questions about its stage, and this stage’s lessons are still being written. It opens on its own once they are.
        </p>
        <ButtonLink href="/learn" kind="secondary" className="self-start">
          See the path
        </ButtonLink>
      </Card>
    );
  }

  if (phase === 'asking') return <Asking stage={pools.stage} round={round} titles={titles} onDone={(a) => (setAnswers(a), setPhase('done'))} />;
  if (phase === 'done') return <Results answers={answers} titles={titles} onAgain={() => setPhase('intro')} />;

  const allowed = ready && now != null && canTake(last, now);
  const from = retakeFrom(last);
  return (
    <Card className="gap-6 rounded-[36px] p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-title-section">
          {size} questions, about {Math.max(5, Math.round(size * MINUTES_PER_QUESTION))} minutes
        </h2>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Mostly questions about common mistakes that the lessons don’t ask, so they test whether the ideas carry over
          {pools.earlier.length > 0 ? ', and a few from earlier stages to see what has stuck' : ''}. It doesn’t block anything: the result says what is worth another look.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-[15px] font-semibold">It covers</h3>
        <ul className="flex flex-wrap gap-2">
          {covered.map((id) => (
            <li key={id} className="rounded-full bg-sunken px-3 py-1.5 text-[13px] font-semibold text-ink-soft">
              {titles[id] ?? id}
            </li>
          ))}
        </ul>
      </div>
      {last && <LastRound last={last} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
        <p className="text-sm text-ink-muted" aria-live="polite">
          {!ready ? 'Loading your progress…' : last && !allowed && from ? `You can take it again from ${dateText(from)}.` : last ? 'A week has passed: take it again to see what has stuck.' : 'Answer “Not sure” rather than guess.'}
        </p>
        <Button size="l" disabled={!allowed} onClick={start} trailing={<FiArrowRight aria-hidden />}>
          {last ? 'Take it again' : 'Start'}
        </Button>
      </div>
    </Card>
  );
}

function LastRound({ last }: { last: CheckpointRound }) {
  return (
    <div className="flex flex-col gap-2 rounded-tile bg-accent-soft p-5 text-accent-ink">
      <p className="text-[15px] font-semibold">
        Last time: {last.right} of {last.of} right, on {dateText(new Date(last.at))}
      </p>
      <ProgressBar value={last.of ? last.right / last.of : 0} label={`${last.right} of ${last.of} right`} track="bg-surface" />
    </div>
  );
}

function Asking({ stage, round, titles, onDone }: { stage: number; round: CheckpointQuestion[]; titles: Record<string, string>; onDone: (answers: Answer[]) => void }) {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [picked, setPicked] = useState<number | null | undefined>(undefined);
  const index = answers.length;
  const q = round[index];
  const done = picked !== undefined;
  const right = picked === q.answer;
  const trap = picked != null ? q.traps?.[picked] : undefined;

  const answer = (choice: number | null) => {
    if (done) return;
    const correct = choice === q.answer;
    record('checkpoint.answered', { stage, concept: q.concept, item: q.item, correct, index, of: round.length });
    const t = choice != null ? q.traps?.[choice] : undefined;
    // A wrong answer that comes from a common mistake starts that mistake in the review queue.
    if (t) record('misconception.picked', { lesson: q.lesson, misconception: t.id, from: 'quiz' });
    setPicked(choice);
  };

  const next = () => {
    const all = [...answers, { question: q, picked: picked ?? null, correct: right }];
    if (all.length === round.length) {
      onDone(all);
      return;
    }
    setAnswers(all);
    setPicked(undefined);
  };

  return (
    <Card className="gap-6 rounded-[36px] p-6 sm:p-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-accent-ink">
            {titles[q.concept] ?? q.concept} · question {index + 1} of {round.length}
          </p>
          <ProgressBar value={index / round.length} label={`${index} of ${round.length} answered`} className="w-32" />
        </div>
        <h2 className="font-display text-[clamp(24px,2.6vw,36px)] leading-[1.12] font-bold tracking-[-0.02em]">{q.q}</h2>
      </div>
      <div className="flex flex-col gap-3" role="group" aria-label="Choices">
        {q.choices.map((c, ci) => {
          const state = !done ? 'open' : ci === q.answer ? 'right' : ci === picked ? 'wrong' : 'other';
          return (
            <button
              key={ci}
              type="button"
              disabled={done}
              onClick={() => answer(ci)}
              className={cx(
                'flex min-h-16 items-center gap-4 rounded-[22px] px-5 py-3 text-left text-[15px] font-semibold ring-inset transition-colors duration-150 ease-standard',
                state === 'open' && 'ring-[1.5px] ring-line hover:ring-2 hover:ring-accent',
                state === 'right' && 'bg-good-soft text-good-title ring-2 ring-primary',
                state === 'wrong' && 'bg-bad-soft text-bad-title ring-[1.5px] ring-bad-line',
                state === 'other' && 'text-ink-muted ring-[1.5px] ring-line-soft',
              )}
            >
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-[13px] text-ink-soft">
                {ci + 1}
              </span>
              {c}
            </button>
          );
        })}
      </div>
      {done && (
        <Alert tone={right ? 'good' : picked === null ? 'warn' : 'bad'} title={right ? 'Right.' : picked === null ? 'No problem.' : trap ? `That’s a common mistake: ${trap.title.replace(/\.$/, '')}.` : 'Not quite.'}>
          {q.why}
          {trap && (
            <>
              {' '}
              <Link href={`/learn/${q.lesson}#mistake-${trap.id}`} className="font-semibold underline underline-offset-2">
                Read the correction
              </Link>
              ; it’s in your review now.
            </>
          )}
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
        {!done ? (
          <button type="button" onClick={() => answer(null)} className="rounded-full px-1 py-2 text-[15px] font-semibold text-accent-ink underline underline-offset-4">
            Not sure
          </button>
        ) : (
          <span />
        )}
        {done && (
          <Button autoFocus size="l" onClick={next} trailing={<FiArrowRight aria-hidden />}>
            {index + 1 === round.length ? 'See how it went' : 'Next'}
          </Button>
        )}
      </div>
    </Card>
  );
}

function Results({ answers, titles, onAgain }: { answers: Answer[]; titles: Record<string, string>; onAgain: () => void }) {
  const right = answers.filter((a) => a.correct).length;
  const concepts = [...new Set(answers.map((a) => a.question.concept))];
  const tally = (id: string) => {
    const mine = answers.filter((a) => a.question.concept === id);
    return { right: mine.filter((a) => a.correct).length, of: mine.length };
  };
  const shaky = concepts.filter((id) => tally(id).right < tally(id).of);
  return (
    <Card className="gap-6 rounded-[36px] p-6 sm:p-8" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-title-section sm:text-[32px]">
          Done: {right} of {answers.length} right
        </h2>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/plan">Back to the plan</ButtonLink>
          <ButtonLink href="/learn" kind="secondary">
            See the path
          </ButtonLink>
        </div>
      </div>
      <ul className="flex flex-col gap-3" aria-label="By concept">
        {concepts.map((id) => {
          const t = tally(id);
          return (
            <li key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-sunken px-4 py-3">
              <span className="text-[15px] font-semibold">{titles[id] ?? id}</span>
              <span className="flex items-center gap-3 text-sm text-ink-soft">
                {t.right} of {t.of}
                <ProgressBar value={t.right / t.of} label={`${titles[id] ?? id}: ${t.right} of ${t.of} right`} className="w-24" />
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 rounded-tile bg-accent-soft p-5 text-accent-ink">
        {shaky.length ? (
          <>
            <p className="text-[15px] font-semibold">Worth another look</p>
            <ul className="flex flex-wrap gap-2">
              {shaky.map((id) => (
                <li key={id}>
                  <Link href={`/learn?concept=${id}`} className="inline-flex rounded-full bg-surface px-3 py-1.5 text-[13px] font-semibold text-accent-ink hover:underline">
                    {titles[id] ?? id}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-[13px]">Mistakes you picked are in your review now; it asks about them again over the next days.</p>
          </>
        ) : (
          <p className="text-[15px] font-semibold">Every concept held up. Take it again in a week to check it has stuck.</p>
        )}
      </div>
      <button type="button" onClick={onAgain} className="self-start rounded-full px-1 py-1 text-sm font-semibold text-accent-ink hover:underline">
        Back to the checkpoint
      </button>
    </Card>
  );
}
