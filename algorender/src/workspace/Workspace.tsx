'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { FiCheck, FiCrosshair, FiEye, FiLoader, FiPlay, FiRotateCcw, FiShuffle } from 'react-icons/fi';
import * as Tabs from '@radix-ui/react-tabs';
import { getExercise, watchedByLine, type Exercise } from '@/content/exercises';
import { CodeEditor } from './editor/CodeEditor';
import { blankNumbers, fillTemplate, parseBlanks, type Segment } from './formats/blanks';
import { assemble, firstMisplaced, parsonsLines, seedOf, shuffled } from './formats/parsons';
import { InlineText } from './InlineText';
import { LANGUAGES, type Language, type RunMode } from './protocol';
import { RunOutput, statusText } from './RunOutput';
import { FillStage } from './stages/FillStage';
import { ParsonsStage, type Arrangement } from './stages/ParsonsStage';
import { record, useExerciseProgress, useProgressSnapshot } from '@/progress/hooks';
import type { ExerciseProgress } from '@/progress/projections';
import { loadCode, loadLanguage, saveCode, saveLanguage } from './storage';
import { allPass, useExerciseRun, type Outcome } from './useExerciseRun';
import { TutorPanel, type TutorResults } from '@/components/tutor/TutorPanel';

export type Stage = 'parsons' | 'fill' | 'write' | 'bug';

const STAGE_LABEL: Record<Stage, string> = {
  parsons: 'Order the lines',
  fill: 'Fill the gaps',
  write: 'Write it',
  bug: 'Find the bug',
};

/** The fading ladder: arrange the lines, fill gaps that grow, then write it all. A bug hunt has one stage. */
export function stagesFor(exercise: Exercise): Stage[] {
  if (exercise.kind === 'bug') return ['bug'];
  if (exercise.kind === 'modify') return ['write'];
  return ['parsons', ...(exercise.blanks ? (['fill'] as const) : []), 'write'];
}

const noSubscribe = () => () => {};

/**
 * Practise an algorithm in Python, JavaScript or TypeScript, and watch the
 * code run on the visualiser. Storage-backed state only exists in the browser,
 * so the interactive part mounts after hydration. Takes a slug, not the
 * exercise: its `check` function can't cross from a server page.
 */
export function Workspace({
  slug,
  stages,
  variant = 'page',
  tutor = false,
}: {
  slug: string;
  /** Which stages to offer (lessons can embed just one); defaults to the exercise's ladder. */
  stages?: Stage[];
  variant?: 'page' | 'lesson';
  /** The AI tutor is switched on: offer it beside the editor (on the exercise's own page). */
  tutor?: boolean;
}) {
  const exercise = getExercise(slug)!;
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  // The ladder starts at the first stage not yet passed, so wait for the device's progress.
  const { ready } = useProgressSnapshot();
  if (!hydrated || !ready) {
    return (
      <div data-workspace="loading" className="rounded-xl border border-line bg-surface p-4">
        <pre className="font-mono text-[13.5px] leading-[1.6] whitespace-pre-wrap text-ink-soft">{exercise.starter.python}</pre>
      </div>
    );
  }
  return <Ladder exercise={exercise} stages={stages ?? stagesFor(exercise)} variant={variant} tutor={tutor && variant === 'page'} />;
}

/** A run as the tutor sees it: how many tests pass, and the first failure's own explanation. */
function tutorResults(outcome: Outcome): TutorResults {
  if (!outcome.verdicts) return { passed: 0, total: 0, fatal: outcome.result.error?.message ?? 'The tests could not run.' };
  const passed = outcome.verdicts.filter((v) => v.verdict.pass).length;
  const f = outcome.verdicts.find((v) => !v.verdict.pass);
  return { passed, total: outcome.verdicts.length, ...(f && { failing: { label: f.name, input: '', expected: '', got: f.verdict.message.slice(0, 1400) } }) };
}

function passedStage(progress: ExerciseProgress, stage: Stage, levels: number): boolean {
  if (stage === 'fill') return (progress.fill ?? -1) >= levels - 1;
  return progress[stage] === true;
}

