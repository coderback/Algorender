// What stops a design from running, in plain words: missing or wrong wiring,
// parts no traffic reaches, numbers out of bounds.

import { KIND_INFO, LIMITS } from './build';
import type { Component, ComponentKind, Design, Ref } from './types';

/** Which kinds each wire may point at. An app's reads and writes may also be empty: the app answers on its own. */
export const ALLOWED: Record<string, readonly ComponentKind[]> = {
  'clients.to': ['rate-limiter', 'load-balancer', 'app'],
  'rate-limiter.to': ['load-balancer', 'app'],
  'load-balancer.to': ['app'],
  'app.reads': ['cache', 'database'],
  'app.writes': ['cache', 'database', 'queue'],
  'cache.to': ['database'],
  'queue.to': ['cache', 'database'],
};

/** Each component's wires: [field, target] pairs. */
export function wires(c: Component): [string, Ref][] {
  switch (c.kind) {
    case 'clients':
    case 'rate-limiter':
    case 'load-balancer':
    case 'cache':
    case 'queue':
      return [['to', c.to]];
    case 'app':
      return [
        ['reads', c.reads],
        ['writes', c.writes],
      ];
    case 'database':
      return [];
  }
}

const INTEGER = new Set(['workload.rps', 'workload.keys', 'rate-limiter.burst', 'rate-limiter.perSecond', 'app.instances', 'app.workers', 'app.fanout', 'cache.nodes', 'cache.capacity', 'database.shards', 'database.replicas', 'database.workers', 'queue.consumers']);

const quoted = (c: Component) => `“${c.label || c.id}”`;
const kindName = (k: ComponentKind) => KIND_INFO[k].name.toLowerCase();
const listKinds = (kinds: readonly ComponentKind[]) => kinds.map(kindName).join(' or ');

function numberProblems(c: Component): string[] {
  const out: string[] = [];
  const check = (key: string, value: number, name: string) => {
    const lim = LIMITS[key];
    if (!lim) return;
    if (!Number.isFinite(value) || value < lim.min || value > lim.max) out.push(`${quoted(c)}: ${name} must be between ${lim.min.toLocaleString('en-GB')} and ${lim.max.toLocaleString('en-GB')}.`);
    else if (INTEGER.has(key) && !Number.isInteger(value)) out.push(`${quoted(c)}: ${name} must be a whole number.`);
  };
  switch (c.kind) {
    case 'clients': {
      const w = c.workload;
      check('workload.rps', w.rps, 'requests a second');
      check('workload.readShare', w.readShare, 'the share of reads');
      check('workload.keys', w.keys, 'the number of keys');
      check('workload.skew', w.skew, 'the skew');
      if (w.spike) {
        check('workload.spike.at', w.spike.at, 'the spike’s start');
        check('workload.spike.seconds', w.spike.seconds, 'the spike’s length');
        check('workload.spike.factor', w.spike.factor, 'the spike’s size');
      }
      break;
    }
    case 'rate-limiter':
      check('rate-limiter.burst', c.burst, 'the burst');
      check('rate-limiter.perSecond', c.perSecond, 'the rate');
      break;
    case 'app':
      check('app.instances', c.instances, 'instances');
      check('app.workers', c.workers, 'workers');
      check('app.serviceMs', c.serviceMs, 'the work per request');
      check('app.fanout', c.fanout, 'the fan-out');
      break;
    case 'cache':
      check('cache.nodes', c.nodes, 'nodes');
      check('cache.capacity', c.capacity, 'the capacity');
      check('cache.serviceMs', c.serviceMs, 'the lookup time');
      break;
    case 'database':
      check('database.shards', c.shards, 'shards');
      check('database.replicas', c.replicas, 'replicas');
      check('database.workers', c.workers, 'connections');
      check('database.readMs', c.readMs, 'the read time');
      check('database.writeMs', c.writeMs, 'the write time');
      check('database.replicaLagMs', c.replicaLagMs, 'the replica lag');
      check('database.failoverMs', c.failoverMs, 'the failover time');
      break;
    case 'queue':
      check('queue.consumers', c.consumers, 'consumers');
      break;
    case 'load-balancer':
      break;
  }
  return out;
}

/** Problems that stop a run, in plain words; empty when the design can run. */
export function validateDesign(design: Design): string[] {
  const problems: string[] = [];
  const byId = new Map<Ref, Component>();
  for (const c of design.components) {
    if (!c.id.trim()) problems.push(`A ${kindName(c.kind)} has no id.`);
    else if (byId.has(c.id)) problems.push(`Two components share the id “${c.id}”.`);
    else byId.set(c.id, c);
  }

  const clients = design.components.filter((c) => c.kind === 'clients');
  if (clients.length === 0) problems.push('There are no clients: add where the traffic comes from.');
  if (clients.length > 1) problems.push('A design has one group of clients; remove the extra ones.');

  for (const c of design.components) {
    for (const [field, target] of wires(c)) {
      const allowed = ALLOWED[`${c.kind}.${field}`];
      if (target === '') {
        if (c.kind !== 'app') problems.push(`${quoted(c)} doesn’t send anywhere yet: connect it to a ${listKinds(allowed)}.`);
        continue;
      }
      const to = byId.get(target);
      if (!to) problems.push(`${quoted(c)} sends ${field === 'to' ? '' : `${field} `}to “${target}”, which isn’t in the design.`);
      else if (!allowed.includes(to.kind))
        problems.push(`${quoted(c)} sends ${field === 'to' ? '' : `${field} `}to ${quoted(to)}, a ${kindName(to.kind)}; it can only send ${field === 'to' ? '' : `${field} `}to a ${listKinds(allowed)}.`);
    }
    problems.push(...numberProblems(c));
  }

  // Cycles and reachability, over wires that point at real components.
  const next = (c: Component) => wires(c).map(([, t]) => byId.get(t)).filter((x): x is Component => x !== undefined);
  const state = new Map<Ref, 1 | 2>();
  let cyclic = false;
  const visit = (c: Component) => {
    state.set(c.id, 1);
    for (const n of next(c)) {
      const s = state.get(n.id);
      if (s === 1) cyclic = true;
      else if (s === undefined) visit(n);
    }
    state.set(c.id, 2);
  };
  if (clients.length === 1) {
    visit(clients[0]);
    for (const c of design.components) if (!state.has(c.id) && byId.get(c.id) === c) problems.push(`${quoted(c)} isn’t connected: no traffic reaches it.`);
  }
  for (const c of byId.values()) if (!state.has(c.id)) visit(c);
  if (cyclic) problems.push('The wiring goes round in a circle; requests would never finish.');

  return problems;
}
