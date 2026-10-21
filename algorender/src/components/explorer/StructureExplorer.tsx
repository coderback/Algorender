'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { FiCornerUpLeft, FiPlay } from 'react-icons/fi';
import type { AnyStructure, OperationSpec } from '@/engine/module';
import { randomSeed } from '@/engine/random';
import { recordOperation } from '@/engine/trace';
import type { Trace } from '@/engine/types';
import { argError, blockedReason, describeCall, parseArg, parseArgs, parseOps, replay, serializeOps, type OpCall } from './operations';
import { Experiments } from './Experiments';
import type { ExplorerOptions } from './options';
import { DEFAULT_SEED } from './source';
import { useStartMode } from './startMode';
import { TraceStage, type Density, type Mode } from './TraceStage';
import { writeUrl } from './url';

/* eslint-disable @typescript-eslint/no-explicit-any -- a structure's model type is opaque to the explorer */
type Model = any;
type Spec = OperationSpec<Model, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

type Session = {
  start: string;
  seed: number;
  model: Model;
  history: { call: OpCall; before: Model }[];
  trace: Trace<unknown>;
  pseudocode: readonly string[];
  /** Bumped on every change so the stage remounts; `animate` plays an operation straight away. */
  id: number;
  animate: boolean;
};

const idle = (ds: AnyStructure, model: Model, note: string): Trace<unknown> => ({
  frames: [{ state: ds.snapshot(model), line: null, note, vars: {}, stats: {} }],
  truncated: false,
});

const READY = 'Choose an operation below to see it step by step.';

