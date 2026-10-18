import { createRng } from '@/engine/random';

// Small deterministic gridworlds for tabular Q-learning: the worlds, their
// dynamics, value iteration for the true Q*, and seeded ε-greedy training.
// Cells are (column, row) with row 0 at the bottom, so a cell is the unit
// square [c, c+1] × [r, r+1] on the plane.

export type Cell = readonly [c: number, r: number];
export type WorldId = 'cliff' | 'maze' | 'two-goals';
export const WORLD_IDS: readonly WorldId[] = ['cliff', 'maze', 'two-goals'];

/** Entering a terminal cell pays `reward` (instead of the step reward) and ends the episode. */
export type Terminal = { cell: Cell; reward: number; label: string; good: boolean };

export type World = {
  id: WorldId;
  name: string;
  width: number;
  height: number;
  start: Cell;
  walls: readonly Cell[];
  /** Stepping onto the cliff pays `cliffReward` and sends the agent back to the start (the episode goes on). */
  cliff: readonly Cell[];
  terminals: readonly Terminal[];
  /** Paid for every move that doesn't end on a terminal or the cliff, including bumping into a wall. */
  stepReward: number;
  cliffReward: number;
  /** An episode that hasn't ended after this many moves is cut off. */
  maxSteps: number;
  /** The range of state values the wash spans, from its low tone to its high tone. */
  valueRange: readonly [number, number];
};

const row = (r: number, from: number, to: number): Cell[] => Array.from({ length: to - from + 1 }, (_, i) => [from + i, r] as const);

export const WORLDS: Record<WorldId, World> = {
  cliff: {
    id: 'cliff',
    name: 'Cliff walk',
    width: 8,
    height: 3,
    start: [0, 0],
    walls: [],
    cliff: row(0, 1, 6),
    terminals: [{ cell: [7, 0], reward: -1, label: 'goal', good: true }],
    stepReward: -1,
    cliffReward: -100,
    maxSteps: 200,
    valueRange: [-8, 0],
  },
  maze: {
    id: 'maze',
    name: 'Maze',
    width: 6,
    height: 5,
    start: [0, 0],
    walls: [
      [1, 1],
      [2, 1],
      [3, 1],
      [1, 2],
      [5, 2],
      [1, 3],
      [3, 3],
      [3, 4],
    ],
    cliff: [],
    terminals: [
      { cell: [5, 4], reward: 10, label: '+10', good: true },
      { cell: [5, 1], reward: -10, label: '−10', good: false },
    ],
    stepReward: 0,
    cliffReward: 0,
    maxSteps: 200,
    valueRange: [0, 10],
  },
  'two-goals': {
    id: 'two-goals',
    name: 'Near or far',
    width: 7,
    height: 3,
    start: [2, 1],
    walls: [],
    cliff: [],
    terminals: [
      { cell: [0, 1], reward: 1, label: '+1', good: true },
      { cell: [6, 1], reward: 10, label: '+10', good: true },
    ],
    stepReward: 0,
    cliffReward: 0,
    maxSteps: 100,
    valueRange: [0, 10],
  },
};

export const ACTIONS = [
  { name: 'Up', word: 'up', arrow: '↑', d: [0, 1] },
  { name: 'Right', word: 'right', arrow: '→', d: [1, 0] },
  { name: 'Down', word: 'down', arrow: '↓', d: [0, -1] },
  { name: 'Left', word: 'left', arrow: '←', d: [-1, 0] },
] as const;
export const A = ACTIONS.length;

export const index = (w: World, [c, r]: Cell) => r * w.width + c;
export const cellOf = (w: World, s: number): Cell => [s % w.width, Math.floor(s / w.width)];
const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];
export const isWall = (w: World, cell: Cell) => w.walls.some((x) => same(x, cell));
export const isCliff = (w: World, cell: Cell) => w.cliff.some((x) => same(x, cell));
export const terminalAt = (w: World, cell: Cell) => w.terminals.find((t) => same(t.cell, cell)) ?? null;
/** Cells the agent can stand on and act from. */
export const isState = (w: World, cell: Cell) => !isWall(w, cell) && !isCliff(w, cell) && !terminalAt(w, cell);

export type Outcome = { next: Cell; reward: number; terminal: Terminal | null; fell: boolean; bumped: boolean };

/** One move: walls and the edge stop it, the cliff sends it back to the start, a terminal ends the episode. */
export function move(w: World, s: Cell, a: number): Outcome {
  const [dc, dr] = ACTIONS[a].d;
  const to: Cell = [s[0] + dc, s[1] + dr];
  if (to[0] < 0 || to[1] < 0 || to[0] >= w.width || to[1] >= w.height || isWall(w, to)) return { next: s, reward: w.stepReward, terminal: null, fell: false, bumped: true };
  if (isCliff(w, to)) return { next: w.start, reward: w.cliffReward, terminal: null, fell: true, bumped: false };
  const terminal = terminalAt(w, to);
  return { next: to, reward: terminal ? terminal.reward : w.stepReward, terminal, fell: false, bumped: false };
}

