'use client';

import { clsx } from 'clsx';
import { useSyncExternalStore } from 'react';
import { FiMonitor, FiMoon, FiSun } from 'react-icons/fi';
import { THEME_KEY } from '@/lib/theme';

export type Theme = 'system' | 'light' | 'dark';

const ORDER: Theme[] = ['system', 'light', 'dark'];
export const THEME_LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };
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

export function applyTheme(theme: Theme) {
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

/** The current theme choice and the next one in the System → Light → Dark cycle. */
export function useTheme(): { theme: Theme; next: Theme } {
  // The server can't know the saved theme, so hydration starts from "system".
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme);
  return { theme, next: ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] };
}

/** Cycles System → Light → Dark. System follows the OS setting. */
export function ThemeToggle({ variant = 'plain', className }: { variant?: 'plain' | 'rail'; className?: string }) {
  const { theme, next } = useTheme();
  const Icon = ICON[theme];
  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[next]}`}
      title={`Theme: ${THEME_LABEL[theme]}`}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center transition-colors duration-150 ease-standard',
        variant === 'rail'
          ? 'size-12 rounded-full bg-rail-button text-rail-ink hover:text-rail-active'
          : 'size-10 rounded-full bg-surface text-ink-soft ring-1 ring-line ring-inset hover:text-ink',
        className,
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
