import { defineAlgorithm, type InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';
import type { Frame } from '@/engine/types';
import { GridTracer, type CellRef } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { CELLS, numberChoices } from './shared';

/** Rows of the grid, top to bottom: '.' is open, '#' is a wall. */
export type PathsInput = { grid: string[] };

export const MAX_ROWS = 7;
export const MAX_COLS = 9;
export const WALL = '#';

const pseudocode = [
  'P[0,0] ← 1   (one way: start there)',
  'top row: P[0,j] ← P[0,j−1]',
  'left column: P[i,0] ← P[i−1,0]',
  'for every other cell, row by row:',
  '  if it is a wall: P[i,j] ← 0',
  '  else: P[i,j] ← P[i−1,j] + P[i,j−1]',
  '',
  'P[m−1,n−1] counts every path',
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function* run({ grid }: PathsInput): Generator<Frame<GridState>> {
  const m = grid.length;
  const n = grid[0].length;
  const wall = (i: number, j: number) => grid[i][j] === WALL;
  const t = new GridTracer(['cells', 'additions']);
  t.addTable({
    label: 'P[i,j]: paths from the top-left corner to (i, j)',
    corner: 'i╲j',
    rows: grid.map((_, i) => ({ label: String(i) })),
    cols: Array.from({ length: n }, (_, j) => ({ label: String(j) })),
  });
  let walls = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (!wall(i, j)) continue;
      t.setStyle([i, j], 'block');
      walls++;
    }
  }
  const P = grid.map(() => Array<number>(n).fill(0));

  yield t.frame({
    note: `P[i,j] will count the paths from the top-left corner to cell (i, j) that only ever step right or down${
      walls > 0 ? `; the ${plural(walls, 'solid cell')} ${walls === 1 ? 'is a wall' : 'are walls'} that no path may enter` : ''
    }.`,
    vars: { m, n, walls },
  });

  P[0][0] = 1;
  t.set([0, 0], 1);
  t.count('cells');
  yield t.frame({
    line: 0,
    note: 'There is exactly one way to be at the start, by staying put, so P[0,0] = 1: every count grows from this one.',
    marks: { key: [[0, 0]] },
    vars: { i: 0, j: 0, 'P[i,j]': 1 },
  });

  // The top row and the left column each have only one way in, so they are filled as one step each.
  const edges = [
    { size: n, line: 1, at: (k: number): [number, number] => [0, k], from: 'left', where: 'column' },
    { size: m, line: 2, at: (k: number): [number, number] => [k, 0], from: 'above', where: 'row' },
  ];
  for (const edge of edges) {
    if (edge.size < 2) continue;
    const filled: CellRef[] = [];
    const arrows: { from: CellRef; to: CellRef; mark: 'compare' }[] = [];
    let firstWall: number | null = null;
    for (let k = 1; k < edge.size; k++) {
      const [i, j] = edge.at(k);
      const [pi, pj] = edge.at(k - 1);
      if (wall(i, j)) {
        firstWall ??= k;
        continue;
      }
      P[i][j] = wall(pi, pj) ? 0 : P[pi][pj];
      t.set([i, j], P[i][j]);
      t.count('cells');
      filled.push([i, j]);
      if (!wall(pi, pj)) arrows.push({ from: [pi, pj], to: [i, j], mark: 'compare' });
    }
    const name = edge.line === 1 ? 'A top-row cell' : 'A left-column cell';
    const other = edge.line === 1 ? 'nothing is above it' : 'nothing is to its left';
    yield t.frame({
      line: edge.line,
      note:
        firstWall == null
          ? `${name} can only be entered from ${edge.from === 'left' ? 'its left' : 'above'} (${other}), so each one copies that neighbour: 1 all the way along.`
          : `${name} can only be entered from ${edge.from === 'left' ? 'its left' : 'above'}, so each one copies that neighbour: 1 before the wall in ${edge.where} ${firstWall} and 0 after it, because no path gets past a wall.`,
      marks: filled.length > 0 ? { key: filled } : {},
      arrows,
      vars: edge.line === 1 ? { i: 0 } : { j: 0 },
    });
  }

  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) {
      if (wall(i, j)) continue;
      const here: CellRef = [i, j];
      const upOpen = !wall(i - 1, j);
      const leftOpen = !wall(i, j - 1);
      const up = upOpen ? P[i - 1][j] : 0;
      const left = leftOpen ? P[i][j - 1] : 0;
      const value = up + left;
      const deps: CellRef[] = [...(upOpen ? [[i - 1, j] as const] : []), ...(leftOpen ? [[i, j - 1] as const] : [])];
      const arrows = deps.map((d) => ({ from: d, to: here, mark: 'compare' as const }));
      const vars = { i, j, above: upOpen ? up : 'wall', left: leftOpen ? left : 'wall' };
      P[i][j] = value;

      if (deps.length === 0) {
        t.set(here, 0);
        t.count('cells');
        yield t.frame({
          line: 5,
          note: `Both ways into (${i}, ${j}), from above and from the left, are walls, so no path reaches it: P[${i},${j}] = 0.`,
          marks: { key: [here] },
          vars: { ...vars, 'P[i,j]': 0 },
        });
        continue;
      }

      const both = deps.length === 2;
      const open = upOpen ? up : left;
      yield t.frame({
        line: 5,
        note: both
          ? `Every path into (${i}, ${j}) arrives either from above or from the left, and those cells hold P[${i - 1},${j}] = ${up} and P[${i},${j - 1}] = ${left}.`
          : `The cell ${upOpen ? 'to the left' : 'above'} is a wall, so every path into (${i}, ${j}) arrives from ${upOpen ? 'above' : 'the left'}, where ${plural(open, 'path')} ${open === 1 ? 'ends' : 'end'}.`,
        marks: { key: [here], compare: deps },
        arrows,
        vars,
        checkpoint: { question: `What is P[${i},${j}]?`, ...numberChoices(value, both ? [up, left, value + 1] : [value + 1, 0, 2 * value]) },
      });

      t.set(here, value);
      t.count('cells');
      if (both) t.count('additions');
      yield t.frame({
        line: 5,
        note: !both
          ? `P[${i},${j}] = ${upOpen ? `${up} + 0` : `0 + ${left}`} = ${value}: the wall ${upOpen ? 'to the left' : 'above'} adds no paths.`
          : value === 0
            ? `P[${i},${j}] = 0 + 0 = 0: no path reaches either neighbour, so none can reach this cell through them.`
            : up === 0 || left === 0
              ? `P[${i},${j}] = ${up} + ${left} = ${value}: no path reaches the cell ${up === 0 ? 'above' : 'to the left'}, so every path here comes ${up === 0 ? 'from the left' : 'from above'}.`
              : `P[${i},${j}] = ${up} + ${left} = ${value}: a path through the cell above and a path through the cell to the left are different paths, so the counts add.`,
        marks: { key: [here], compare: deps },
        arrows,
        vars: { ...vars, 'P[i,j]': value },
      });
    }
  }

  const corner: CellRef = [m - 1, n - 1];
  const total = P[m - 1][n - 1];
  if (total === 0) {
    t.mark(corner, 'reject');
    yield t.frame({
      line: 7,
      note: `P[${m - 1},${n - 1}] = 0: the walls cut the bottom-right corner off from the start, so no path gets there.`,
      vars: { paths: 0 },
    });
    return;
  }

  t.mark(corner, 'path');
  yield t.frame({
    line: 7,
    note: `P[${m - 1},${n - 1}] = ${total}: there ${total === 1 ? 'is exactly one path' : `are ${total} different paths`} from the top-left to the bottom-right corner.`,
    vars: { paths: total },
  });

  // Walk one path back from the corner, always to the neighbour more paths come through (a cell with paths always has one).
  const path: [number, number][] = [[m - 1, n - 1]];
  for (let [i, j] = [m - 1, n - 1]; i > 0 || j > 0; ) {
    const fromUp = i > 0 && !wall(i - 1, j) ? P[i - 1][j] : -1;
    const fromLeft = j > 0 && !wall(i, j - 1) ? P[i][j - 1] : -1;
    [i, j] = fromUp >= fromLeft ? [i - 1, j] : [i, j - 1];
    path.unshift([i, j]);
  }
  for (let k = 1; k < path.length; k++) {
    t.addArrow({ from: path[k - 1], to: path[k], mark: 'path' });
    t.mark(path[k - 1], 'path');
  }
  yield t.frame({
    note:
      total === 1
        ? 'The only path, traced back from the corner by stepping each time to the neighbour (above or left) that it comes from.'
        : `One of the ${total} paths, traced back from the corner by always stepping to the neighbour (above or left) that more paths come through.`,
    vars: { paths: total, steps: path.length - 1 },
  });
}