/** Lets the learner change a data structure with operations; each one is replayed as its own trace. */
export function StructureExplorer({ module: ds, options }: { module: AnyStructure; options: ExplorerOptions }) {
  const [session, setSession] = useState<Session>(() => {
    const p = options.params;
    const start = ds.initial.find((s) => s.id === p.get('start')) ?? ds.initial[0];
    const seedParam = Number(p.get('seed'));
    const seed = p.has('seed') && Number.isInteger(seedParam) && seedParam >= 0 ? seedParam : DEFAULT_SEED;
    const { model, applied } = replay(ds, start.make(seed), parseOps(p.get('ops') ?? '', ds));
    return { start: start.id, seed, model, history: applied, trace: idle(ds, model, READY), pseudocode: [], id: 0, animate: false };
  });
  const [mode, setMode] = useStartMode(options);
  const [density, setDensity] = useState<Density>(options.density);

  const sync = (next: Session, nextMode = mode) => {
    setSession(next);
    const p = new URLSearchParams({ start: next.start, seed: String(next.seed) });
    if (next.history.length) p.set('ops', serializeOps(next.history.map((h) => h.call), ds));
    if (options.syncUrl) writeUrl(p, nextMode);
  };

  const run = (spec: Spec, call: OpCall) => {
    if (blockedReason(ds, session.model, call)) return;
    const rec = recordOperation(spec.run(session.model, call.args));
    sync({
      ...session,
      model: rec.result,
      history: [...session.history, { call, before: session.model }],
      trace: rec.frames.length ? rec : idle(ds, rec.result, `${describeCall(call, ds)}: done.`),
      pseudocode: spec.pseudocode,
      id: session.id + 1,
      animate: true,
    });
  };

  const undo = () => {
    const last = session.history.at(-1);
    if (!last) return;
    sync({
      ...session,
      model: last.before,
      history: session.history.slice(0, -1),
      trace: idle(ds, last.before, `Undid "${describeCall(last.call, ds)}".`),
      pseudocode: [],
      id: session.id + 1,
      animate: false,
    });
  };

  const reset = (start: string) => {
    const seed = randomSeed();
    const model = ds.initial.find((s) => s.id === start)!.make(seed);
    sync({ start, seed, model, history: [], trace: idle(ds, model, READY), pseudocode: [], id: session.id + 1, animate: false });
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    sync(session, next);
  };

  return (
    <div className="flex flex-col gap-4">
      <TraceStage
        key={session.id}
        trace={session.trace}
        view={ds.view}
        pseudocode={session.pseudocode}
        stats={ds.stats}
        legend={ds.legend}
        autoPlay={session.animate}
        predict={{ mode, density, setMode: changeMode, setDensity }}
        keyboard={options.keyboard}
        layout={options.layout}
        onPrediction={options.onPrediction}
        panels={options.panels}
        sheet={options.sheet}
      />
      <OperationsPanel ds={ds} model={session.model} onRun={run}>
        <div className="flex flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
            <span className="mr-1 text-[13px] text-ink-muted">History</span>
            {session.history.length === 0 ? (
              <span className="text-ink-muted">No operations yet.</span>
            ) : (
              session.history.map((h, i) => (
                <span key={i} className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-ink">
                  {describeCall(h.call, ds)}
                </span>
              ))
            )}
            {session.history.length > 0 && (
              <button
                type="button"
                onClick={undo}
                className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-accent-ink transition-colors duration-150 ease-standard hover:bg-accent-soft"
              >
                <FiCornerUpLeft aria-hidden /> Undo
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-ink-muted">Start over with</span>
            {ds.initial.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => reset(s.id)}
                className="h-8 rounded-full bg-sunken px-3 text-xs font-semibold text-ink transition-colors duration-150 ease-standard hover:bg-line-soft"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </OperationsPanel>
      {options.details}
      {options.showExperiments && (
        <Experiments
          colour={options.colour}
          suffix=""
          items={ds.content.experiments
            .filter((x) => ds.initial.some((s) => s.id === x.example))
            .map((x, i) => ({
              key: `${x.example}-${i}`, // several experiments can start from one example
              label: `Start from: ${ds.initial.find((s) => s.id === x.example)!.label}`,
              prompt: x.prompt,
              onTry: () => reset(x.example),
            }))}
        />
      )}
    </div>
  );
}

function OperationsPanel({ ds, model, onRun, children }: { ds: AnyStructure; model: Model; onRun: (spec: Spec, call: OpCall) => void; children: ReactNode }) {
  return (
    // A labelled group, not a landmark or a heading: a lesson can hold several explorers (see CLAUDE.md's accessibility conventions).
    <div role="group" className="flex flex-col gap-4 rounded-card bg-surface p-5 sm:p-6" aria-label="Operations">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-title-card">Operations</span>
        <span className="text-[13px] text-ink-muted">Each one plays step by step</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {ds.operations.map((spec) => (
          <OperationForm key={spec.id} spec={spec} model={model} onRun={onRun} />
        ))}
      </div>
      {children}
    </div>
  );
}

function OperationForm({ spec, model, onRun }: { spec: Spec; model: Model; onRun: (spec: Spec, call: OpCall) => void }) {
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.args.map((a) => [a.name, a.type === 'int' ? String(a.default ?? a.min) : ''])),
  );
  const [error, setError] = useState<string | null>(null);

  // A choice whose stored value no longer exists (or was never picked) shows a
  // default: the nth choice argument defaults to the nth option, so a pair like
  // "Add edge: from, to" opens on two different vertices rather than a self-loop.
  let choiceIndex = 0;
  const values: Record<string, string> = Object.fromEntries(
    spec.args.map((a) => {
      if (a.type !== 'choice') return [a.name, raw[a.name] ?? ''];
      const options = a.options(model);
      const fallback = options[Math.min(choiceIndex++, options.length - 1)] ?? '';
      return [a.name, options.includes(raw[a.name]) ? raw[a.name] : fallback];
    }),
  );
  const parsed = parseArgs(spec.args, values, model);
  const emptyChoice = spec.args.find((a) => a.type === 'choice' && a.options(model).length === 0);
  const disabledReason = emptyChoice
    ? `Nothing to choose for ${emptyChoice.label.toLowerCase()} yet.`
    : (spec.disabledReason?.(model, parsed ?? undefined) ?? null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed) {
      const bad = spec.args.find((a) => parseArg(a, values[a.name], model) === null)!;
      setError(argError(bad));
      return;
    }
    setError(null);
    onRun(spec, { op: spec.id, args: parsed });
    // Suggest a fresh value for the next run, so repeated inserts aren't all the same.
    setRaw((prev) =>
      Object.fromEntries(
        spec.args.map((a) => [a.name, a.type === 'int' ? String(a.min + Math.floor(Math.random() * (a.max - a.min + 1))) : prev[a.name]]),
      ),
    );
  };

  const field = 'h-9 min-w-0 rounded-full bg-surface px-3 font-mono text-sm text-ink placeholder:text-ink-muted';
  return (
    <form onSubmit={submit} className="flex max-w-full min-w-0 flex-col gap-1.5 rounded-tile bg-sunken p-1.5">
      <div className="flex items-center gap-2">
        {spec.args.map((a) =>
          a.type === 'choice' ? (
            <select
              key={a.name}
              aria-label={`${spec.label}: ${a.label}`}
              value={values[a.name]}
              onChange={(e) => setRaw((prev) => ({ ...prev, [a.name]: e.target.value }))}
              className={`${field} max-w-56`}
            >
              {a.options(model).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={a.name}
              aria-label={`${spec.label}: ${a.label}`}
              value={values[a.name]}
              onChange={(e) => setRaw((prev) => ({ ...prev, [a.name]: e.target.value }))}
              inputMode={a.type === 'int' ? 'numeric' : 'text'}
              placeholder={a.type === 'text' ? (a.placeholder ?? a.label) : a.label}
              className={`${field} w-24`}
            />
          ),
        )}
        <button
          type="submit"
          disabled={disabledReason != null}
          title={disabledReason ?? undefined}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-on-accent transition-colors duration-150 ease-standard hover:bg-accent-strong disabled:bg-line-strong disabled:text-ink-soft"
        >
          <FiPlay aria-hidden className="text-xs" /> {spec.label}
        </button>
      </div>
      {(error || disabledReason) && <p className="px-2 pb-1 text-xs text-ink-muted" role={error ? 'alert' : undefined}>{error ?? disabledReason}</p>}
    </form>
  );
}
