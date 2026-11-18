// A task: one auto-checked piece of practice in a language topic (the
// language tracks' proposal, §2c). A topic page ends with a strip of them
// (from L2); each also has its own page, /learn/tasks/<slug>.
//
// The kind says how the learner answers:
//   choice    pick an answer
//   output    read a snippet and type what it prints (checked by running it)
//   program   write a program: stdin in, stdout out, compared by a checker
//   function  write a function: called with arguments, its return compared
//   tests     write functions or classes that hidden unit tests call
//   bug       fix a program whose starter has one bug
//   parsons   put shuffled lines in order (and indent them, in Python)
//   fill      fill the gaps in a program
// The code kinds share a `check`: program cases, function calls, or unit
// tests. Expected outputs are never typed: they come from running the
// reference solution, kept in src/content/tasks/expected.json (written by
// `npm run tasks:expected`, checked by tasks.test.ts).

import { z } from 'zod';
import { COMPARATORS } from '@/problems/schema';
import type { Json, Language } from '@/workspace/protocol';
import { CheckerSchema } from './checkers';

export const TASK_LANGUAGES = ['python', 'javascript', 'typescript'] as const satisfies readonly Language[];
const language = z.enum(TASK_LANGUAGES);
/** Code per language; a task offers the languages its code covers. */
const perLanguage = z.partialRecord(language, z.string());

const json: z.ZodType<Json> = z.lazy(() => z.union([z.null(), z.boolean(), z.number(), z.string(), z.array(json), z.record(z.string(), json)]));

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/);
const SLOT_NAME = /^[a-z][a-z0-9_]*$/;
/** A slot in an output task's snippet: «name». */
const SLOT = /«([a-z][a-z0-9_]*)»/g;

/** One run of a program: its stdin (a seed and clock make random and time repeatable). */
export const ProgramCaseSchema = z.object({
  /** A short name for the case ("two words", "no input"). */
  name: z.string().min(1),
  stdin: z.string().default(''),
  /** Shown to the learner before checking (the first case always is). */
  hidden: z.boolean().default(false),
});
export type ProgramCase = z.output<typeof ProgramCaseSchema>;

export const CheckSchema = z.discriminatedUnion('kind', [
  /** Run the program once per case and compare its output with the reference's. */
  z.object({ kind: z.literal('program'), cases: z.array(ProgramCaseSchema).min(1).max(20), checker: CheckerSchema.default({ kind: 'lines', prompts: 'ignore' }) }),
  /** Call `entry` once per argument list and compare what it returns with the reference's. */
  z.object({
    kind: z.literal('function'),
    entry: perLanguage,
    calls: z.array(z.array(json)).min(1).max(20),
    compare: z.enum(COMPARATORS).default('exact'),
  }),
  /** Run hidden unit tests against the learner's top-level names; every test must pass. */
  z.object({ kind: z.literal('tests'), tests: perLanguage }),
]);
export type TaskCheck = z.output<typeof CheckSchema>;

const base = {
  slug,
  title: z.string().min(3),
  /** The concept this task is evidence about (src/content/concepts.yaml). */
  concept: z.string().regex(/^[a-z0-9-]+$/),
  /** What to do, in Markdown. */
  prompt: z.string().min(10),
  hints: z.array(z.string()).default([]),
};

/** A code task's starter and reference solution, per language. */
const code = { starter: perLanguage, solution: perLanguage, check: CheckSchema };

