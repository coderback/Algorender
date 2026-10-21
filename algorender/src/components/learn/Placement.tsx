'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { FiArrowRight, FiCheck } from 'react-icons/fi';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, TrackCardLink, trackTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { cx } from '@/components/ui/cx';
import { trackLabel } from '@/data/tracks';
import { record, useMastery, useProgressSnapshot } from '@/progress/hooks';
import { nextSteps, type MasteryGraph, type PlacementAnswer } from '@/progress/mastery';
import { AREAS, areaOf, MAX_QUESTIONS, nextConcept, pickQuestion, settled, type AreaId, type PlacementQuestion } from '@/progress/placement';
import { conceptHref } from './Mastery';

type Asked = { question: PlacementQuestion; picked: number | null };

/** A line under each area's name. */
const AREA_HINT: Record<AreaId, string> = {
  dsa: 'Arrays to graphs',
  math: 'Vectors, gradients, probability',
  ml: 'Regression to transformers',
  systems: 'Scheduling, storage, consensus',
};

const STEPS = ['Areas', 'Questions', 'Where to start'] as const;

/** Where the check is: done steps get a tick, the current one is the dark pill. */
function Stepper({ at, aside, bare = false }: { at: number; aside?: ReactNode; bare?: boolean }) {
  // Inside the onboarding, its own stepper says where the learner is; only the aside stays.
  if (bare) return aside ? <div className="flex justify-end">{aside}</div> : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ol aria-label="Placement check steps" className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === at ? 'step' : undefined}
            className={cx('flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm font-semibold', i === at ? 'bg-primary text-on-primary' : 'bg-sunken text-ink-soft')}
          >
            <span className={cx('flex size-6 items-center justify-center rounded-full text-xs', i === at ? 'bg-on-primary text-primary' : 'bg-surface')}>
              {i < at ? <FiCheck aria-label="done" strokeWidth={3} /> : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      {aside}
    </div>
  );
}

/**
 * The placement check: pick areas, answer up to MAX_QUESTIONS adaptive
 * questions ("Not sure" is an honest answer, better than a guess), then see
 * what was placed out and where to start. Each answer is recorded as it is
 * given, so leaving halfway keeps what was learned.
 */
