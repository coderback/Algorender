import type { AnyStructure, Args, ArgSpec } from '@/engine/module';
import { recordOperation } from '@/engine/trace';

/** One applied operation, as stored in the URL and the history list. */
export type OpCall = { op: string; args: Args };

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

export function parseArg(spec: ArgSpec, raw: string): number | string | null {
  if (spec.type === 'int') {
    const n = Number(raw);
    return Number.isInteger(n) && n >= spec.min && n <= spec.max ? n : null;
  }
  const s = raw.trim();
  return s.length > 0 && s.length <= spec.maxLength ? s : null;
}

/**
 * Applies operations without animating them (used to rebuild a shared state
 * from the URL). Stops at the first call that is invalid for the current model.
 */
export function replay<M>(ds: AnyStructure, start: M, calls: readonly OpCall[]): { model: M; applied: { call: OpCall; before: M }[] } {
  let model = start;
  const applied: { call: OpCall; before: M }[] = [];
  for (const call of calls) {
    const spec = ds.operations.find((o) => o.id === call.op);
    if (!spec || spec.disabledReason?.(model)) break;
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
