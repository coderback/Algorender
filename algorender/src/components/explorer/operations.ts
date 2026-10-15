import type { AnyStructure, Args, ArgSpec } from '@/engine/module';
import { recordOperation } from '@/engine/trace';

/** One applied operation, as stored in the URL and the history list. */
export type OpCall = { op: string; args: Args };

/* eslint-disable @typescript-eslint/no-explicit-any -- a structure's model type is opaque here */
type AnyArg = ArgSpec<any>;
type Model = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** "push:5;pop;insert:3" — values URI-encoded, in the operation's argument order. */
export function serializeOps(calls: readonly OpCall[], ds: AnyStructure): string {
  return calls
    .map(({ op, args }) => {
      const spec = ds.operations.find((o) => o.id === op);
      const values = spec ? spec.args.map((a) => encodeURIComponent(String(args[a.name]))) : [];
      return [op, ...values].join(':');
    })
    .join(';');
}

/** Parses the URL form. Choice arguments are checked against the model later, in replay(). */
export function parseOps(text: string, ds: AnyStructure): OpCall[] {
  const calls: OpCall[] = [];
  for (const token of text.split(';').filter(Boolean)) {
    const [id, ...raw] = token.split(':');
    const spec = ds.operations.find((o) => o.id === id);
    if (!spec || raw.length !== spec.args.length) break;
    const args: Args = {};
    let ok = true;
    spec.args.forEach((a, i) => {
      const value = parseArg(a, decodeURIComponent(raw[i]));
      if (value === null) ok = false;
      else args[a.name] = value;
    });
    if (!ok) break;
    calls.push({ op: id, args });
  }
  return calls;
}

/**
 * Parses one raw input. Choice values are checked against `model`'s options
 * when a model is given; without one (URL parsing) any non-empty string passes.
 */
export function parseArg(spec: AnyArg, raw: string, model?: Model): number | string | null {
  if (spec.type === 'int') {
    if (raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= spec.min && n <= spec.max ? n : null;
  }
  const s = raw.trim();
  if (spec.type === 'choice') {
    if (s === '') return null;
    return model === undefined || spec.options(model).includes(s) ? s : null;
  }
  return s.length > 0 && s.length <= spec.maxLength ? s : null;
}

/** Parses every argument of an operation, or returns null if any is invalid. */
export function parseArgs(args: readonly AnyArg[], raw: Record<string, string>, model?: Model): Args | null {
  const parsed: Args = {};
  for (const a of args) {
    const value = parseArg(a, raw[a.name] ?? '', model);
    if (value === null) return null;
    parsed[a.name] = value;
  }
  return parsed;
}

export function argError(a: AnyArg): string {
  if (a.type === 'int') return `${a.label}: a whole number from ${a.min} to ${a.max}.`;
  if (a.type === 'choice') return `${a.label}: pick one of the options.`;
  return `${a.label}: 1–${a.maxLength} characters.`;
}

/** Why `call` can't run on `model` (invalid argument or disabledReason), or null. */
export function blockedReason(ds: AnyStructure, model: Model, call: OpCall): string | null {
  const spec = ds.operations.find((o) => o.id === call.op);
  if (!spec) return `Unknown operation "${call.op}".`;
  const raw = Object.fromEntries(spec.args.map((a) => [a.name, String(call.args[a.name] ?? '')]));
  const bad = spec.args.find((a) => parseArg(a, raw[a.name], model) === null);
  if (bad) return argError(bad);
  return spec.disabledReason?.(model, call.args) ?? null;
}

/**
 * Applies operations without animating them (used to rebuild a shared state
 * from the URL). Stops at the first call that is invalid for the current model.
 */
export function replay<M>(ds: AnyStructure, start: M, calls: readonly OpCall[]): { model: M; applied: { call: OpCall; before: M }[] } {
  let model = start;
  const applied: { call: OpCall; before: M }[] = [];
  for (const call of calls) {
    if (blockedReason(ds, model, call)) break;
    const spec = ds.operations.find((o) => o.id === call.op)!;
    const { result } = recordOperation(spec.run(model, call.args));
    applied.push({ call, before: model });
    model = result as M;
  }
  return { model, applied };
}

export function describeCall({ op, args }: OpCall, ds: AnyStructure): string {
  const spec = ds.operations.find((o) => o.id === op);
  const values = spec?.args.map((a) => args[a.name]) ?? [];
  return `${spec?.label ?? op}${values.length ? ` ${values.join(', ')}` : ''}`;
}
