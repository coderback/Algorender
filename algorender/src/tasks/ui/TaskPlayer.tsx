'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { FiCheck, FiCheckCircle, FiRotateCcw, FiXCircle } from 'react-icons/fi';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { cx } from '@/components/ui/cx';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { TASK_CHECKS } from '@/content/tasks/checks';
import { Markdown } from '@/problems/ui/Markdown';
import { record } from '@/progress/hooks';
import { CodeEditor } from '@/workspace/editor/CodeEditor';
import { ErrorHelp } from '@/workspace/ErrorHelp';
import { blankNumbers, fillTemplate, parseBlanks } from '@/workspace/formats/blanks';
import { assemble, parsonsLines, seedOf, shuffled } from '@/workspace/formats/parsons';
import { InlineText } from '@/workspace/InlineText';
import { LANGUAGES, type Language, type RunError, type TestResult } from '@/workspace/protocol';
import { ReplayConsole } from '@/workspace/ReplayConsole';
import { FillStage } from '@/workspace/stages/FillStage';
import { ParsonsStage, type Arrangement } from '@/workspace/stages/ParsonsStage';
import { loadCode, saveCode } from '@/workspace/storage';
import { useRuntime } from '@/workspace/useRuntime';
import { withoutPrompts } from '../checkers';
import { checkChoice, checkCode, checkPrediction, errorLine, type CaseVerdict, type TaskVerdict } from '../check';
import { KIND_LABEL, outputVariants, taskLanguages, WRITTEN, type Task, type TaskExpected, type TaskLanguage } from '../schema';
import { OutputDiff } from './OutputDiff';

const noSubscribe = () => () => {};

/**
 * A task: what to do on the left, the answer on the right (code in the
 * editor, lines to order, gaps to fill, an output to predict or a choice),
 * then Check, which runs the learner's answer through the task's check in
 * the browser and shows each case: a line diff of the output with
 * whitespace made visible, the error explained in plain words, or each unit
 * test's outcome. Every check is a task.checked event. Code drafts are kept
 * on the device, so it mounts after hydration.
 */
export function TaskPlayer({ task, expected, inline = false }: { task: Task; expected: Partial<Record<TaskLanguage, TaskExpected>>; inline?: boolean }) {
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const languages = taskLanguages(task);
  const [language, setLanguage] = useState<TaskLanguage>(languages[0]);
  return (
    // Inline (inside a topic): one column, the brief above the answer.
    <div className={cx('grid grid-cols-1 items-start gap-4', !inline && 'px-3 pt-4 pb-10 sm:px-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.4fr)]')}>
      <Brief task={task} language={language} expected={expected[language]} inline={inline} />
      <section aria-label="Your answer" className="flex min-w-0 flex-col gap-4">
        {task.kind !== 'choice' && languages.length > 1 && (
          <SelectField label="Language" value={language} onChange={(e) => setLanguage(e.target.value as TaskLanguage)} className="max-w-56">
            {languages.map((l) => (
              <option key={l} value={l}>
                {LANGUAGES[l].label}
              </option>
            ))}
          </SelectField>
        )}
        {hydrated ? (
          <Answer key={language} task={task} language={language} expected={expected[language]} />
        ) : (
          <div className="h-72 animate-pulse rounded-card bg-surface" aria-hidden />
        )}
      </section>
    </div>
  );
}

/** The task's card: its kind, what to do, the first example, and hints to open one at a time. */
function Brief({ task, language, expected, inline }: { task: Task; language: TaskLanguage; expected?: TaskExpected; inline: boolean }) {
  const example = task.kind !== 'choice' && 'check' in task && task.check.kind === 'program' ? task.check.cases[0] : null;
  const run = example ? expected?.cases?.[0] : undefined;
  return (
    <article aria-label={inline ? task.title : 'The task'} className="flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="accent">{KIND_LABEL[task.kind]}</Chip>
        {inline && <span className="text-sm font-semibold text-ink">{task.title}</span>}
        {task.kind !== 'choice' && <Chip>{LANGUAGES[language].label}</Chip>}
      </div>
      <Markdown text={task.prompt} />
      {task.kind === 'bug' && (
        <p className="rounded-well bg-warn-soft p-3 text-sm text-warn-title">
          <span className="font-semibold">What goes wrong: </span>
          <InlineText text={task.symptom} />
        </p>
      )}
      {example && run && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink">Example</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <Sample label="Input" text={example.stdin || '(none)'} />
            <Sample label="Output" text={withoutPrompts(run.stdout, run.prompts) || '(none)'} />
          </div>
        </div>
      )}
      {task.hints.length > 0 && <Hints hints={task.hints} />}
      <p className="text-xs text-ink-muted">Practice: your answer is checked in your browser.</p>
    </article>
  );
}

