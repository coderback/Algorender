'use client';

import { useEffect } from 'react';

/** Registers public/sw.js (offline support) in production builds; in development it would cache stale code. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No offline support this visit; the site works as usual.
    });
  }, []);
  return null;
}
