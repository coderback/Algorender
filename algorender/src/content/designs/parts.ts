import { DEFAULT_WORKLOAD, newComponent } from '@/systems/design/build';
import type { App, Cache, Clients, Database, LoadBalancer, Queue, RateLimiter, Ref, Workload } from '@/systems/design/types';

// Short builders for case-study designs: the engine's defaults, with the
// fields a case cares about overridden. Ids are the conventional ones the
// briefs and hints refer to ("lb", "app", "cache", "db", "queue", "limiter").

type Without<T> = Partial<Omit<T, 'kind'>>;

export const clients = (to: Ref, workload: Workload = DEFAULT_WORKLOAD): Clients => ({ ...(newComponent('clients', 'clients') as Clients), workload, to });

export const limiter = (o: Without<RateLimiter> & { to: Ref }): RateLimiter => ({ ...(newComponent('rate-limiter', 'limiter') as RateLimiter), ...o });

export const lb = (to: Ref, o: Without<LoadBalancer> = {}): LoadBalancer => ({ ...(newComponent('load-balancer', 'lb') as LoadBalancer), to, ...o });

export const app = (o: Without<App>): App => ({ ...(newComponent('app', 'app') as App), ...o });

export const cache = (o: Without<Cache> & { to: Ref }): Cache => ({ ...(newComponent('cache', 'cache') as Cache), ...o });

export const db = (o: Without<Database> = {}): Database => ({ ...(newComponent('database', 'db') as Database), ...o });

export const queue = (o: Without<Queue> & { to: Ref }): Queue => ({ ...(newComponent('queue', 'queue') as Queue), ...o });
