import type { MetadataRoute } from 'next';
import { visualisers } from '@/data/visualisers';
import { exercises } from '@/content/exercises';
import { lessons } from '@/content/lessons';
import { SUPPORTED } from '@/play/be-the-algorithm/moves';
import { GAMES } from '@/play/games';
import { loadProblems } from '@/problems/load';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/learn`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/learn/placement`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/plan`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/play`, changeFrequency: 'monthly', priority: 0.7 },
    ...GAMES.map((g) => ({ url: `${SITE_URL}${g.href}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
    ...SUPPORTED.map((slug) => ({ url: `${SITE_URL}/play/be-the-algorithm/${slug}`, changeFrequency: 'monthly' as const, priority: 0.6 })),
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
