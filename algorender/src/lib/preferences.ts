'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_SPEED, SPEEDS } from '@/engine/useTracePlayer';

/**
 * Preferences kept on this device only (like the theme). For visualisers: the
 * playback speed one starts at, and whether it opens in Predict mode (read when
 * it starts; the learner can still change either on the page). For the code
 * editor: whether it suggests completions, and Vim keys. Set on the account
 * page. Pages render the built-in defaults on the server and pick up the
 * device's choice after hydration.
 */
const SPEED_KEY = 'algorender:speed';
const PREDICT_KEY = 'algorender:start-in-predict';
const AUTOCOMPLETE_KEY = 'algorender:editor-autocomplete';
const VIM_KEY = 'algorender:editor-vim';
const CHANGED = 'algorender:preferences';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not saved; the default stays.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The speed visualisers start at, in steps per second; one of SPEEDS. */
export function loadSpeed(): number {
  const value = Number(read(SPEED_KEY));
  return (SPEEDS as readonly number[]).includes(value) ? value : DEFAULT_SPEED;
}

export function saveSpeed(speed: number) {
  write(SPEED_KEY, speed === DEFAULT_SPEED ? null : String(speed));
}

/** Whether visualisers open in Predict mode when the link doesn't say. */
export function loadStartInPredict(): boolean {
  return read(PREDICT_KEY) === '1';
}

export function saveStartInPredict(on: boolean) {
  write(PREDICT_KEY, on ? '1' : null);
}

export function useStartSpeed(): number {
  return useSyncExternalStore(subscribe, loadSpeed, () => DEFAULT_SPEED);
}

export function useStartInPredict(): boolean {
  return useSyncExternalStore(subscribe, loadStartInPredict, () => false);
}

/** Whether the code editor suggests keywords and names as you type; on unless turned off (interview practice often has none). */
export function loadAutocomplete(): boolean {
  return read(AUTOCOMPLETE_KEY) !== 'off';
}

export function saveAutocomplete(on: boolean) {
  write(AUTOCOMPLETE_KEY, on ? null : 'off');
}

/** Whether the code editor uses Vim keys; off unless turned on. */
export function loadVim(): boolean {
  return read(VIM_KEY) === '1';
}

export function saveVim(on: boolean) {
  write(VIM_KEY, on ? '1' : null);
}

export function useAutocomplete(): boolean {
  return useSyncExternalStore(subscribe, loadAutocomplete, () => true);
}

export function useVim(): boolean {
  return useSyncExternalStore(subscribe, loadVim, () => false);
}
