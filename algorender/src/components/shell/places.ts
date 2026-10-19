// The six places of the app (docs/redesign IA): the rail on desktop and the
// tab bar on phones. Every route belongs to one place, which is active for
// the whole section (Learn stays active on a lesson and on /plan).

export type PlaceId = 'today' | 'learn' | 'explore' | 'practice' | 'play' | 'review';

export interface Place {
  id: PlaceId;
  label: string;
  href: string;
}

export const PLACES: readonly Place[] = [
  { id: 'today', label: 'Today', href: '/' },
  { id: 'learn', label: 'Learn', href: '/learn' },
  { id: 'explore', label: 'Explore', href: '/explore' },
  { id: 'practice', label: 'Practice', href: '/practice' },
  { id: 'play', label: 'Play', href: '/play' },
  { id: 'review', label: 'Review', href: '/review' },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** The place a route belongs to, or null (account, development pages). */
export function placeOf(pathname: string): PlaceId | null {
  if (pathname === '/') return 'today';
  if (under(pathname, '/learn') || under(pathname, '/plan')) return 'learn';
  if (under(pathname, '/explore') || under(pathname, '/visualisers') || under(pathname, '/compare') || under(pathname, '/embed')) return 'explore';
  if (under(pathname, '/practice') || under(pathname, '/code') || under(pathname, '/design')) return 'practice';
  if (under(pathname, '/play')) return 'play';
  if (under(pathname, '/review')) return 'review';
  return null;
}

/**
 * Hubs show the phone tab bar; every page below a hub is focused on phones
 * (a back button instead of the tab bar).
 */
const HUBS = new Set(['/', '/learn', '/plan', '/explore', '/practice', '/design', '/play', '/account']);

export const isHub = (pathname: string) => HUBS.has(pathname);

/** Where a page's back (or close) button goes: the page above it. */
export function parentOf(pathname: string): string {
  if (pathname.startsWith('/design/')) return '/design';
  if (pathname.startsWith('/code/')) return '/code';
  if (pathname.startsWith('/play/be-the-algorithm/')) return '/play/be-the-algorithm';
  if (pathname === '/review') return '/';
  const place = placeOf(pathname);
  return place ? (PLACES.find((p) => p.id === place)?.href ?? '/') : '/';
}
