import { describe, expect, it } from 'vitest';
import type { Component, Design } from '@/systems/design/types';
import { configSummary, compact, ms, pct } from './format';
import { edgePath, layout, NODE, tiersOf } from './layout';
import { decodeDesign, encodeDesign, parseDesign } from './url';
import { addComponent, edgesOf, freshId, PORTS, removeComponent, renameComponent, targetsFor } from './wiring';

const clients: Component = { id: 'users', kind: 'clients', label: 'Users', workload: { rps: 2000, readShare: 0.9, keys: 10_000, skew: 1 }, to: 'lb' };
const lb: Component = { id: 'lb', kind: 'load-balancer', label: 'Load balancer', policy: 'round-robin', to: 'api' };
const app: Component = { id: 'api', kind: 'app', label: 'API', instances: 4, workers: 8, serviceMs: 5, reads: 'cache', writes: 'db', fanout: 1 };
const cache: Component = { id: 'cache', kind: 'cache', label: 'Cache', nodes: 2, capacity: 1000, policy: 'lru', serviceMs: 1, writes: 'invalidate', to: 'db' };
const db: Component = {
  id: 'db',
  kind: 'database',
  label: 'Database',
  shards: 1,
  replicas: 2,
  workers: 16,
  readMs: 5,
  writeMs: 10,
  replicaLagMs: 50,
  failover: true,
  failoverMs: 2000,
};
const design: Design = { components: [clients, lb, app, cache, db] };

describe('wiring', () => {
  it('draws one edge per connection, merging two ports to the same target', () => {
    const merged: Design = { components: [clients, lb, { ...app, reads: 'db' }, db] };
    expect(edgesOf(merged).map((e) => `${e.from}>${e.to}:${e.label}`)).toEqual(['users>lb:requests', 'lb>api:spread', 'api>db:reads & writes']);
    expect(edgesOf(design)).toHaveLength(5);
  });

  it('offers only kinds a port may point at', () => {
    const reads = PORTS.app.find((p) => p.field === 'reads')!;
    expect(targetsFor(design, app, reads).map((c) => c.id)).toEqual(['cache', 'db']);
    expect(targetsFor(design, lb, PORTS['load-balancer'][0]).map((c) => c.id)).toEqual(['api']);
  });

  it('renames references with the component and empties them when it is removed', () => {
    const renamed = renameComponent(design, 'db', 'store');
    expect(renamed.components.map((c) => c.id)).toEqual(['users', 'lb', 'api', 'cache', 'store']);
    expect(renamed.components.find((c) => c.id === 'api')).toMatchObject({ writes: 'store' });
    expect(renamed.components.find((c) => c.id === 'cache')).toMatchObject({ to: 'store' });
    const removed = removeComponent(design, 'cache');
    expect(removed.components.find((c) => c.id === 'api')).toMatchObject({ reads: '' });
  });

  it('picks fresh ids and wires a new component into the one open port that fits', () => {
    expect(freshId(design, 'cache')).toBe('cache-2');
    expect(freshId(design, 'queue')).toBe('queue');
    const noCache = removeComponent(design, 'cache');
    const added = addComponent(noCache, { ...cache, id: 'cache' });
    expect(added.components.find((c) => c.id === 'api')).toMatchObject({ reads: 'cache' });
    // With no single open port, nothing is wired.
    expect(addComponent(design, { ...cache, id: 'cache-2' }).components.find((c) => c.id === 'api')).toMatchObject({ reads: 'cache' });
  });
});

describe('layout', () => {
  it('places components in tiers by the longest chain leading to them', () => {
    expect(tiersOf(design)).toEqual({ users: 0, lb: 1, api: 2, cache: 3, db: 4 });
    // An unconnected component starts its own chain.
    expect(tiersOf({ components: [...design.components, { id: 'q', kind: 'queue', label: 'Queue', consumers: 2, to: 'db' }] }).q).toBe(0);
  });

  it('keeps positions when settings change, and fits every node inside the canvas in both orientations', () => {
    const tuned: Design = { components: design.components.map((c) => (c.kind === 'app' ? { ...c, instances: 20, workers: 2 } : c)) };
    for (const o of ['horizontal', 'vertical'] as const) {
      const a = layout(design, o);
      expect(layout(tuned, o).nodes).toEqual(a.nodes);
      for (const n of a.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x + NODE.w).toBeLessThanOrEqual(a.width);
        expect(n.y + NODE.h).toBeLessThanOrEqual(a.height);
      }
      const ids = a.nodes.map((n) => `${n.x},${n.y}`);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('draws edges between facing sides', () => {
    const l = layout(design, 'horizontal');
    const [users, lbNode] = l.nodes;
    expect(edgePath(users, lbNode, 'horizontal').d.startsWith(`M${users.x + NODE.w},`)).toBe(true);
    const v = layout(design, 'vertical');
    expect(edgePath(v.nodes[0], v.nodes[1], 'vertical').d).toContain(`,${v.nodes[0].y + NODE.h} `);
  });
});

describe('url', () => {
  it('round-trips a design, and rejects text that is not one', () => {
    const text = encodeDesign(design);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeDesign(text)).toEqual(design);
    expect(decodeDesign('not-a-design')).toBeNull();
    expect(decodeDesign(null)).toBeNull();
    expect(parseDesign([lb, app])).toBeNull(); // no clients
    expect(parseDesign([clients, { ...clients, id: 'more' }])).toBeNull(); // two clients
    expect(parseDesign([clients, { ...app, id: 'users' }])).toBeNull(); // duplicate id
  });
});

describe('format', () => {
  it('summarises settings and numbers briefly', () => {
    expect(configSummary(app)).toBe('4 × app, 8 workers');
    expect(configSummary(db)).toBe('primary + 2 replicas');
    expect(configSummary(clients)).toBe('2K req/s, 90% reads');
    expect(compact(1500)).toBe('1.5K');
    expect(compact(25_000)).toBe('25K');
    expect(ms(1234)).toBe('1.23 s');
    expect(ms(4.25)).toBe('4.3 ms');
    expect(pct(0.0004)).toBe('<0.1%');
    expect(pct(0.25)).toBe('25%');
  });
});
