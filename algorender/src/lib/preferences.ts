'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_SPEED, SPEEDS } from '@/engine/useTracePlayer';

/**
 * Visualiser preferences, kept on this device only (like the theme): the
 * playback speed a visualiser starts at, and whether it opens in Predict mode.
 * Set on the account page; a visualiser reads them when it starts, and the
 * learner can still change either on the page. Pages render the built-in
 * defaults on the server and pick up the device's choice after hydration.
 */
const SPEED_KEY = 'algorender:speed';
const PREDICT_KEY = 'algorender:start-in-predict';
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