function Ladder({ exercise, stages, variant, tutor }: { exercise: Exercise; stages: Stage[]; variant: 'page' | 'lesson'; tutor: boolean }) {
  /** The line the tutor last pointed at. */
  const [pointLine, setPointLine] = useState<number | null>(null);
  const [language, setLanguage] = useState<Language>(() => loadLanguage() ?? 'python');
  const [example, setExample] = useState(exercise.examples[0].id);
  // 'lines' plays the example line by line on the memory view instead of the algorithm's own view.
  const [mode, setMode] = useState<RunMode>('visual');
  // A graph or tree is already watched line by line; the switch only swaps its picture for memory.
  const byLine = watchedByLine(exercise, (exercise.examples.find((e) => e.id === example) ?? exercise.examples[0]).input);
  const progress = useExerciseProgress(exercise.slug);
  const fillSegments = exercise.blanks ? parseBlanks(exercise.blanks[language]) : [];
  const levels = exercise.fades ?? (exercise.blanks ? [blankNumbers(fillSegments)] : []);
  // Return to the editor if the learner has written code here before; otherwise start at the first stage not yet passed.
  const [stage, setStage] = useState<Stage>(() => {
    const wrote = (Object.keys(LANGUAGES) as Language[]).some((l) => loadCode(exercise.slug, l) != null);
    if (wrote && stages.includes('write')) return 'write';
    return stages.find((s) => !passedStage(progress, s, levels.length)) ?? stages.at(-1)!;
  });

  // Write and bug stages: the learner's code per language, kept in this browser.
  const [codes, setCodes] = useState<Record<Language, string>>(() => {
    const saved = (l: Language) => loadCode(exercise.slug, l) ?? exercise.starter[l];
    return { python: saved('python'), javascript: saved('javascript'), typescript: saved('typescript') };
  });
  const [confirmReset, setConfirmReset] = useState(false);

  // Fill stage: a level per faded step, and answers per language.
  const [level, setLevel] = useState(() => Math.max(0, Math.min(levels.length - 1, (progress.fill ?? -1) + 1)));
  const [answers, setAnswers] = useState<Partial<Record<Language, Record<number, string>>>>({});
  const hidden = new Set(levels[level] ?? []);

  // Parsons stage: an arrangement per language, shuffled the same way on every visit.
  const lines = parsonsLines(exercise.solution[language], exercise.distractors?.[language]);
  const fresh = (l: Language): Arrangement => ({
    pool: shuffled(parsonsLines(exercise.solution[l], exercise.distractors?.[l]), seedOf(`${exercise.slug}:${l}`)).map((x) => x.id),
    program: [],
  });
  const [arrangements, setArrangements] = useState<Partial<Record<Language, Arrangement>>>({});
  const arrangement = arrangements[language] ?? fresh(language);
  const [flagged, setFlagged] = useState<number | null>(null);

  const { outcome, running, run, clear, onFrame, frameLine, runtimeState, runtimeDetail, busy } = useExerciseRun(exercise, language);

  const codeFor = (s: Stage): string => {
    if (s === 'parsons') return assemble(arrangement.program, lines, language);
    if (s === 'fill') return fillTemplate(fillSegments, hidden, answers[language] ?? {});
    return codes[language];
  };
  const code = codeFor(stage);
  const stale = outcome != null && (outcome.code !== code || outcome.language !== language);
  const failed = outcome != null && !stale && !allPass(outcome);

  const setCode = (value: string) => {
    setCodes((prev) => ({ ...prev, [language]: value }));
    saveCode(exercise.slug, language, value === exercise.starter[language] ? null : value);
  };

  const chooseLanguage = (next: Language) => {
    setLanguage(next);
    saveLanguage(next);
    setConfirmReset(false);
    setFlagged(null);
  };

  const chooseStage = (next: Stage) => {
    setStage(next);
    setConfirmReset(false);
    setFlagged(null);
    clear();
  };

  const onRun = async (runMode: RunMode = mode) => {
    setFlagged(null);
    const result = await run(code, example, { mode: runMode });
    if (!result || !allPass(result)) return;
    if (stage === 'fill') {
      if ((progress.fill ?? -1) < level) record('exercise.passed', { exercise: exercise.slug, stage: 'fill', level });
    } else if (!progress[stage]) {
      record('exercise.passed', { exercise: exercise.slug, stage });
    }
  };

  /** Fills the first gap that differs from the reference with its answer. */
  const revealGap = () => {
    const mine = answers[language] ?? {};
    const gap = levels[level].find((n) => (mine[n] ?? '').trim() !== segmentAnswer(fillSegments, n).trim());
    if (gap == null) return;
    setAnswers((prev) => ({ ...prev, [language]: { ...mine, [gap]: segmentAnswer(fillSegments, gap) } }));
  };

  const lesson = variant === 'lesson';
  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Language">
        {(Object.keys(LANGUAGES) as Language[]).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={language === l}
            onClick={() => chooseLanguage(l)}
            className={`px-3 py-1.5 text-sm transition-colors ${language === l ? 'bg-ink text-surface' : 'bg-surface text-ink-soft hover:bg-sunken'}`}
          >
            {LANGUAGES[l].label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        Watch it run on
        <select value={example} onChange={(e) => setExample(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
          {exercise.examples.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={mode === 'lines'}
          onChange={(e) => {
            const next: RunMode = e.target.checked ? 'lines' : 'visual';
            setMode(next);
            // Show the same run the other way, rather than asking for another click.
            if (outcome && !stale && !running) void onRun(next);
          }}
          className="size-4 accent-accent"
        />
        {byLine ? 'Show the memory diagram' : 'Line by line, with memory'}
      </label>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {stage === 'parsons' && (
          <>
            {failed && (
              <ToolButton onClick={() => setFlagged(firstMisplaced(arrangement.program, lines, language))} icon={<FiCrosshair />}>
                Point out a misplaced line
              </ToolButton>
            )}
            <ToolButton
              onClick={() => {
                setArrangements((prev) => ({ ...prev, [language]: fresh(language) }));
                setFlagged(null);
              }}
              icon={<FiShuffle />}
              disabled={arrangement.program.length === 0}
            >
              Start again
            </ToolButton>
          </>
        )}
        {stage === 'fill' && failed && (
          <ToolButton onClick={revealGap} icon={<FiEye />}>
            Reveal a gap
          </ToolButton>
        )}
        {(stage === 'write' || stage === 'bug') &&
          (confirmReset ? (
            <span className="flex items-center gap-2 text-sm text-ink-soft">
              {stage === 'bug' ? 'Go back to the buggy code?' : `Discard your ${LANGUAGES[language].label} code?`}
              <button
                type="button"
                onClick={() => {
                  setCode(exercise.starter[language]);
                  setConfirmReset(false);
                  clear();
                }}
                className="rounded-md px-2 py-1.5 text-bad-ink hover:bg-bad-soft"
              >
                Reset
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className="rounded-md px-2 py-1.5 text-ink-soft hover:bg-sunken">
                Keep it
              </button>
            </span>
          ) : (
            <ToolButton onClick={() => setConfirmReset(true)} icon={<FiRotateCcw />} disabled={codes[language] === exercise.starter[language]}>
              Reset code
            </ToolButton>
          ))}
        <button
          type="button"
          onClick={() => void onRun()}
          disabled={busy || (stage === 'parsons' && arrangement.program.length === 0)}
          aria-busy={busy}
          aria-keyshortcuts={stage === 'write' || stage === 'bug' ? 'Control+Enter Meta+Enter' : undefined}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? <FiLoader aria-hidden className="animate-spin" /> : <FiPlay aria-hidden />}
          {running ? 'Running…' : 'Run'}
        </button>
      </div>
    </div>
  );

  const body = (s: Stage) => (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft">
        <InlineText text={stageIntro(s, exercise, language, levels.length)} />
      </p>
      {s === 'parsons' && (
        <ParsonsStage
          lines={lines}
          arrangement={arrangement}
          onChange={(next) => {
            setArrangements((prev) => ({ ...prev, [language]: next }));
            setFlagged(null);
          }}
          language={language}
          flagged={flagged}
        />
      )}
      {s === 'fill' && (
        <FillStage
          segments={fillSegments}
          hidden={hidden}
          answers={answers[language] ?? {}}
          onAnswer={(n, v) => setAnswers((prev) => ({ ...prev, [language]: { ...(prev[language] ?? {}), [n]: v } }))}
          levels={levels}
          level={level}
          onLevel={(l) => {
            setLevel(l);
            clear();
          }}
          passedLevel={progress.fill ?? -1}
        />
      )}
      {(s === 'write' || s === 'bug') && (
        <>
          <CodeEditor
            value={codes[language]}
            onChange={setCode}
            language={language}
            label={`Your ${LANGUAGES[language].label} code`}
            runLine={stale ? null : frameLine}
            errorLine={stale ? null : (outcome?.result.error?.line ?? null)}
            pointLine={pointLine}
            onRun={() => void onRun()}
          />
          <p className="text-xs text-ink-muted">Ctrl/⌘ + Enter runs your code. Tab indents; press Esc, then Tab, to leave the editor.</p>
          {tutor && (
            <TutorPanel
              item={{ kind: 'exercise', slug: exercise.slug }}
              language={language}
              code={codes[language]}
              results={outcome && !stale ? tutorResults(outcome) : undefined}
              onPoint={setPointLine}
            />
          )}
        </>
      )}
      {s === 'bug' && exercise.bug && outcome && allPass(outcome) && !stale && (
        <p className="rounded-lg border border-good-line bg-good-soft px-4 py-3 text-sm text-ink">
          <span className="font-semibold text-good-ink">Fixed. </span>
          <InlineText text={exercise.bug.explanation} />
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {stages.length > 1 ? (
        <Tabs.Root value={stage} onValueChange={(v) => chooseStage(v as Stage)} className="space-y-4">
          <Tabs.List aria-label="Ways to practise" className="flex flex-wrap gap-1.5">
            {stages.map((s, i) => (
              <Tabs.Trigger
                key={s}
                value={s}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-soft hover:bg-sunken data-[state=active]:border-ink data-[state=active]:bg-ink data-[state=active]:text-surface"
              >
                {i + 1}. {stageLabel(s, exercise)}
                {passedStage(progress, s, levels.length) && <FiCheck aria-label="done" />}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {toolbar}
          {stages.map((s) => (
            <Tabs.Content key={s} value={s}>
              {body(s)}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      ) : (
        <>
          {toolbar}
          {body(stage)}
        </>
      )}

      <p className="text-right text-xs text-ink-muted" role="status">
        {statusText(runtimeState, runtimeDetail, running)}
      </p>

      {outcome && (
        <RunOutput
          outcome={outcome}
          exercise={exercise}
          stale={stale}
          onFrame={onFrame}
          layout={lesson ? 'stacked' : 'wide'}
          keyboard={lesson ? 'local' : 'page'}
        />
      )}
    </div>
  );
}

function stageLabel(stage: Stage, exercise: Exercise): string {
  return stage === 'write' && exercise.kind === 'modify' ? 'Change it' : STAGE_LABEL[stage];
}

function segmentAnswer(segments: readonly Segment[], n: number): string {
  const s = segments.find((x) => x.kind === 'blank' && x.n === n);
  return s?.kind === 'blank' ? s.answer : '';
}

function stageIntro(stage: Stage, exercise: Exercise, language: Language, levels: number): string {
  switch (stage) {
    case 'parsons':
      return language === 'python'
        ? 'Put the lines in order and indent them to make a working solution. One or two lines don’t belong.'
        : 'Put the lines in order to make a working solution. One or two lines don’t belong.';
    case 'fill':
      return levels > 1
        ? 'Fill in the gaps so the tests pass. Each level hides more of the code; any code that works is right.'
        : 'Fill in the gaps so the tests pass. Any code that works is right.';
    case 'write':
      return exercise.kind === 'modify'
        ? 'Change the working code below so it does the new job. Your code is kept in this browser.'
        : 'Now write it yourself. Your code is kept in this browser.';
    case 'bug':
      return exercise.bug ? `This code has one bug. ${exercise.bug.symptom} Find it and fix it: run it and watch what it really does.` : '';
  }
}

function ToolButton({ onClick, icon, disabled, children }: { onClick: () => void; icon: ReactNode; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-sunken disabled:opacity-40"
    >
      <span aria-hidden>{icon}</span> {children}
    </button>
  );
}