const custom: NonNullable<InputSpec<PathsInput>['custom']> = {
  label: `Rows of . (open) and # (wall), split by | (up to ${MAX_ROWS} × ${MAX_COLS})`,
  placeholder: 'e.g. ....|.#..|....',
  parse: (text) => {
    const grid = text
      .split('|')
      .map((row) => row.replace(/\s+/g, ''))
      .filter(Boolean);
    if (grid.length === 0) return { error: 'Enter at least one row, e.g. ....|.#..' };
    if (grid.length > MAX_ROWS) return { error: `Use at most ${MAX_ROWS} rows.` };
    for (const row of grid) {
      if (!/^[.#]+$/.test(row)) return { error: `"${row}" may only contain . (open) and # (wall).` };
      if (row.length !== grid[0].length) return { error: 'Every row must have the same number of cells.' };
    }
    if (grid[0].length > MAX_COLS) return { error: `Use at most ${MAX_COLS} cells per row.` };
    if (grid.length * grid[0].length < 2) return { error: 'The grid needs at least two cells.' };
    if (grid[0][0] === WALL || grid.at(-1)!.at(-1) === WALL) return { error: 'The top-left start and the bottom-right corner must be open.' };
    return { value: { grid } };
  },
  format: ({ grid }) => grid.join('|'),
};

/** About one cell in five is a wall; the start and the corner stay open. */
function randomGrid(seed: number, m: number, n: number): string[] {
  const rng = createRng(seed);
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) => ((i === 0 && j === 0) || (i === m - 1 && j === n - 1) || rng() >= 0.22 ? '.' : WALL)).join(''),
  );
}

