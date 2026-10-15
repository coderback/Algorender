import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    // Embeds duplicate the visualiser pages without their explanations.
    rules: { userAgent: '*', allow: '/', disallow: '/embed/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
