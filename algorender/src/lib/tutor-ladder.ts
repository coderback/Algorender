// The tutor's hint ladder, shared by the server (which enforces it) and the
// panel (which labels the next step): 1 a nudge, 2 where to look, 3 the steps
// as pseudo-code, 4 a partial fix. Levels unlock one at a time per item, and
// the last only after a failed run and two earlier turns on the item.

export type Level = 1 | 2 | 3 | 4;

export const LEVEL_NAMES: Record<Level, string> = { 1: 'A nudge', 2: 'Where to look', 3: 'The steps', 4: 'A partial fix' };

/** The level a learner may reach next, given the highest so far on the item (0: none) and their turns on it. */
export function unlockedLevel(top: number, itemTurns: number, failedRun: boolean): Level {
  const next = Math.min(4, top + 1);
  return (next === 4 && !(failedRun && itemTurns >= 2) ? 3 : next) as Level;
}
