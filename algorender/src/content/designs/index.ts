import type { CaseStudy } from '@/systems/design/types';
import { chat } from './chat';
import { keyValueStore } from './key-value-store';
import { newsFeed } from './news-feed';
import { rateLimitedApi } from './rate-limited-api';
import { urlShortener } from './url-shortener';

// System-design case studies (phase 6d): each is a brief with fixed traffic,
// targets the simulator checks, a starting design and a reference design that
// passes. One file per case in this folder, listed here in teaching order:
// a cache, shedding load, a queue, sharding, then replication and failover.
export const caseStudies: readonly CaseStudy[] = [urlShortener, rateLimitedApi, newsFeed, chat, keyValueStore];

export function getCaseStudy(slug: string): CaseStudy | undefined {
  return caseStudies.find((c) => c.slug === slug);
}
