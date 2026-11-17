import type { CheckpointPools, CheckpointQuestion } from '@/progress/checkpoint';
import { canOpen, MINUTES_PER_QUESTION, ROUND_SIZE } from '@/progress/checkpoint';
import type { PlanMilestone } from '@/progress/plan';
import { loadConcepts } from './concepts';
import { lessons } from './lessons';
import { lessonMisconceptions } from './lessons/assessment';
import { lessonQuizzes } from './lessons/quizzes';
import { projectForStage } from './projects';
import { stages } from './stages';

// What each stage's checkpoint can ask (src/progress/checkpoint.ts), read on
// the server from the lessons' MDX like the review cards and the placement
// check, and handed to the page as data.

/** The lessons of available concepts in a stage, by lesson slug → concept. */
function stageLessons(stage: number): Map<string, string> {
  const live = new Set(loadConcepts().concepts.filter((c) => !c.planned).map((c) => c.id));
  const concepts = new Set(stages.find((s) => s.id === stage)?.concepts.filter((c) => live.has(c)) ?? []);
  return new Map(lessons.filter((l) => concepts.has(l.concept)).map((l) => [l.slug, l.concept]));
}

export function checkpointPools(stage: number): CheckpointPools {
  const mine = stageLessons(stage);
  const before = new Map(stages.filter((s) => s.id < stage).flatMap((s) => [...stageLessons(s.id)]));
  const mistakes = lessonMisconceptions();
  const titleOf = new Map(mistakes.map((m) => [`${m.lesson}:${m.id}`, m.title]));

  const probes: CheckpointQuestion[] = mistakes
    .filter((m) => mine.has(m.lesson))
    .flatMap((m) =>
      m.probes.map((p, n) => ({
        item: `probe:${m.lesson}:${m.id}:${n}`,
        source: 'probe' as const,
        concept: mine.get(m.lesson)!,
        lesson: m.lesson,
        q: p.q,
        choices: p.choices,
        answer: p.answer,
        why: p.why,
        traps: { [p.trap]: { id: m.id, title: m.title } },
      })),
    );

  const quizFrom = (from: Map<string, string>): CheckpointQuestion[] =>
    lessonQuizzes()
      .filter((z) => from.has(z.lesson))
      .flatMap((z) =>
        z.questions.map((q, n) => ({
          item: `quiz:${z.lesson}:${z.quiz}:${n}`,
          source: 'quiz' as const,
          concept: from.get(z.lesson)!,
          lesson: z.lesson,
          q: q.q,
          choices: q.choices,
          answer: q.answer,
          why: q.why,
          ...(q.traps && {
            traps: Object.fromEntries(Object.entries(q.traps).map(([choice, id]) => [Number(choice), { id, title: titleOf.get(`${z.lesson}:${id}`) ?? id }])),
          }),
        })),
      );

  return { stage, probes, quiz: quizFrom(mine), earlier: quizFrom(before) };
}

/** Each stage whose checkpoint can open, with roughly how long a round takes: the study plan's milestones. */
export function openCheckpoints(): { stage: number; minutes: number }[] {
  return stages
    .map((s) => ({ s, pools: checkpointPools(s.id) }))
    .filter(({ pools }) => canOpen(pools))
    .map(({ s, pools }) => ({ stage: s.id, minutes: Math.round(Math.min(ROUND_SIZE, pools.probes.length + pools.quiz.length + pools.earlier.length) * MINUTES_PER_QUESTION) }));
}

/**
 * Each stage's milestone for study plans (src/progress/plan.ts): its
 * checkpoint, if open, and its project, if written. A stage with neither has
 * no milestone yet.
 */
export function planMilestones(): PlanMilestone[] {
  const open = new Map(openCheckpoints().map((c) => [c.stage, c.minutes]));
  return stages.flatMap((s) => {
    const project = projectForStage(s.id);
    const checkpoint = open.get(s.id);
    if (checkpoint === undefined && !project) return [];
    return [
      {
        stage: s.id,
        title: s.title,
        concepts: s.concepts,
        minutes: (checkpoint ?? 0) + (project ? project.hours * 60 : 0),
        checkpoint: checkpoint !== undefined,
        ...(project && { parts: project.parts }),
      },
    ];
  });
}
