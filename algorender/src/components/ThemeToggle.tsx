'use client';

import { useSyncExternalStore } from 'react';
import { FiMonitor, FiMoon, FiSun } from 'react-icons/fi';
import { THEME_KEY } from '@/lib/theme';

export type Theme = 'system' | 'light' | 'dark';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const ICON = { system: FiMonitor, light: FiSun, dark: FiMoon };
const EVENT = 'algorender:theme';

const read = (): Theme => {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'system';
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
};

function apply(theme: Theme) {
  const root = document.documentElement;
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the choice still applies to this page.
  }
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  window.dispatchEvent(new Event(EVENT));
}

/** Cycles System → Light → Dark. System follows the OS setting. */
export function ThemeToggle() {
  // The server can't know the saved theme, so hydration starts from "system".
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme);
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = ICON[theme];
  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[theme]}`}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-sunken hover:text-ink"
    >
      <Icon aria-hidden className="text-lg" />
    </button>
  );
}