export const uniquePaths = defineAlgorithm<PathsInput, GridState>({
  kind: 'algorithm',
  slug: 'unique-paths',
  view: 'grid',
  input: {
    examples: [
      { id: 'open', label: 'Open 3 × 7 grid', make: () => ({ grid: ['.......', '.......', '.......'] }) },
      { id: 'obstacle', label: 'Obstacle in the middle', make: () => ({ grid: ['.......', '...#...', '.......'] }) },
      { id: 'wall', label: 'Wall blocks everything', make: () => ({ grid: ['...#..', '...#..', '...#..', '...#..'] }) },
      { id: 'random', label: 'Random walls (5 × 7)', make: ({ seed }) => ({ grid: randomGrid(seed, 5, 7) }) },
    ],
    custom,
  },
  pseudocode,
  stats: [CELLS, { key: 'additions', label: 'Additions' }],
  legend: [
    { neutral: 'Path count (solid cells are walls)' },
    { mark: 'key', label: 'Cell being filled' },
    { mark: 'compare', label: 'Neighbours it adds (above, left)' },
    { mark: 'path', label: 'One path to the corner' },
    { mark: 'reject', label: 'Corner cannot be reached' },
  ],
  run,
  content: {
    idea: 'Every path into a cell enters it from above or from the left, so the number of paths to a cell is the sum of those two counts. Fill the grid row by row and the bottom-right corner holds the number of paths; a wall holds 0 and passes nothing on.',
    invariant: 'P[0,0] = 1, a wall has P = 0, and every other cell has P[i,j] = P[i−1,j] + P[i,j−1], counting a missing or walled neighbour as 0. Row-by-row order makes both neighbours final before they are added.',
    whenToUse: 'Counting routes on a grid or through any directed acyclic graph (sum over the ways in), robot paths around obstacles, and as the model for "count the ways" problems. Without walls the answer is a binomial coefficient, C(m + n − 2, m − 1).',
    traits: [
      { label: 'O(mn) time, one pass', good: true },
      { label: 'Counts paths without listing them', good: true },
      { label: 'Counts grow exponentially with size', good: null },
    ],
    experiments: [
      { example: 'open', prompt: 'With no walls each cell is a binomial coefficient: the table is Pascal’s triangle on its side, and the corner is C(8, 2) = 28.' },
      { example: 'obstacle', prompt: 'One wall removes every path that went through the middle. Compare the corner with the 28 of the open grid.' },
      { example: 'wall', prompt: 'A full column of walls means nothing crosses to the right half: every count beyond it stays 0.' },
    ],
  },
});
