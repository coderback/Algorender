'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Language } from './protocol';
import { runtimeFor } from './runner';

/** The worker for a language and its status ("Loading Python…", ready, failed), for anything that runs code. */
export function useRuntime(language: Language) {
  const runtime = runtimeFor(language);
  const status = useSyncExternalStore(
    useCallback((cb: () => void) => runtime.onStatus(cb), [runtime]),
    () => `${runtime.status}|${runtime.detail ?? ''}`,
    () => 'idle|',
  );
  const [runtimeState, runtimeDetail] = status.split('|');

  // Python takes a few seconds to load the first time, so start it with the page.
  useEffect(() => {
    if (language === 'python') void runtime.warm();
  }, [language, runtime]);

  return { runtime, runtimeState, runtimeDetail };
}
