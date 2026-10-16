import type { MetadataRoute } from 'next';
import { visualisers } from '@/data/visualisers';
import { exercises } from '@/content/exercises';
import { lessons } from '@/content/lessons';
import { loadProblems } from '@/problems/load';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/learn`, changeFrequency: 'weekly', priority: 0.9 },
    ...lessons.map((l) => ({ url: `${SITE_URL}/learn/${l.slug}`, changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: `${SITE_URL}/code`, changeFrequency: 'weekly', priority: 0.9 },
    ...exercises.map((e) => ({ url: `${SITE_URL}/code/${e.slug}`, changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: `${SITE_URL}/practice`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/practice/drills`, changeFrequency: 'monthly', priority: 0.7 },
    ...loadProblems().map((p) => ({ url: `${SITE_URL}/practice/${p.slug}`, changeFrequency: 'monthly' as const, priority: 0.8 })),
    { url: `${SITE_URL}/compare`, changeFrequency: 'monthly', priority: 0.8 },
    ...visualisers
      .filter((v) => !v.hidden)
      .map((v) => ({ url: `${SITE_URL}${v.path}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
