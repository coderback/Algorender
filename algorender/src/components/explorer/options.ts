import type { ReactNode } from 'react';
import type { TrackColour } from '@/data/tracks';
import type { Density } from './TraceStage';

/** How an explorer is hosted: a full page, an iframe embed, or one of several inside a lesson. */
export type ExplorerOptions = {
  /** Where the starting state comes from: the page URL, or a lesson's settings. */
  params: URLSearchParams;
  /** Write state changes back to the page URL (off inside lessons, which host several explorers). */
  syncUrl: boolean;
  keyboard: 'page' | 'local';
  layout: 'wide' | 'stacked';
  /** Show the input panel (algorithms). Structures always show their operations. */
  showInput: boolean;
  showExperiments: boolean;
  /** Predict-mode question density to start with. */
  density: Density;
  /** Called once per answered prediction (lessons count them). */
  onPrediction?: (correct: boolean) => void;
  /** The code, counts and legend beside the stage (an embed shows the stage alone). */
  panels: boolean;
  /** Phones tuck those panels into a bottom sheet (the full page). */
  sheet: boolean;
  /** The page's track colour, for the "Try it out next" chips. */
  colour?: TrackColour;
  /** A last "Try it out next" action, e.g. the sorting race. */
  next?: { href: string; label: string };
  /** Shown between the controls and "Try it out next" (the page's explainer cards). */
  details?: ReactNode;
};
