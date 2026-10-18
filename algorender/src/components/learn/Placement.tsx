'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { FiArrowRight, FiCheckCircle, FiHelpCircle, FiXCircle } from 'react-icons/fi';
import { record, useMastery, useProgressSnapshot } from '@/progress/hooks';
import { nextSteps, type MasteryGraph, type PlacementAnswer } from '@/progress/mastery';
import { AREAS, areaOf, MAX_QUESTIONS, nextConcept, pickQuestion, settled, type AreaId, type PlacementQuestion } from '@/progress/placement';
import { conceptHref } from './Mastery';

type Asked = { question: PlacementQuestion; picked: number | null };

/**
 * The placement check: pick areas, answer up to MAX_QUESTIONS adaptive
 * questions ("Not sure" is an honest answer, better than a guess), then see
 * what was placed out and where to start. Each answer is recorded as it is
 * given, so leaving halfway keeps what was learned.
 */
export function Placement({ graph, questions }: { graph: MasteryGraph; questions: Record<string, PlacementQuestion[]> }) {
  const [areas, setAreas] = useState<AreaId[]>(['dsa']);
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
    setAnswers((a) => [...a, { concept: q.concept, correct }]);
    setCurrent({ ...current, picked: picked === 'unsure' ? -1 : picked });
  };

  if (phase === 'choose') {
    return (
      <div className="rounded-2xl border border-line-soft bg-surface p-6 shadow-xs">
        <fieldset>
          <legend className="mb-3 font-semibold text-ink">What do you want to learn?</legend>
          <div className="space-y-2">
            {AREAS.map((a) => (
              <label key={a.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm text-ink hover:bg-subtle">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={areas.includes(a.id)}
                  onChange={(e) => setAreas((xs) => (e.target.checked ? [...xs, a.id] : xs.filter((x) => x !== a.id)))}
                />
                {a.label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-4 text-sm text-ink-soft">
          Up to {MAX_QUESTIONS} questions. Each right answer also counts for what that idea builds on, and each &ldquo;not sure&rdquo; skips what builds on it, so
          it stays short. Answer &ldquo;Not sure&rdquo; rather than guess: a lucky guess places you past things you&rsquo;d want to learn.
        </p>
        <button
          type="button"
          disabled={areas.length === 0}
          onClick={start}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-50"
        >
          Start <FiArrowRight aria-hidden />
        </button>
      </div>
    );
  }

  if (phase === 'asking' && current) {
    const q = current.question;
    const done = current.picked !== null;
    return (
      <div className="rounded-2xl border border-line-soft bg-surface p-6 shadow-xs">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-accent-ink">{titleOf.get(q.concept)}</span>
          <span className="text-ink-muted">
            Question {answers.length + (done ? 0 : 1)} of at most {MAX_QUESTIONS}
          </span>
        </div>
        <p className="mb-4 font-medium text-ink">{q.q}</p>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Choices">
          {q.choices.map((c, ci) => {
            const style = !done
              ? 'border-line-strong hover:border-accent-line hover:bg-accent-soft'
              : ci === q.answer
                ? 'border-good-line bg-good-soft text-good-ink'
                : ci === current.picked
                  ? 'border-bad-line bg-bad-soft text-bad-ink'
                  : 'border-line text-ink-muted';
            return (
              <button key={ci} type="button" disabled={done} onClick={() => answer(ci)} className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${style}`}>
                {c}
              </button>
            );
          })}
        </div>
        {!done && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <button type="button" onClick={() => answer('unsure')} className="inline-flex items-center gap-1.5 text-ink-soft hover:text-accent-ink">
              <FiHelpCircle aria-hidden /> Not sure
            </button>
            {answers.length > 0 && (
              <button type="button" onClick={() => setPhase('done')} className="text-ink-muted underline-offset-2 hover:underline">
                Finish now
              </button>
            )}
          </div>
        )}
        {done && (
          <div className="mt-4 space-y-4" aria-live="polite">
            <p className="flex gap-2 text-sm text-ink-soft">
              {current.picked === q.answer ? (
                <FiCheckCircle aria-hidden className="mt-0.5 shrink-0 text-good-ink" />
              ) : (
                <FiXCircle aria-hidden className="mt-0.5 shrink-0 text-bad-ink" />
              )}
              <span>
                <span className="font-medium">{current.picked === q.answer ? 'Right. ' : current.picked === -1 ? 'No problem. ' : 'Not quite. '}</span>
                {q.why}
              </span>
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => ask(answers)}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-strong"
            >
              Next <FiArrowRight aria-hidden />
            </button>
          </div>
        )}
      </div>
    );
  }

  return <Results graph={graph} answers={answers} areas={areas} onRetake={() => setPhase('choose')} />;
}

function Results({ graph, answers, areas, onRetake }: { graph: MasteryGraph; answers: PlacementAnswer[]; areas: AreaId[]; onRetake: () => void }) {
  const m = useMastery(graph);
  const goal = graph.concepts.filter((c) => areas.includes(areaOf(c.track))).map((c) => c.id);
  const { known } = settled(graph, answers);
  const placed = graph.concepts.filter((c) => known.has(c.id));
  const steps = nextSteps(m, graph, { limit: 4, toward: goal });
  const right = answers.filter((a) => a.correct).length;
  return (
    <div className="space-y-6" aria-live="polite">
      <div className="rounded-2xl border border-line-soft bg-surface p-6 shadow-xs">
        <h2 className="text-xl font-semibold text-ink">Done: {right} of {answers.length} right</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {placed.length > 0
            ? `You placed out of ${placed.length} ${placed.length === 1 ? 'concept' : 'concepts'}. They are marked on the concept map, and practising them still counts towards mastering them.`
            : 'Nothing placed out yet, so you start at the beginning. That is a fine place to start.'}
        </p>
        {placed.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {placed.map((c) => (
              <li key={c.id} className="rounded-full bg-sunken px-2.5 py-0.5 text-xs text-ink-soft">
                {c.title}
              </li>
            ))}
          </ul>
        )}
      </div>
      {steps.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">Start here</h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {steps.map(({ concept }) => (
              <li key={concept.id}>
                <Link
                  href={conceptHref(concept)}
                  className="flex h-full items-start justify-between gap-3 rounded-xl border border-line-soft bg-surface p-4 shadow-xs hover:border-accent-line"
                >
                  <span>
                    <span className="block font-medium text-ink">{concept.title}</span>
                    <span className="text-sm text-ink-soft">
                      {concept.prereqs.length ? 'You know everything it builds on.' : 'It builds on nothing else: a good first step.'}
                    </span>
                  </span>
                  <FiArrowRight aria-hidden className="mt-1 shrink-0 text-accent-ink" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/learn" className="text-accent-ink underline-offset-2 hover:underline">
          See the concept map
        </Link>
        <button type="button" onClick={onRetake} className="text-ink-soft underline-offset-2 hover:underline">
          Check another area
        </button>
      </div>
    </div>
  );
}
