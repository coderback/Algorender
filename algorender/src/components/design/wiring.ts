import type { Component, ComponentKind, Design, Ref } from '@/systems/design/types';

// What may connect to what on the canvas, and edits that keep the wiring
// consistent (renaming a component renames the references to it; removing
// one leaves the references to it empty, which validation then reports).

/**
 * A component's outgoing connection: the field that holds it and what it may
 * point at (the same rules as ALLOWED in src/systems/design/validate.ts).
 * `optional`: may be left empty (an app that answers without a store).
 */
export type Port = { field: string; label: string; edge: string; targets: readonly ComponentKind[]; optional?: boolean };

export const PORTS: Readonly<Record<ComponentKind, readonly Port[]>> = {
  clients: [{ field: 'to', label: 'Sends requests to', edge: 'requests', targets: ['rate-limiter', 'load-balancer', 'app'] }],
  'rate-limiter': [{ field: 'to', label: 'Lets requests through to', edge: 'allowed', targets: ['load-balancer', 'app'] }],
  'load-balancer': [{ field: 'to', label: 'Spreads requests over', edge: 'spread', targets: ['app'] }],
  app: [
    { field: 'reads', label: 'Reads from', edge: 'reads', targets: ['cache', 'database'], optional: true },
    { field: 'writes', label: 'Writes to', edge: 'writes', targets: ['cache', 'database', 'queue'], optional: true },
  ],
  cache: [{ field: 'to', label: 'On a miss, and for writes, goes to', edge: 'misses', targets: ['database'] }],
  queue: [{ field: 'to', label: 'Consumers apply writes to', edge: 'applies', targets: ['database', 'cache'] }],
  database: [],
};

/** The order kinds appear in the palette (clients can't be added: there is always exactly one). */
export const PALETTE: readonly ComponentKind[] = ['rate-limiter', 'load-balancer', 'app', 'cache', 'database', 'queue'];

export const refOf = (c: Component, field: string): Ref => String((c as unknown as Record<string, unknown>)[field] ?? '');

/** Components a port may point at, in design order. */
export function targetsFor(design: Design, from: Component, port: Port): Component[] {
  return design.components.filter((c) => c.id !== from.id && port.targets.includes(c.kind));
}

/** A drawn connection. */
export type Edge = { id: string; from: Ref; to: Ref; label: string };

/** Every connection that points at a component that exists. Two ports to one target (an app's reads and writes to one database) are merged into one edge. */
export function edgesOf(design: Design): Edge[] {
  const ids = new Set(design.components.map((c) => c.id));
  const byPair = new Map<string, Edge>();
  for (const c of design.components) {
    for (const port of PORTS[c.kind]) {
      const to = refOf(c, port.field);
      if (!to || !ids.has(to)) continue;
      const key = `${c.id}>${to}`;
      const seen = byPair.get(key);
      if (seen) seen.label = `${seen.label} & ${port.edge}`;
      else byPair.set(key, { id: key, from: c.id, to, label: port.edge });
    }
  }
  return [...byPair.values()];
}

/** A fresh id for a new component of this kind: "cache", then "cache-2", "cache-3"… */
export function freshId(design: Design, kind: ComponentKind): Ref {
  const base = kind === 'load-balancer' ? 'lb' : kind === 'rate-limiter' ? 'limiter' : kind === 'database' ? 'db' : kind;
  const taken = new Set(design.components.map((c) => c.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export const ID_PATTERN = /^[a-z][a-z0-9-]{0,19}$/;

/** Replaces one component, keeping its place. */
export function replaceComponent(design: Design, id: Ref, next: Component): Design {
  return { components: design.components.map((c) => (c.id === id ? next : c)) };
}

/** Renames a component and every reference to it. */
export function renameComponent(design: Design, id: Ref, to: Ref): Design {
  return {
    components: design.components.map((c) => {
      let out = (c.id === id ? { ...c, id: to } : c) as Component;
      for (const port of PORTS[c.kind]) if (refOf(c, port.field) === id) out = { ...out, [port.field]: to } as Component;
      return out;
    }),
  };
}

/** Removes a component; references to it become empty. */
export function removeComponent(design: Design, id: Ref): Design {
  return {
    components: design.components
      .filter((c) => c.id !== id)
      .map((c) => {
        let out = c;
        for (const port of PORTS[c.kind]) if (refOf(c, port.field) === id) out = { ...out, [port.field]: '' } as Component;
        return out;
      }),
  };
}

/**
 * Adds a component. Its own required connections are wired when exactly one
 * component fits each, and when exactly one existing empty port could point at
 * it, that port is wired to it.
 */
export function addComponent(design: Design, component: Component): Design {
  let added = component;
  for (const port of PORTS[component.kind]) {
    if (port.optional || refOf(added, port.field)) continue;
    const fits = targetsFor(design, added, port);
    if (fits.length === 1) added = { ...added, [port.field]: fits[0].id } as Component;
  }
  const open = design.components.flatMap((c) =>
    PORTS[c.kind].filter((p) => p.targets.includes(component.kind) && !design.components.some((x) => x.id === refOf(c, p.field))).map((p) => ({ c, p })),
  );
  const next: Design = { components: [...design.components, added] };
  if (open.length !== 1) return next;
  const { c, p } = open[0];
  return replaceComponent(next, c.id, { ...c, [p.field]: added.id } as Component);
}

/** Components with a connection problem: a required port empty, a port at a missing or wrong kind, or no traffic reaching them. */
export function problemIds(design: Design): Set<Ref> {
  const byId = new Map(design.components.map((c) => [c.id, c]));
  const bad = new Set<Ref>();
  for (const c of design.components) {
    for (const port of PORTS[c.kind]) {
      const to = refOf(c, port.field);
      if (to === '' ? !port.optional : !port.targets.includes(byId.get(to)?.kind as ComponentKind)) bad.add(c.id);
    }
  }
  const clients = design.components.find((c) => c.kind === 'clients');
  const reached = new Set<Ref>();
  const walk = (c: Component | undefined) => {
    if (!c || reached.has(c.id)) return;
    reached.add(c.id);
    for (const port of PORTS[c.kind]) walk(byId.get(refOf(c, port.field)));
  };
  walk(clients);
  for (const c of design.components) if (!reached.has(c.id)) bad.add(c.id);
  return bad;
}
