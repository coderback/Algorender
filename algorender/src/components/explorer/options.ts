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
};
