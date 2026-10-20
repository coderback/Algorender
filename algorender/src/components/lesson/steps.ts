import { FiCheckSquare, FiCode, FiEdit3, FiEye, FiFlag, FiHelpCircle, FiKey, FiList, FiMessageSquare, FiPlay, FiSearch, FiTool } from 'react-icons/fi';

// The learning loop every lesson follows (REVAMP_PLAN.md §3.1). Each stage has
// a fixed label and icon, so learners always know what kind of step they're on.
export const STEPS = {
  hook: { label: 'Why it matters', icon: FiFlag },
  parts: { label: 'Key parts', icon: FiList },
  see: { label: 'See it work', icon: FiEye },
  predict: { label: 'Predict', icon: FiHelpCircle },
  do: { label: 'Try it', icon: FiTool },
  // PRIMM (Sentance et al. 2019): read and run code before changing and writing it.
  run: { label: 'Run it', icon: FiPlay },
  investigate: { label: 'Investigate', icon: FiSearch },
  modify: { label: 'Modify', icon: FiEdit3 },
  make: { label: 'Make', icon: FiCode },
  check: { label: 'Check yourself', icon: FiCheckSquare },
  // Self-explanation (Bisra et al. 2018): say it in your own words, scored against a rubric.
  explain: { label: 'Explain it back', icon: FiMessageSquare },
  recap: { label: 'Recap', icon: FiKey },
} as const;

export type Step = keyof typeof STEPS;

export const STEP_LABEL = Object.fromEntries(Object.entries(STEPS).map(([k, v]) => [k, v.label])) as Record<Step, string>;

/** The anchor a `<Section>` gets from its title. */
export const sectionId = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
