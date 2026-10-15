import type { MetadataRoute } from 'next';
import { visualisers } from '@/data/visualisers';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/compare`, changeFrequency: 'monthly', priority: 0.8 },
    ...visualisers
      .filter((v) => !v.hidden)
      .map((v) => ({ url: `${SITE_URL}${v.path}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