export function Placement({
  graph,
  questions,
  bare = false,
  initialAreas = ['dsa'],
  onFinish,
}: {
  graph: MasteryGraph;
  questions: Record<string, PlacementQuestion[]>;
  /** Inside another flow (the onboarding): no card and no stepper of its own. */
  bare?: boolean;
  initialAreas?: AreaId[];
  /** Offered on the results instead of the links to the path and the plan. */
  onFinish?: () => void;
}) {
  const [areas, setAreas] = useState<AreaId[]>(initialAreas);
  const Frame = bare ? BareFrame : CardFrame;
  const [phase, setPhase] = useState<'choose' | 'asking' | 'done'>('choose');
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [current, setCurrent] = useState<Asked | null>(null);
  const { events } = useProgressSnapshot();
  // A retake asks different questions where a concept has several.
  const seed = useRef(0);
  const available = useMemo(() => new Set(Object.keys(questions)), [questions]);
  const titleOf = useMemo(() => new Map(graph.concepts.map((c) => [c.id, c.title])), [graph]);

  const ask = (given: PlacementAnswer[]) => {
    const concept = nextConcept(graph, available, given, areas);
    if (!concept) {
      setCurrent(null);
      setPhase('done');
      return;
    }
    setCurrent({ question: pickQuestion(questions[concept], seed.current + given.length), picked: null });
  };

  const start = () => {
    seed.current = events.filter((e) => e.kind === 'placement.answered').length;
    setAnswers([]);
    setPhase('asking');
    ask([]);
  };

  const answer = (picked: number | 'unsure') => {
    if (!current || current.picked !== null) return;
    const q = current.question;
    const correct = picked === q.answer;
    record('placement.answered', { concept: q.concept, lesson: q.lesson, quiz: q.quiz, question: q.question, correct });
    // A wrong answer that comes from a common mistake starts that mistake in the review queue.
    const trap = picked === 'unsure' ? undefined : q.traps?.[picked];
    if (trap) record('misconception.picked', { lesson: q.lesson, misconception: trap, from: 'placement' });
    setAnswers((a) => [...a, { concept: q.concept, correct }]);
    setCurrent({ ...current, picked: picked === 'unsure' ? -1 : picked });
  };

  if (phase === 'choose') {
    return (
      <Frame>
        {!bare && <Stepper at={0} />}
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-4 font-display text-title-section">First: what do you want to learn?</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {AREAS.map((a) => {
              const on = areas.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={cx(
                    'flex cursor-pointer items-start gap-3 rounded-tile p-4 ring-inset transition-colors duration-150 ease-standard',
                    on ? 'bg-sunken ring-2 ring-primary' : 'ring-[1.5px] ring-line hover:ring-line-strong',
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]"
                    checked={on}
                    onChange={(e) => setAreas((xs) => (e.target.checked ? [...xs, a.id] : xs.filter((x) => x !== a.id)))}
                  />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold text-ink">{a.label}</span>
                    <span className="text-[13px] text-ink-muted">{AREA_HINT[a.id]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="text-sm leading-relaxed text-ink-soft">
          Up to {MAX_QUESTIONS} questions. Each right answer also counts for what that idea builds on, and each &ldquo;not sure&rdquo; skips what builds on it, so it stays short. Answer &ldquo;Not
          sure&rdquo; rather than guess: a lucky guess places you past things you&rsquo;d want to learn.
        </p>
        <Button size="l" className="self-end" disabled={areas.length === 0} onClick={start} trailing={<FiArrowRight aria-hidden />}>
          Start
        </Button>
      </Frame>
    );
  }

  if (phase === 'asking' && current) {
    const q = current.question;
    const done = current.picked !== null;
    const right = current.picked === q.answer;
    return (
      <Frame>
        <Stepper
          bare={bare}
          at={1}
          aside={
            answers.length > 0 &&
            !done && (
              <button type="button" onClick={() => setPhase('done')} className="rounded-full px-2 py-1 text-sm font-semibold text-ink hover:underline">
                Finish now
              </button>
            )
          }
        />
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-accent-ink">
            {titleOf.get(q.concept)} · question {answers.length + (done ? 0 : 1)} of at most {MAX_QUESTIONS}
          </p>
          <h2 className="font-display text-[clamp(24px,2.6vw,36px)] leading-[1.12] font-bold tracking-[-0.02em]">{q.q}</h2>
        </div>
        <div className="flex flex-col gap-3" role="group" aria-label="Choices">
          {q.choices.map((c, ci) => {
            const state = !done ? 'open' : ci === q.answer ? 'right' : ci === current.picked ? 'wrong' : 'other';
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
          <Alert tone={right ? 'good' : current.picked === -1 ? 'warn' : 'bad'} title={right ? 'Right.' : current.picked === -1 ? 'No problem.' : 'Not quite.'}>
            {q.why}
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
          {!done ? (
            <button type="button" onClick={() => answer('unsure')} className="rounded-full px-1 py-2 text-[15px] font-semibold text-accent-ink underline underline-offset-4">
              Not sure
            </button>
          ) : (
            <span />
          )}
          {done && (
            <Button autoFocus size="l" onClick={() => ask(answers)} trailing={<FiArrowRight aria-hidden />}>
              Next
            </Button>
          )}
        </div>
      </Frame>
    );
  }

  return <Results graph={graph} answers={answers} areas={areas} bare={bare} onFinish={onFinish} onRetake={() => setPhase('choose')} />;
}

function CardFrame({ children, ...rest }: { children: ReactNode; 'aria-live'?: 'polite' }) {
  return (
    <Card className="gap-6 rounded-[36px] p-6 sm:p-8" {...rest}>
      {children}
    </Card>
  );
}

function BareFrame({ children, ...rest }: { children: ReactNode; 'aria-live'?: 'polite' }) {
  return (
    <div className="flex flex-col gap-6" {...rest}>
      {children}
    </div>
  );
}

function Results({
  graph,
  answers,
  areas,
  bare,
  onFinish,
  onRetake,
}: {
  graph: MasteryGraph;
  answers: PlacementAnswer[];
  areas: AreaId[];
  bare: boolean;
  onFinish?: () => void;
  onRetake: () => void;
}) {
  const Frame = bare ? BareFrame : CardFrame;
  const m = useMastery(graph);
  const goal = graph.concepts.filter((c) => areas.includes(areaOf(c.track))).map((c) => c.id);
  const { known } = settled(graph, answers);
  const placed = graph.concepts.filter((c) => known.has(c.id));
  const steps = nextSteps(m, graph, { limit: 4, toward: goal });
  const right = answers.filter((a) => a.correct).length;
  return (
    <Frame aria-live="polite">
      {!bare && <Stepper at={2} />}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-title-section sm:text-[32px]">
          Done: {right} of {answers.length} right
        </h2>
        {onFinish ? (
          <Button onClick={onFinish} trailing={<FiArrowRight aria-hidden />}>
            See your plan
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/learn">See the path</ButtonLink>
            <ButtonLink href="/plan" kind="secondary">
              Make a plan
            </ButtonLink>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 rounded-tile bg-accent-soft p-5 text-accent-ink">
        <p className="text-[15px] font-semibold">{placed.length > 0 ? `You placed out of ${placed.length} ${placed.length === 1 ? 'concept' : 'concepts'}` : 'Nothing placed out yet'}</p>
        {placed.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {placed.map((c) => (
              <li key={c.id}>
                <Chip className="bg-surface px-3 py-1.5 text-[13px] text-accent-ink" icon={<FiCheck aria-hidden strokeWidth={2.5} />}>
                  {c.title}
                </Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">So you start at the beginning: a fine place to start.</p>
        )}
        {placed.length > 0 && <p className="text-[13px]">They are marked on the path, and practising them still counts towards mastering them.</p>}
      </div>
      {steps.length > 0 && (
        <section aria-labelledby="start-here" className="flex flex-col gap-3">
          <h3 id="start-here" className="text-[15px] font-semibold">
            Start here
          </h3>
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map(({ concept }) => (
              <li key={concept.id}>
                <TrackCardLink href={conceptHref(concept)} track={concept.track} dense className="min-h-32 justify-between rounded-tile">
                  <Chip tone="onTrack" className="self-start">
                    {trackLabel(concept.track)}
                  </Chip>
                  <span className={cx('font-display text-[22px] leading-tight font-bold', trackTitle(concept.track))}>{concept.title}</span>
                </TrackCardLink>
              </li>
            ))}
          </ol>
        </section>
      )}
      <button type="button" onClick={onRetake} className="self-start rounded-full px-1 py-1 text-sm font-semibold text-accent-ink hover:underline">
        Check another area
      </button>
    </Frame>
  );
}
