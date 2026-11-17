'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { hasModels, loadModels, onModelsLoaded } from '@/ml/weights';

const NONE: readonly string[] = [];

/**
 * Loads the pretrained models a module reads (its `models`) and says when
 * they are all in. The server render and hydration always see them as not
 * loaded, so the stage that waits for them renders the same on both sides.
 */
export function useModels(names: readonly string[] = NONE): { ready: boolean; failed: boolean; retry: () => void } {
  const key = names.join(',');
  const ready = useSyncExternalStore(
    onModelsLoaded,
    () => hasModels(names),
    () => names.length === 0,
  );
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState<number | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    loadModels(key.split(',')).catch(() => live && setFailed(attempt));
    return () => {
      live = false;
    };
  }, [key, attempt]);
  return { ready, failed: !ready && failed === attempt, retry: () => setAttempt((a) => a + 1) };
}
