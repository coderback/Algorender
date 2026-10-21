'use client';

import { useState } from 'react';
import { useStartInPredict } from '@/lib/preferences';
import type { ExplorerOptions } from './options';
import type { Mode } from './TraceStage';
import { modeFromParams } from './url';

/**
 * Watch or Predict: what the link says, else (on a full visualiser page) the
 * device's "start in Predict" preference, until the learner switches.
 */
export function useStartMode(options: ExplorerOptions): [Mode, (mode: Mode) => void] {
  const [chosen, setChosen] = useState<Mode | null>(() => (options.params.has('mode') ? modeFromParams(options.params) : null));
  const predictFirst = useStartInPredict();
  return [chosen ?? (options.devicePrefs && predictFirst ? 'predict' : 'watch'), setChosen];
}