function Sample({ label, text }: { label: string; text: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="text-xs font-semibold text-ink-muted">{label}</figcaption>
      <pre className="overflow-x-auto rounded-well bg-sunken p-3 font-mono text-[13px] text-ink">{text}</pre>
    </figure>
  );
}

/** Hints revealed one at a time. */
function Hints({ hints }: { hints: readonly string[] }) {
  const [shown, setShown] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      {shown > 0 && (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-soft">
          {hints.slice(0, shown).map((h) => (
            <li key={h}>
              <InlineText text={h} />
            </li>
          ))}
        </ol>
      )}
      {shown < hints.length && (
        <Button kind="soft" size="s" className="self-start" onClick={() => setShown((n) => n + 1)}>
          {shown === 0 ? 'Show a hint' : 'Another hint'} ({shown + 1} of {hints.length})
        </Button>
      )}
    </div>
  );
}

/** The answer area for the task's kind, the Check button and the verdict. */
function Answer({ task, language, expected }: { task: Task; language: TaskLanguage; expected?: TaskExpected }) {
  const { runtime, runtimeState, runtimeDetail } = useRuntime(language);
  const [verdict, setVerdict] = useState<TaskVerdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const slot = `task:${task.slug}`;

  // Each kind's answer, as state; `answerCode` turns it into code to check.
  const starter = 'starter' in task ? (task.starter[language] ?? '') : '';
  const [code, setCode] = useState(() => (WRITTEN.has(task.kind) ? (loadCode(slot, language) ?? starter) : ''));
  const lines = task.kind === 'parsons' ? parsonsLines(task.solution[language]!, task.distractors[language] ?? []) : [];
  const [arrangement, setArrangement] = useState<Arrangement>(() => ({ pool: shuffled(lines.map((l) => l.id), seedOf(`${task.slug}:${language}`)), program: [] }));
  const segments = task.kind === 'fill' ? parseBlanks(task.solution[language]!) : [];
  const gaps = blankNumbers(segments);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState<number | null>(null);

  const answerCode = (): string => {
    if (task.kind === 'parsons') return assemble(arrangement.program, lines, language);
    if (task.kind === 'fill') return fillTemplate(segments, new Set(gaps), answers);
    return code;
  };

  const editCode = (value: string) => {
    setCode(value);
    saveCode(slot, language, value === starter ? null : value);
  };

  const check = async () => {
    setChecking(true);
    setFailure(null);
    try {
      const run = (request: Parameters<typeof runtime.run>[0]) => runtime.run(request);
      let v: TaskVerdict;
      if (task.kind === 'choice') v = checkChoice(task, picked ?? -1);
      else if (task.kind === 'output') v = await checkPrediction(task, language, typed, run);
      else v = await checkCode(task.check, language, answerCode(), expected, run, TASK_CHECKS);
      setVerdict(v);
      record('task.checked', {
        task: task.slug,
        kind: task.kind,
        ...(task.kind !== 'choice' && { language }),
        passed: v.passed,
        tests: v.total,
        failed: v.failed,
      });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const ready = task.kind === 'choice' ? picked !== null : task.kind === 'output' ? typed.trim() !== '' : task.kind === 'parsons' ? arrangement.program.length > 0 : true;
  const label = LANGUAGES[language].label;
  const programKind = 'check' in task && task.check.kind === 'program';

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3 rounded-card bg-surface p-4 sm:p-5">
        {WRITTEN.has(task.kind) && (
          <CodeEditor value={code} onChange={editCode} language={language} label={`Your ${label} code`} minLines={8} onRun={() => void check()} symbols errorLine={firstErrorLine(verdict)} />
        )}
        {task.kind === 'parsons' && <ParsonsStage lines={lines} arrangement={arrangement} onChange={setArrangement} language={language} flagged={null} />}
        {task.kind === 'fill' && (
          <FillStage segments={segments} hidden={new Set(gaps)} answers={answers} onAnswer={(n, value) => setAnswers((a) => ({ ...a, [n]: value }))} levels={[gaps]} level={0} onLevel={() => {}} passedLevel={verdict?.passed ? 0 : -1} />
        )}
        {task.kind === 'output' && (
          <>
            <CodeBlock lines={outputVariants(task, language)[0].replace(/\n$/, '').split('\n')} label={`The ${label} program`} />
            <TextAreaField label="What does it print?" mono rows={4} value={typed} onChange={(e) => setTyped(e.target.value)} spellCheck={false} autoCapitalize="off" autoComplete="off" />
          </>
        )}
        {task.kind === 'choice' && <Choices task={task} picked={picked} onPick={setPicked} disabled={verdict?.passed === true} />}
        <div className="flex flex-wrap items-center gap-2">
          <Button kind="accent" icon={<FiCheck aria-hidden />} onClick={() => void check()} disabled={checking || !ready}>
            {checking ? 'Checking…' : 'Check'}
          </Button>
          {WRITTEN.has(task.kind) && code !== starter && (
            <Button kind="soft" icon={<FiRotateCcw aria-hidden />} onClick={() => editCode(starter)}>
              Start over
            </Button>
          )}
          {runtimeState === 'loading' && <span className="text-sm text-ink-muted">{runtimeDetail ?? 'Loading…'}</span>}
        </div>
      </div>
      {failure && (
        <Alert tone="bad" title="The check couldn’t run" role="alert">
          {failure}
        </Alert>
      )}
      {verdict && <Verdict task={task} language={language} verdict={verdict} />}
      {programKind && WRITTEN.has(task.kind) && (
        <section aria-labelledby={`${slot}-try`} className="flex flex-col gap-3 rounded-card bg-surface p-4 sm:p-5">
          <div>
            <h2 id={`${slot}-try`} className="font-display text-title-card">
              Try it
            </h2>
            <p className="text-sm text-ink-muted">Run your program and type its input yourself.</p>
          </div>
          <ReplayConsole language={language as Language} code={code} mode="program" />
        </section>
      )}
    </>
  );
}

/** The line to mark in the editor: the first error's, in the main file. */
function firstErrorLine(v: TaskVerdict | null): number | null {
  const e = v?.error ?? v?.cases.find((c) => c.error)?.error;
  return e && !e.file ? e.line : null;
}

function Choices({ task, picked, onPick, disabled }: { task: Extract<Task, { kind: 'choice' }>; picked: number | null; onPick: (k: number) => void; disabled: boolean }) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Choices</legend>
      {task.choices.map((choice, k) => (
        <label key={k} className={cx('flex cursor-pointer items-start gap-3 rounded-tile p-3 ring-inset', picked === k ? 'bg-sunken ring-2 ring-primary' : 'ring-[1.5px] ring-line hover:ring-line-strong')}>
          <input type="radio" name={name} className="mt-1 size-4 accent-[var(--color-accent)]" checked={picked === k} disabled={disabled} onChange={() => onPick(k)} />
          <span className="font-mono text-sm text-ink">{choice}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** The outcome: a headline, then each case or test, failures opened up. */
function Verdict({ task, language, verdict }: { task: Task; language: TaskLanguage; verdict: TaskVerdict }) {
  const tests = verdict.tests;
  const noun = tests ? 'test' : task.kind === 'function' ? 'call' : 'case';
  const many = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const title = verdict.passed
    ? task.kind === 'output'
      ? 'Right: that is exactly what it prints'
      : task.kind === 'choice'
        ? 'Right'
        : verdict.total === 1
          ? `The ${noun} passes`
          : `All ${many(verdict.total)} pass`
    : task.kind === 'output'
      ? 'Not quite: compare what it prints with what you typed'
      : task.kind === 'choice'
        ? 'Not that one'
        : `${verdict.failed} of ${many(verdict.total)} ${verdict.failed === 1 ? 'fails' : 'fail'}`;
  return (
    <section aria-label="Check results" className="flex flex-col gap-3" data-verdict={verdict.passed ? 'passed' : 'failed'}>
      <Alert tone={verdict.passed ? 'good' : 'bad'} title={title}>
        {task.kind === 'bug' && verdict.passed && <InlineText text={task.explanation} />}
        {task.kind === 'choice' && verdict.passed && <InlineText text={task.why} />}
      </Alert>
      {verdict.error && <RunErrorCard language={language} error={verdict.error} />}
      {tests && tests.length > 0 && <TestList tests={tests} />}
      {!tests && verdict.cases.length > 0 && task.kind !== 'choice' && (
        <ol className="flex flex-col gap-2">
          {verdict.cases.map((c, k) => (
            <CaseRow key={k} c={c} language={language} repeat={!!c.error && verdict.cases.slice(0, k).some((d) => d.error?.message === c.error!.message)} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** A case, failures opened up; an error already shown for an earlier case (`repeat`) is only named. */
function CaseRow({ c, language, repeat }: { c: CaseVerdict; language: TaskLanguage; repeat: boolean }) {
  const Icon = c.passed ? FiCheckCircle : FiXCircle;
  return (
    <li className="flex flex-col gap-3 rounded-card bg-surface p-4" data-case={c.passed ? 'passed' : 'failed'}>
      <p className="flex items-start gap-2 text-sm">
        <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', c.passed ? 'text-good-ink' : 'text-bad-ink')} />
        <span className="sr-only">{c.passed ? 'Passed: ' : 'Failed: '}</span>
        <span className={cx('font-semibold text-ink', c.call && 'font-mono')}>{c.name}</span>
        {c.hidden && c.passed && <span className="text-ink-muted">(hidden)</span>}
      </p>
      {!c.passed && (
        <>
          {c.message && !c.error && <p className="text-sm text-ink-soft">{c.message}</p>}
          {c.stdin !== undefined && (
            <div className="flex flex-col gap-1">
              <h3 className="text-xs font-semibold text-ink-muted">Input</h3>
              <pre className="overflow-x-auto rounded-well bg-sunken p-3 font-mono text-[13px] text-ink">{c.stdin || '(none)'}</pre>
            </div>
          )}
          {c.error && repeat ? (
            <p className="text-sm text-ink-soft">The same error as above.</p>
          ) : c.error ? (
            <RunErrorCard language={language} error={c.error} />
          ) : (
            c.expected !== undefined && c.got !== undefined && !c.call && <OutputDiff expected={c.expected} got={c.got} />
          )}
          {c.stderr && !c.error && (
            <div className="flex flex-col gap-1">
              <h3 className="text-xs font-semibold text-ink-muted">Errors it wrote</h3>
              <pre className="overflow-x-auto rounded-well bg-sunken p-3 font-mono text-[13px] text-bad-ink">{c.stderr}</pre>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function RunErrorCard({ language, error }: { language: TaskLanguage; error: RunError }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-well bg-bad-soft p-3 font-mono text-[13px] text-bad-title" data-run-error>
        {errorLine(error)}
      </p>
      <ErrorHelp language={language} error={error} />
    </div>
  );
}

function TestList({ tests }: { tests: TestResult[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {tests.map((t) => {
        const Icon = t.passed ? FiCheckCircle : FiXCircle;
        return (
          <li key={t.name} className="flex flex-col gap-1 rounded-card bg-surface p-4" data-case={t.passed ? 'passed' : 'failed'}>
            <p className="flex items-start gap-2 text-sm">
              <Icon aria-hidden className={cx('mt-0.5 size-4 shrink-0', t.passed ? 'text-good-ink' : 'text-bad-ink')} />
              <span className="sr-only">{t.passed ? 'Passed: ' : 'Failed: '}</span>
              <span className="font-mono font-semibold text-ink">{t.name}</span>
            </p>
            {!t.passed && t.message && (
              <p className="text-sm text-ink-soft">
                {t.message}
                {t.line != null && ` (line ${t.line})`}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