export type QTable = Float64Array;
export const qRow = (q: QTable, s: number) => Array.from(q.subarray(s * A, s * A + A));
export const maxQ = (q: QTable, s: number) => Math.max(...qRow(q, s));

/** The actions tied for the largest Q-value (within 1e-12). */
export function bestActions(q: QTable, s: number): number[] {
  const values = qRow(q, s);
  const top = Math.max(...values);
  return values.flatMap((v, a) => (top - v <= 1e-12 ? [a] : []));
}

/** Value iteration on the known model: Q*(s, a) = r + γ·max Q*(s′, ·), with nothing after a terminal. */
export function optimalQ(w: World, gamma: number): QTable {
  const n = w.width * w.height;
  let q: QTable = new Float64Array(n * A);
  for (let sweep = 0; sweep < 5000; sweep++) {
    const next: QTable = new Float64Array(n * A);
    let change = 0;
    for (let s = 0; s < n; s++) {
      const cell = cellOf(w, s);
      if (!isState(w, cell)) continue;
      for (let a = 0; a < A; a++) {
        const o = move(w, cell, a);
        const v = o.reward + (o.terminal ? 0 : gamma * maxQ(q, index(w, o.next)));
        next[s * A + a] = v;
        change = Math.max(change, Math.abs(v - q[s * A + a]));
      }
    }
    q = next;
    if (change < 1e-12) break;
  }
  return q;
}

export type Params = { alpha: number; gamma: number; epsilon: number; episodes: number; seed: number };

export type Step = {
  s: Cell;
  a: number;
  explored: boolean;
  /** Exploiting, but several actions shared the top Q-value, so one was picked at random. */
  tied: boolean;
  /** Q(s, ·) when the action was chosen. */
  row: number[];
  r: number;
  next: Cell;
  terminal: Terminal | null;
  fell: boolean;
  bumped: boolean;
  /** max Q(s′, ·), or 0 after a terminal. */
  future: number;
  target: number;
  before: number;
  after: number;
};

export type Episode = { steps: Step[]; total: number; end: Terminal | null; q: QTable };

/**
 * Tabular Q-learning, ε-greedy with random tie-breaking, from all-zero
 * Q-values. Returns every step of every episode and the table after each one.
 */
export function train(w: World, p: Params): { episodes: Episode[]; q: QTable } {
  const rng = createRng(p.seed);
  const q: QTable = new Float64Array(w.width * w.height * A);
  const episodes: Episode[] = [];
  for (let e = 0; e < p.episodes; e++) {
    let s = w.start;
    const steps: Step[] = [];
    let total = 0;
    let end: Terminal | null = null;
    while (steps.length < w.maxSteps) {
      const si = index(w, s);
      const row = qRow(q, si);
      const explored = rng() < p.epsilon;
      let a: number;
      let tied = false;
      if (explored) a = Math.min(A - 1, Math.floor(rng() * A));
      else {
        const best = bestActions(q, si);
        tied = best.length > 1;
        a = tied ? best[Math.min(best.length - 1, Math.floor(rng() * best.length))] : best[0];
      }
      const o = move(w, s, a);
      const future = o.terminal ? 0 : maxQ(q, index(w, o.next));
      const target = o.reward + p.gamma * future;
      const before = q[si * A + a];
      const after = before + p.alpha * (target - before);
      q[si * A + a] = after;
      steps.push({ s, a, explored, tied, row, r: o.reward, next: o.next, terminal: o.terminal, fell: o.fell, bumped: o.bumped, future, target, before, after });
      total += o.reward;
      s = o.next;
      if (o.terminal) {
        end = o.terminal;
        break;
      }
    }
    episodes.push({ steps, total, end, q: q.slice() });
  }
  return { episodes, q };
}

/**
 * Follow the greedy action (lowest-numbered on ties) from the start with no
 * exploration, until a terminal, a repeated cell (a loop) or the step limit.
 */
export function greedyPath(w: World, q: QTable): { cells: Cell[]; end: Terminal | null; total: number; loops: boolean } {
  const cells: Cell[] = [w.start];
  const seen = new Set([index(w, w.start)]);
  let s = w.start;
  let total = 0;
  for (let i = 0; i < w.width * w.height * 2; i++) {
    const o = move(w, s, bestActions(q, index(w, s))[0]);
    total += o.reward;
    cells.push(o.next);
    if (o.terminal) return { cells, end: o.terminal, total, loops: false };
    if (seen.has(index(w, o.next))) return { cells, end: null, total, loops: true };
    seen.add(index(w, o.next));
    s = o.next;
  }
  return { cells, end: null, total, loops: true };
}
