'use client';

import { useState, type FormEvent } from 'react';
import { FiCornerUpLeft, FiPlay } from 'react-icons/fi';
import type { AnyStructure, OperationSpec } from '@/engine/module';
import { randomSeed } from '@/engine/random';
import { recordOperation } from '@/engine/trace';
import type { Trace } from '@/engine/types';
import { argError, blockedReason, describeCall, parseArg, parseArgs, parseOps, replay, serializeOps, type OpCall } from './operations';
import { Experiments } from './Experiments';
import type { ExplorerOptions } from './options';
import { DEFAULT_SEED } from './source';
import { TraceStage, type Density, type Mode } from './TraceStage';
import { modeFromParams, writeUrl } from './url';

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
  const [mode, setMode] = useState<Mode>(() => modeFromParams(options.params));
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
    <div className="space-y-4">
      <OperationsPanel ds={ds} model={session.model} onRun={run} />
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
      />
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-xs font-medium text-gray-500">History</span>
          {session.history.length === 0 ? (
            <span className="text-gray-400">No operations yet.</span>
          ) : (
            session.history.map((h, i) => (
              <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 font-mono text-xs text-gray-700">
                {describeCall(h.call, ds)}
              </span>
            ))
          )}
          {session.history.length > 0 && (
            <button type="button" onClick={undo} className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-50">
              <FiCornerUpLeft aria-hidden /> Undo
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500">Start over with</span>
          {ds.initial.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => reset(s.id)}
              className="rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {options.showExperiments && (
      <Experiments
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

function OperationsPanel({ ds, model, onRun }: { ds: AnyStructure; model: Model; onRun: (spec: Spec, call: OpCall) => void }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs" aria-label="Operations">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Operations</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {ds.operations.map((spec) => (
          <OperationForm key={spec.id} spec={spec} model={model} onRun={onRun} />
        ))}
      </div>
    </section>
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

  const field = 'w-20 min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 font-mono text-sm focus:border-blue-500 focus:outline-none';
  return (
    <form onSubmit={submit} className="flex flex-col gap-1 rounded-lg border border-gray-200 p-2.5">
      <div className="flex items-center gap-2">
        {spec.args.map((a) =>
          a.type === 'choice' ? (
            <select
              key={a.name}
              aria-label={`${spec.label}: ${a.label}`}
              value={values[a.name]}
              onChange={(e) => setRaw((prev) => ({ ...prev, [a.name]: e.target.value }))}
              className={`${field} bg-white`}
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
              className={field}
            />
          ),
        )}
        <button
          type="submit"
          disabled={disabledReason != null}
          title={disabledReason ?? undefined}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          <FiPlay aria-hidden className="text-xs" /> {spec.label}
        </button>
      </div>
      {(error || disabledReason) && <p className="text-xs text-gray-500" role={error ? 'alert' : undefined}>{error ?? disabledReason}</p>}
    </form>
  );
}