export const TaskSchema = z
  .discriminatedUnion('kind', [
    z.object({ ...base, kind: z.literal('choice'), choices: z.array(z.string()).min(2).max(6), answer: z.number().int().min(0), why: z.string().min(10) }),
    z.object({
      ...base,
      kind: z.literal('output'),
      /** The snippet; «name» slots take their literals from `vary`. */
      code: perLanguage,
      stdin: z.string().default(''),
      /**
       * Literals for the snippet's «name» slots, one list per slot, all the same
       * length: variant k takes the k-th of each. Variant 0 is the one the topic
       * and the task page show; a review card asks the others in turn, so the
       * learner predicts a fresh output rather than one remembered. Each
       * variant's output is in expected.json, and must differ from the others.
       */
      vary: z.record(z.string().regex(SLOT_NAME), z.array(z.string()).min(2).max(6)).default({}),
    }),
    z.object({ ...base, kind: z.literal('program'), ...code }),
    z.object({ ...base, kind: z.literal('function'), ...code }),
    z.object({ ...base, kind: z.literal('tests'), ...code }),
    z.object({
      ...base,
      kind: z.literal('bug'),
      ...code,
      /** What goes wrong, as a learner would notice it. */
      symptom: z.string().min(10),
      /** The bug and why it happens, shown once the task passes. */
      explanation: z.string().min(10),
    }),
    z.object({ ...base, kind: z.literal('parsons'), solution: perLanguage, distractors: z.partialRecord(language, z.array(z.string())).default({}), check: CheckSchema }),
    z.object({
      ...base,
      kind: z.literal('fill'),
      /** The solution with «n:text» gaps (src/workspace/formats/blanks.ts). */
      solution: perLanguage,
      check: CheckSchema,
    }),
  ])
  .superRefine((t, ctx) => {
    if ((t.kind === 'program' || t.kind === 'function' || t.kind === 'tests') && t.check.kind !== t.kind) {
      ctx.addIssue({ code: 'custom', message: `A ${t.kind} task is checked as a ${t.kind}, not by ${t.check.kind}` });
    }
    if (t.kind === 'choice' && t.answer >= t.choices.length) ctx.addIssue({ code: 'custom', message: 'The answer is not one of the choices' });
    const offered = taskLanguages(t);
    if (offered.length === 0) ctx.addIssue({ code: 'custom', message: 'A code task needs at least one language' });
    if ('check' in t) {
      const per = t.check.kind === 'function' ? t.check.entry : t.check.kind === 'tests' ? t.check.tests : null;
      for (const l of offered) if (per && per[l] === undefined) ctx.addIssue({ code: 'custom', message: `The check has nothing for ${l}` });
    }
    if ('starter' in t) for (const l of offered) if (t.starter[l] === undefined) ctx.addIssue({ code: 'custom', message: `No ${l} starter` });
    if (t.kind === 'output') {
      if (new Set(Object.values(t.vary).map((v) => v.length)).size > 1) ctx.addIssue({ code: 'custom', message: 'Every slot needs the same number of literals' });
      for (const l of offered) {
        const names = new Set([...t.code[l]!.matchAll(SLOT)].map((m) => m[1]));
        for (const n of names) if (!t.vary[n]) ctx.addIssue({ code: 'custom', message: `The ${l} snippet's slot «${n}» has no literals in vary` });
        for (const n of Object.keys(t.vary)) if (!names.has(n)) ctx.addIssue({ code: 'custom', message: `vary names «${n}», which the ${l} snippet doesn't use` });
      }
    }
  });

export type Task = z.output<typeof TaskSchema>;
export type TaskInput = z.input<typeof TaskSchema>;
export type TaskKind = Task['kind'];
export type TaskLanguage = (typeof TASK_LANGUAGES)[number];

/** The languages a task can be done in: those its reference covers (any, for a choice). */
export function taskLanguages(t: Task): TaskLanguage[] {
  if (t.kind === 'choice') return [...TASK_LANGUAGES];
  const per = t.kind === 'output' ? t.code : t.solution;
  return TASK_LANGUAGES.filter((l) => per[l] !== undefined);
}

/** An output task's snippets, one per variant (just the one when it has no slots); variant 0 is the one shown. */
export function outputVariants(t: Extract<Task, { kind: 'output' }>, language: TaskLanguage): string[] {
  const code = t.code[language]!;
  const count = Object.values(t.vary)[0]?.length ?? 1;
  return Array.from({ length: count }, (_, k) => code.replace(SLOT, (_m, name: string) => t.vary[name][k]));
}

/** Kinds whose answer is code the learner writes in the editor. */
export const WRITTEN = new Set<TaskKind>(['program', 'function', 'tests', 'bug']);

/** Words for each kind, for chips and headings. */
export const KIND_LABEL: Record<TaskKind, string> = {
  choice: 'Choose',
  output: 'What does it print?',
  program: 'Write a program',
  function: 'Write a function',
  tests: 'Make the tests pass',
  bug: 'Fix the bug',
  parsons: 'Put the lines in order',
  fill: 'Fill the gaps',
};

/**
 * The reference's results that cases are checked against, per task and
 * language (src/content/tasks/expected.json): for a program, each case's
 * stdout, prompts and exit code; for a function, each call's return; for an
 * output task, what each variant of its snippet prints (review cards check
 * against these, so they work offline without loading a runtime).
 */
export type ExpectedRun = { stdout: string; prompts: [number, number][]; exitCode: number | null };
export type TaskExpected = { cases?: ExpectedRun[]; returns?: Json[]; outputs?: string[] };
export type ExpectedFile = Record<string, Partial<Record<TaskLanguage, TaskExpected>>>;
