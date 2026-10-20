'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FiArrowLeft, FiArrowRight, FiCheck } from 'react-icons/fi';
import { markStarted } from '@/components/home/returning';
import { ConceptBubbles } from '@/components/learn/ConceptBubbles';
import { Placement } from '@/components/learn/Placement';
import { Button } from '@/components/ui/Button';
import { trackTitle } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import type { Goal } from '@/content/goals';
import { TRACK_CLASSES, type TrackColour } from '@/data/tracks';
import type { ProgressEvent } from '@/progress/events';
import { record, useProgressSnapshot } from '@/progress/hooks';
import type { MasteryGraph } from '@/progress/mastery';
import { areaOf, type AreaId, type PlacementQuestion } from '@/progress/placement';
import { HOUR_CHOICES, planView, REVIEW_SHARE } from '@/progress/plan';

const STEPS = ['Goal', 'Time', 'Placement', 'Plan'] as const;
const TITLES = ['What are you learning for?', 'How much time do you have?', 'What do you already know?', 'Your plan'] as const;

/** Each goal's tile on the first step. */
const GOAL_LOOK: Record<string, { mark: string; colour: TrackColour }> = {
  interviews: { mark: '{ }', colour: 'mint' },
  'dsa-foundations': { mark: 'O(n)', colour: 'peach' },
  'ml-foundations': { mark: '∇', colour: 'rose' },
  'deep-learning': { mark: 'QKᵀ', colour: 'sky' },
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

type Props = { goals: readonly Goal[]; graph: MasteryGraph; minutes: Record<string, number>; questions: Record<string, PlacementQuestion[]> };

/**
 * The onboarding (/start): a goal, the hours a week, the placement check, and
 * the plan they make. Nothing is recorded until "Start learning" (a
 * `plan.set`), except the placement answers, which count as they are given.
 * "Skip for now" goes to Today with nothing set.
 */
export function Onboarding({ goals, graph, minutes, questions }: Props) {
  const router = useRouter();
  const { events } = useProgressSnapshot();
  const [step, setStep] = useState(0);
  const [goalId, setGoalId] = useState(goals[0].id);
  const [hours, setHours] = useState(5);
  const [target, setTarget] = useState('');
  const [now] = useState(() => new Date());
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const goal = goals.find((g) => g.id === goalId)!;

  // A new step moves focus to its question, so a screen reader hears where it is.
  useEffect(() => {
    if (first.current) first.current = false;
    else heading.current?.focus();
  }, [step]);

  /** The plan this goal and these hours would make, from what the learner knows now. */
  const preview = useMemo(() => {
    const at = now.toISOString();
    return (h: number) =>
      planView(
        [...events, { id: 'preview', kind: 'plan.set', at, data: { goal: goalId, hours: h, ...(target && { target }) } } as ProgressEvent],
        graph,
        goals,
        minutes,
        now,
      );
  }, [events, goalId, target, graph, goals, minutes, now]);

  const areas = useMemo(() => [...new Set(goal.concepts.map((id) => areaOf(graph.concepts.find((c) => c.id === id)?.track ?? '')))] as AreaId[], [goal, graph]);

  const skip = () => {
    markStarted();
    router.push('/');
  };
  const finish = () => {
    record('plan.set', { goal: goalId, hours, ...(target && { target }) });
    markStarted();
    router.push('/');
  };

  return (
    <div className="grid min-h-dvh grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
      <aside className="hidden flex-col justify-between gap-8 rounded-card bg-track-lilac p-10 text-track-lilac-ink lg:flex">
        <Logo />
        <ConceptBubbles className="h-80" />
        <div className="flex flex-col gap-4">
          <p className={cx('font-display text-[40px] leading-[1.05] font-bold tracking-[-0.025em]', trackTitle('lilac'))}>Every idea builds on others. We’ll find where you start.</p>
          <p className="text-[15px] leading-relaxed">Three quick questions and a short check. You can change everything later in Learn › Plan.</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-col gap-7 rounded-card bg-surface p-5 sm:p-10 lg:p-14">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ol aria-label="Steps" className="flex flex-wrap gap-2">
            {STEPS.map((label, i) => (
              <li
                key={label}
                aria-current={i === step ? 'step' : undefined}
                className={cx(
                  'flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm font-semibold',
                  i === step ? 'bg-primary text-on-primary' : 'bg-sunken text-ink-soft',
                  i !== step && 'max-sm:pr-1.5',
                )}
              >
                <span className={cx('flex size-6 items-center justify-center rounded-full text-xs', i === step ? 'bg-on-primary text-primary' : 'bg-surface')}>
                  {i < step ? <FiCheck aria-label="done" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cx(i !== step && 'max-sm:sr-only')}>{label}</span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={skip} className="rounded-full px-2 py-1.5 text-[15px] font-semibold text-ink hover:underline">
            Skip for now
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-accent-ink">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1 ref={heading} tabIndex={-1} className="font-display text-[clamp(32px,3.6vw,48px)] leading-[1.05] font-bold tracking-[-0.03em] outline-none">
            {TITLES[step]}
          </h1>
        </div>

        <div className="flex-1">
          {step === 0 && (
            <fieldset>
              <legend className="sr-only">Your goal</legend>
              <div className="flex flex-col gap-3">
                {goals.map((g) => {
                  const look = GOAL_LOOK[g.id] ?? { mark: g.title[0], colour: 'lilac' as const };
                  const c = TRACK_CLASSES[look.colour];
                  const on = g.id === goalId;
                  return (
                    <Choice key={g.id} name="goal" checked={on} onChange={() => setGoalId(g.id)}>
                      <span aria-hidden className={cx('flex size-14 shrink-0 items-center justify-center rounded-[16px] font-mono text-lg font-bold', c.bg, c.title)}>
                        {look.mark}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-[17px] font-semibold text-ink">{g.title}</span>
                        <span className="text-sm leading-relaxed text-ink-soft">{g.summary}</span>
                      </span>
                      <span className="shrink-0 text-[13px] text-ink-muted max-sm:hidden">{g.concepts.length} concepts</span>
                    </Choice>
                  );
                })}
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-7">
              <fieldset>
                <legend className="mb-3 text-[15px] font-semibold">Hours a week</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {HOUR_CHOICES.map((h) => {
                    const weeks = preview(h)?.weeks.length ?? 0;
                    return (
                      <Choice key={h} name="hours" checked={hours === h} onChange={() => setHours(h)} compact>
                        <span className="flex flex-col gap-0.5">
                          <span className="font-display text-[28px] leading-none font-bold">{h} h</span>
                          <span className="text-[13px] text-ink-muted">{weeks > 0 ? `about ${weeks} ${weeks === 1 ? 'week' : 'weeks'}` : 'nothing left to learn'}</span>
                        </span>
                      </Choice>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-ink-muted">About {Math.round(REVIEW_SHARE * 100)}% of it is kept for the daily review.</p>
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="target" className="text-[15px] font-semibold">
                  Target date <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <input id="target" type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="h-12 w-fit rounded-[16px] bg-sunken px-4 text-[15px] text-ink" />
              </div>
            </div>
          )}

          {step === 2 && <Placement key={goalId} graph={graph} questions={questions} bare initialAreas={areas} onFinish={() => setStep(3)} />}

          {step === 3 && <PlanPreview view={preview(hours)} graph={graph} hours={hours} />}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-6">
          {step > 0 ? (
            <Button kind="ghost" size="l" icon={<FiArrowLeft aria-hidden />} onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button size="l" className="h-[52px] px-6 text-base" trailing={<FiArrowRight aria-hidden />} onClick={() => setStep(step + 1)}>
              {step === 2 ? 'Skip the check' : 'Continue'}
            </Button>
          ) : (
            <Button size="l" className="h-[52px] px-6 text-base" trailing={<FiArrowRight aria-hidden />} onClick={finish}>
              Start learning
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex w-fit items-center gap-2.5 rounded-[12px]">
      <span className="flex size-10 items-center justify-center rounded-[12px] bg-logo-tile">
        <Image src="/logo.svg" alt="" width={28} height={28} className="size-7 object-contain" />
      </span>
      <span className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">Algorender</span>
    </Link>
  );
}

/** A radio card: the whole card is the label; the dot on the right says which is picked. */
function Choice({ name, checked, onChange, compact = false, children }: { name: string; checked: boolean; onChange: () => void; compact?: boolean; children: ReactNode }) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-center gap-4 rounded-tile transition-colors duration-150 ease-standard has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
        compact ? 'p-4' : 'p-4 sm:px-6 sm:py-5',
        checked ? 'bg-subtle ring-2 ring-primary ring-inset' : 'ring-[1.5px] ring-line ring-inset hover:ring-line-strong',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
      <span
        aria-hidden
        className={cx('ml-auto flex size-8 shrink-0 items-center justify-center rounded-full', checked ? 'bg-primary text-on-primary' : 'ring-[1.5px] ring-line ring-inset')}
      >
        {checked && <FiCheck strokeWidth={3} className="size-4" />}
      </span>
    </label>
  );
}

function PlanPreview({ view, graph, hours }: { view: ReturnType<typeof planView>; graph: MasteryGraph; hours: number }) {
  const title = useMemo(() => new Map(graph.concepts.map((c) => [c.id, c.title])), [graph]);
  if (!view) return null;
  const left = view.concepts.length - view.done.length;
  const week = view.weeks[0];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-3 rounded-card bg-feature p-6 text-on-feature sm:p-7">
        <span className="text-eyebrow text-feature-accent uppercase">{view.goal.title}</span>
        <p className="font-display text-number-big leading-none">
          {view.weeks.length} {view.weeks.length === 1 ? 'week' : 'weeks'}
        </p>
        <p className="text-[15px] text-feature-muted">
          {left} {left === 1 ? 'concept' : 'concepts'} to go at {hours} h a week
          {view.finish && `, done around ${day(view.finish)}`}.{view.done.length > 0 && ` ${view.done.length} you already know drop out.`}
        </p>
        {view.targetOutOfReach ? (
          <p className="text-sm text-feature-muted">No pace up to 40 hours a week meets your target date.</p>
        ) : (
          view.hoursNeeded !== null && <p className="text-sm text-feature-muted">To meet your target date, plan on {view.hoursNeeded} h a week.</p>
        )}
      </div>
      {week && (
        <section aria-labelledby="first-week" className="flex flex-col gap-3 rounded-card bg-sunken p-6">
          <h2 id="first-week" className="text-[13px] font-semibold text-ink-muted">
            Week 1
          </h2>
          <ol className="flex flex-col gap-3">
            {week.items.map((item, i) => (
              <li key={item.concept} className="flex items-center gap-3">
                <span aria-hidden className={cx('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', i === 0 ? 'bg-accent text-on-accent' : 'bg-surface text-ink-soft')}>
                  {i + 1}
                </span>
                <span className="flex-1 text-[15px] font-medium">{title.get(item.concept) ?? item.concept}</span>
                <span className="text-[13px] text-ink-muted">{item.minutes} min</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
