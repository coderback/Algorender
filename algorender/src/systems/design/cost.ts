// What a design costs to run, in dollars a month. The prices are round
// numbers in the range of on-demand cloud list prices (late 2020s), meant for
// comparing designs with each other, not for budgeting:
//
// - a load balancer: $20 a month, plus nothing per request;
// - a rate limiter: $10 (it usually lives in the gateway or load balancer);
// - an app instance: $70 (about 2 vCPU and 4 GB) for up to 8 workers; more
//   workers need a bigger machine, so each further 8 (or part) costs as much
//   again (workers are concurrency the simulator gives for real, so they
//   can't be free, or turning them up would beat every design choice);
// - a cache node: $25, plus $10 per GB of memory, at about 1 KB per cached key;
// - a database node: $250 for each primary and each replica, in every shard,
//   for up to 32 connections; each further 32 (or part) costs as much again;
// - a queue: $40 for the broker, plus $15 per consumer.
//
// Clients are free: they are the users.

import type { Component, Design } from './types';

export const PRICES = {
  loadBalancer: 20,
  rateLimiter: 10,
  appInstance: 70,
  /** Workers one app-instance price covers. */
  appWorkersPerInstance: 8,
  cacheNode: 25,
  cachePerGb: 10,
  /** Bytes assumed per cached key (key, value and overhead). */
  cacheBytesPerKey: 1024,
  databaseNode: 250,
  /** Connections one database-node price covers. */
  databaseWorkersPerNode: 32,
  queue: 40,
  queueConsumer: 15,
} as const;

/** Dollars a month for one component, as configured. */
export function componentCost(c: Component): number {
  switch (c.kind) {
    case 'clients':
      return 0;
    case 'rate-limiter':
      return PRICES.rateLimiter;
    case 'load-balancer':
      return PRICES.loadBalancer;
    case 'app':
      return c.instances * Math.ceil(c.workers / PRICES.appWorkersPerInstance) * PRICES.appInstance;
    case 'cache': {
      const gb = (c.capacity * PRICES.cacheBytesPerKey) / 1024 ** 3;
      return Math.round(c.nodes * (PRICES.cacheNode + gb * PRICES.cachePerGb));
    }
    case 'database':
      return c.shards * (1 + c.replicas) * Math.ceil(c.workers / PRICES.databaseWorkersPerNode) * PRICES.databaseNode;
    case 'queue':
      return PRICES.queue + c.consumers * PRICES.queueConsumer;
  }
}

export const costPerMonth = (design: Design) => design.components.reduce((sum, c) => sum + componentCost(c), 0);
