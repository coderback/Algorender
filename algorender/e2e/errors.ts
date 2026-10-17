import type { Page } from '@playwright/test';

/**
 * Collects uncaught errors and console errors on a page. Vercel's own scripts
 * (/_vercel/insights, served only when deployed there) 404 under a local
 * `next start`, so they are ignored: the suite can run against a production build.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.includes('/_vercel/')) errors.push(m.text());
  });
  return errors;
}
