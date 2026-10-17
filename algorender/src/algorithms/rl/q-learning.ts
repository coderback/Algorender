import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, plain, plotFrame } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import type { PlanePart, PlotPart, PlotState, Readout, Shape, Vec } from '@/viz/plot/types';
import {
  A,
  ACTIONS,
  WORLD_IDS,
  WORLDS,
  bestActions,
  greedyPath,
  index,
  isState,
  isWall,
  maxQ,
  optimalQ,
  qRow,
  terminalAt,
  train,
  type Cell,
  type Params,
  type QTable,
  type Step,
  type World,
  type WorldId,
} from './gridworld';

export type QInput = Params & { world: WorldId };

export const MIN_EPISODES = 10;
export const MAX_EPISODES = 300;
/** Episodes shown move by move before the rest are summed up. */
const DETAIL_EPISODES = 2;
/** Per detailed episode: moves shown one by one (the episode's last move is always shown too). */
const SHOW_MOVES = 4;
/** Moves that teach nothing (no reward, nothing ahead) shown one by one before they are batched. */
const SHOW_QUIET = 2;
/** At most this many frames sum up the remaining episodes. */
const SUMMARY_FRAMES = 24;

const pseudocode = [
  'Q(s, a) ← 0 for every state and action',
  'for each episode: s ← start',
  '  with chance ε: a ← a random move',
  '  otherwise: a ← argmax_a Q(s, a)',
  '  move; see reward r and next state s′',
  '  target ← r + γ·max_a′ Q(s′, a′)',
  '  Q(s, a) ← Q(s, a) + α(target − Q(s, a))',
  '  s ← s′ until s is terminal',
  'follow argmax Q from the start',
];

/** Cells are named like a chessboard: a column letter and a row number, A1 at the bottom left. */
const column = (c: number) => String.fromCharCode(65 + c);
const name = ([c, r]: Cell) => `${column(c)}${r + 1}`;
/** A value inside a formula, bracketed when negative so "− −2" reads "− (−2)". */
const paren = (v: number) => (v < 0 ? `(${fmt(v, 3)})` : fmt(v, 3));
const centre = ([c, r]: Cell): Vec => [c + 0.5, r + 0.5];
const square = ([c, r]: Cell): Vec[] => [
  [c, r],
  [c + 1, r],
  [c + 1, r + 1],
  [c, r + 1],
];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

const CHANGE = ['Goes up', 'Goes down', 'Stays the same'];
const changeOf = (s: Step) => (s.after - s.before > 1e-12 ? 'Goes up' : s.after - s.before < -1e-12 ? 'Goes down' : 'Stays the same');

type View = {
  q: QTable;
  agent: Cell | null;
  trail: readonly Cell[];
  /** Episodes finished (for the chart). */
  done: number;
  episode: number;
  move?: number;
  total?: number;
  /** Q(s, ·) of the agent's cell, with the chosen action marked. */
  row?: { values: readonly number[]; chosen: number | null };
  path?: readonly Cell[];
};

function* run(input: QInput): Generator<Frame<PlotState>> {
  const w = WORLDS[input.world];
  const { episodes } = train(w, input);
  const qStar = optimalQ(w, input.gamma);
  const best = greedyPath(w, qStar);
  const bestMoves = best.cells.length - 1;
  const startIndex = index(w, w.start);
  const lengths = episodes.map((e) => e.steps.length);
  const chartTop = Math.max(bestMoves + 2, ...lengths);
  const [lo, hi] = w.valueRange;

  const scene = (v: View): PlotPart[] => {
    const shapes: Shape[] = [];
    const values: number[] = [];
    for (let r = w.height - 1; r >= 0; r--) {
      for (let c = 0; c < w.width; c++) {
        const cell: Cell = [c, r];
        const t = terminalAt(w, cell);
        values.push(t ? (t.good ? 1 : 0) : isState(w, cell) ? Math.min(1, Math.max(0, (maxQ(v.q, index(w, cell)) - lo) / (hi - lo))) : 0);
      }
    }
    shapes.push({ kind: 'heatmap', id: 'values', x0: 0, x1: w.width, y0: 0, y1: w.height, cols: w.width, rows: w.height, values, scale: { kind: 'blend', low: 2, high: 1 } });
    for (let c = 0; c <= w.width; c++) shapes.push({ kind: 'path', id: `gx${c}`, points: [[c, 0], [c, w.height]], faint: true });
    for (let r = 0; r <= w.height; r++) shapes.push({ kind: 'path', id: `gy${r}`, points: [[0, r], [w.width, r]], faint: true });
    w.walls.forEach((cell, i) => shapes.push({ kind: 'path', id: `wall${i}`, points: square(cell), closed: true, fill: true, fillOpacity: 0.75 }));
    w.cliff.forEach((cell, i) => shapes.push({ kind: 'path', id: `cliff${i}`, points: square(cell), closed: true, fill: true, fillOpacity: 0.45, mark: 'reject' }));
    if (w.cliff.length) {
      const mid = w.cliff[Math.floor(w.cliff.length / 2)];
      shapes.push({ kind: 'label', id: 'cliff-label', at: [mid[0], mid[1] + 0.5], text: `cliff ${fmt(w.cliffReward)}` });
    }
    w.terminals.forEach((t, i) => {
      shapes.push({ kind: 'path', id: `end${i}`, points: square(t.cell), closed: true, fill: true, fillOpacity: 0.5, mark: t.good ? 'found' : 'reject' });
      shapes.push({ kind: 'label', id: `end-label${i}`, at: centre(t.cell), text: t.label });
    });
    shapes.push({ kind: 'label', id: 'start-label', at: [w.start[0] + 0.5, w.start[1] + 0.18], text: 'S' });
    // The greedy move in every cell whose Q-values have a single largest one.
    for (let r = 0; r < w.height; r++) {
      for (let c = 0; c < w.width; c++) {
        const cell: Cell = [c, r];
        if (!isState(w, cell)) continue;
        const top = bestActions(v.q, index(w, cell));
        if (top.length !== 1) continue;
        const [dx, dy] = ACTIONS[top[0]].d;
        const [x, y] = centre(cell);
        shapes.push({ kind: 'vector', id: `pi${c}_${r}`, from: [x - 0.12 * dx, y - 0.12 * dy], to: [x + 0.34 * dx, y + 0.34 * dy] });
      }
    }
    if (v.trail.length > 1) shapes.push({ kind: 'path', id: 'trail', points: v.trail.map(centre), tone: 3, dashed: true });
    if (v.path) shapes.push({ kind: 'path', id: 'greedy', points: v.path.map(centre), mark: 'path', dots: true });
    if (v.agent) shapes.push({ kind: 'point', id: 'agent', at: centre(v.agent), mark: 'key', size: 'lg' });

    const world: PlanePart = {
      kind: 'plane',
      id: 'plane',
      label: `${w.name}: the wash is each cell's best Q-value, arrows the greedy move`,
      x: { min: 0, max: w.width, ticks: Array.from({ length: w.width }, (_, c) => ({ at: c + 0.5, label: column(c) })) },
      y: { min: 0, max: w.height, ticks: Array.from({ length: w.height }, (_, r) => ({ at: r + 0.5, label: String(r + 1) })) },
      equal: true,
      shapes,
      handles: [],
    };
    const points: Vec[] = lengths.slice(0, v.done).map((n, e) => [e + 1, n]);
    const chartShapes: Shape[] = [{ kind: 'line', id: 'best', through: [0, bestMoves], dir: [1, 0], dashed: true, mark: 'path', label: `best route: ${bestMoves}` }];
    if (points.length) chartShapes.push({ kind: 'path', id: 'moves', points, tone: 1, dots: points.length <= 30 });
    const chart: PlanePart = {
      kind: 'plane',
      id: 'chart',
      label: 'Moves taken in each episode',
      x: { min: 0, max: episodes.length + 1, label: 'episode' },
      y: { min: 0, max: chartTop * 1.1, label: 'moves' },
      equal: false,
      shapes: chartShapes,
      handles: [],
    };
    const items: Readout[] = [
      { id: 'episode', label: 'episode', value: `${v.episode} of ${episodes.length}` },
      ...(v.move !== undefined ? [{ id: 'move', label: 'move', value: String(v.move) }] : []),
      ...(v.total !== undefined ? [{ id: 'total', label: 'reward so far', value: fmt(v.total) }] : []),
      { id: 'epsilon', label: 'ε', value: fmt(input.epsilon) },
      ...(v.row
        ? v.row.values.map((q, a): Readout => ({ id: `q${a}`, label: `Q(s, ${ACTIONS[a].arrow})`, value: fmt(q, 2), mark: a === v.row!.chosen ? 'key' : null }))
        : []),
    ];
    return [world, chart, { kind: 'readouts', id: 'readouts', label: 'Q-learning', items }];
  };

  let moves = 0;
  let done = 0;
  const stats = () => ({ episodes: done, moves });
  const vars = (s: Step) => ({ s: name(s.s), a: ACTIONS[s.a].arrow, r: s.r, target: Number(s.target.toFixed(3)), Q: Number(s.after.toFixed(3)) });

  yield plotFrame(scene({ q: new Float64Array(w.width * w.height * A), agent: w.start, trail: [], done: 0, episode: 1, row: { values: [0, 0, 0, 0], chosen: null } }), {
    line: 0,
    note: `${intro(w)} The agent knows none of this. It keeps a table Q(s, a): how much reward it expects if it makes move a in cell s and then plays as well as it can. Every entry starts at 0. Learning rate α = ${fmt(input.alpha)}, discount γ = ${fmt(input.gamma)}, exploration ε = ${fmt(input.epsilon)}.`,
    vars: { α: input.alpha, γ: input.gamma, ε: input.epsilon },
    stats: stats(),
  });

  let q: QTable = new Float64Array(w.width * w.height * A);
  let firstReward = true;
  let saidCost = false;
  for (let e = 0; e < Math.min(DETAIL_EPISODES, episodes.length); e++) {
    const ep = episodes[e];
    const n = ep.steps.length;
    let trail: Cell[] = [w.start];
    let total = 0;
    let shown = 0;
    let quietShown = 0;
    let batch: Step[] = [];
    const view = (o: Partial<View>): View => ({ q, agent: w.start, trail, done, episode: e + 1, total, ...o });

    if (e > 0) {
      yield plotFrame(scene(view({ move: 0, row: { values: qRow(q, startIndex), chosen: null } })), {
        line: 1,
        note: `Episode ${e + 1} starts again from S, keeping every Q-value learned so far: ${describeLearned(q)}.`,
        stats: stats(),
      });
    }

    // Moves not shown one by one are applied as they come and summed up in one frame.
    let batchFrom = 0;
    const flush = function* () {
      if (!batch.length) return;
      const falls = batch.filter((s) => s.fell).length;
      const changed = batch.filter((s) => Math.abs(s.after - s.before) > 1e-12).length;
      const k = batchFrom + 1;
      const last = batch[batch.length - 1];
      yield plotFrame(scene(view({ agent: last.next, move: k + batch.length - 1 })), {
        line: 7,
        note:
          `${batch.length === 1 ? `Move ${k}` : `Moves ${k} to ${k + batch.length - 1}`}: ${plural(batch.length, 'more move')}, each followed by the same kind of update.` +
          (falls ? ` It fell off the cliff ${falls === 1 ? 'once' : `${falls} times`}, paying ${fmt(w.cliffReward)}${falls === 1 ? '' : ' each time'} and restarting at S.` : '') +
          (changed === 0
            ? ' None of them changed Q: with no reward yet and nothing learned ahead, every target is 0 + γ·0 = 0.'
            : ` ${plural(changed, 'Q-value')} changed.`),
        vars: { moves: batch.length },
        stats: stats(),
      });
      batch = [];
    };

    for (let i = 0; i < n; i++) {
      const s = ep.steps[i];
      const last = i === n - 1;
      const quiet = Math.abs(s.after - s.before) <= 1e-12 && !s.fell;
      const show = last || (shown < SHOW_MOVES && (!quiet || quietShown < SHOW_QUIET));
      if (!show) {
        if (!batch.length) batchFrom = i;
        batch.push(s);
        moves++;
        apply(q, w, s);
        total += s.r;
        trail = s.fell ? [w.start] : [...trail, s.next];
        continue;
      }
      yield* flush();
      shown++;
      if (quiet) quietShown++;
      const k = i + 1;
      const act = ACTIONS[s.a];
      const exploit = !s.explored && !s.tied;
      if (exploit) {
        yield plotFrame(scene(view({ agent: s.s, move: k - 1, row: { values: s.row, chosen: null } })), {
          line: 3,
          note: `Move ${k}, from ${name(s.s)}. The roll comes out above ε = ${fmt(input.epsilon)}, so the agent exploits what it has learned: it makes the move with the largest Q-value in this cell (listed below).`,
          vars: { s: name(s.s) },
          stats: stats(),
          checkpoint: askInOrder('Which move does it make?', ACTIONS.map((a) => a.name), act.name),
        });
      }
      moves++;
      const how = s.explored
        ? `The roll comes out below ε = ${fmt(input.epsilon)}, so it explores: a random move, ${act.arrow}.`
        : s.tied
          ? `Its Q-values here tie at ${fmt(Math.max(...s.row))}, so it breaks the tie at random: ${act.arrow}.`
          : `It makes the greedy move ${act.arrow}.`;
      const outcome = s.bumped
        ? `It bumps into ${isWall(w, [s.s[0] + act.d[0], s.s[1] + act.d[1]]) ? 'a wall' : 'the edge'} and stays at ${name(s.next)}, with reward r = ${fmt(s.r)}.`
        : s.fell
          ? `It steps off the cliff: r = ${fmt(s.r)}, and it is put back at S.`
          : s.terminal
            ? `It reaches the ${s.terminal.good ? 'goal' : 'pit'} at ${name(s.next)}: r = ${fmt(s.r)}, and the episode ends, so nothing comes after it.`
            : `It moves ${act.word} to ${name(s.next)} and gets r = ${fmt(s.r)}.`;
      const ahead = s.terminal ? '' : ` The best Q-value at its new cell is max Q(s′, ·) = ${fmt(s.future, 3)}.`;
      const trailAfter = s.fell ? [w.start] : [...trail, s.next];
      yield plotFrame(scene(view({ agent: s.next, move: k, total: total + s.r, trail: trailAfter, row: { values: s.row, chosen: s.a } })), {
        line: 4,
        note: `${exploit ? '' : `Move ${k}, from ${name(s.s)}. `}${how} ${outcome}${ahead} Q(${name(s.s)}, ${act.arrow}) is ${fmt(s.before, 3)} now.`,
        vars: { s: name(s.s), a: act.arrow, r: s.r, "s′": name(s.next) },
        stats: stats(),
        checkpoint: askInOrder(`After the update, how does Q(${name(s.s)}, ${act.arrow}) change?`, CHANGE, changeOf(s)),
      });
      apply(q, w, s);
      total += s.r;
      trail = trailAfter;
      const target = s.terminal
        ? `target = r = ${fmt(s.r)} (the episode ended, so there is no future term)`
        : `target = r + γ·max Q(s′, ·) = ${fmt(s.r)} + ${fmt(input.gamma)}·${paren(s.future)} = ${fmt(s.target, 3)}`;
      let why = '';
      if (Math.abs(s.after - s.before) <= 1e-12) why = ' Nothing learned: the target is exactly what Q already predicted.';
      else if (s.r > 0 && firstReward) {
        firstReward = false;
        why = ` The first reward! Only this one entry learns about it now; the cells before it will hear about it on later visits, one step back at a time.`;
      } else if (s.r === 0 && s.future > 0 && s.after > s.before) why = ` No reward on this move, yet Q rises: the next cell is already worth ${fmt(s.future, 2)}, so value flows one step back, shrunk by γ.`;
      else if (s.fell) why = ` That move is now marked as costly, so the greedy choice here will avoid it.`;
      else if (s.r < 0 && !s.terminal && w.stepReward < 0 && !saidCost) {
        saidCost = true;
        why = ` Every move costs 1, so moves that wander collect more and more negative values; the shortest route ends up the least negative.`;
      }
      yield plotFrame(scene(view({ agent: s.next, move: k, row: { values: qRow(q, index(w, s.s)), chosen: s.a } })), {
        line: 6,
        note: `${target}. Q(${name(s.s)}, ${act.arrow}) ← ${fmt(s.before, 3)} + ${fmt(input.alpha)}·(${fmt(s.target, 3)} − ${paren(s.before)}) = ${fmt(s.after, 3)}.${why}`,
        vars: vars(s),
        stats: stats(),
      });
    }
    yield* flush();
    done++;
    yield plotFrame(scene(view({ agent: n ? ep.steps[n - 1].next : w.start, move: n })), {
      line: 7,
      note: `${ep.end ? `Episode ${e + 1} ends at the ${ep.end.good ? 'goal' : 'pit'} after ${plural(n, 'move')}` : `Episode ${e + 1} is cut off after ${plural(n, 'move')} without finding an end`}, with total reward ${fmt(ep.total)}. ${
        e === 0 ? 'The first episode is close to a random walk: with every Q-value equal, every choice is a coin toss.' : 'Each episode pushes what was learned one step further from the rewards.'
      }`,
      vars: { episode: e + 1, moves: n, reward: ep.total },
      stats: stats(),
    });
  }

  // The remaining episodes, a frame per group.
  const rest = episodes.length - Math.min(DETAIL_EPISODES, episodes.length);
  const group = Math.max(1, Math.ceil(rest / SUMMARY_FRAMES));
  let reachedBefore = greedyPath(w, q).end?.good ?? false;
  let headingFor = greedyPath(w, q).end?.label ?? null;
  const learned = greedyPath(w, episodes[episodes.length - 1].q);
  for (let from = done; from < episodes.length; from += group) {
    const these = episodes.slice(from, from + group);
    const lastEp = these[these.length - 1];
    for (const ep of these) moves += ep.steps.length;
    done += these.length;
    q = lastEp.q;
    const finished = these.filter((ep) => ep.end?.good).length;
    const avg = sum(these.map((ep) => ep.steps.length)) / these.length;
    const now = greedyPath(w, q);
    const remarks: string[] = [];
    if (now.end?.good && !reachedBefore) remarks.push(`From here on, following the arrows alone leads from S to ${now.end.label === 'goal' ? 'the goal' : `the ${now.end.label}`} in ${plural(now.cells.length - 1, 'move')}.`);
    else if (now.end && headingFor && now.end.label !== headingFor) remarks.push(`The arrows from S now lead to the ${now.end.label} instead of the ${headingFor}.`);
    reachedBefore ||= now.end?.good ?? false;
    if (now.end) headingFor = now.end.label;
    const falls = sum(these.map((ep) => ep.steps.filter((s) => s.fell).length));
    if (falls && w.cliff.length) remarks.push(`Exploring still sent it off the cliff ${falls === 1 ? 'once' : `${falls} times`}.`);
    const lastFrame = from + group >= episodes.length;
    let checkpoint;
    if (lastFrame && learned.end) {
      if (w.id === 'two-goals') checkpoint = ask('With no more exploring, which end will the greedy arrows lead to from S?', `The ${learned.end.label}`, w.terminals.map((t) => `The ${t.label}`));
      else if (w.id === 'cliff') checkpoint = askInOrder('With no more exploring, will the greedy path run along the cliff edge?', ['Yes', 'No'], hugsEdge(w, learned.cells) ? 'Yes' : 'No');
      else checkpoint = askInOrder('With no more exploring, which is the first greedy move from S?', ACTIONS.map((a) => a.name), ACTIONS[bestActions(q, startIndex)[0]].name);
    }
    const range = these.length === 1 ? `Episode ${from + 1}` : `Episodes ${from + 1} to ${from + these.length}`;
    yield plotFrame(scene({ q, agent: null, trail: trailOf(w, lastEp.steps), done, episode: from + these.length }), {
      line: 1,
      note: `${range}: ${these.length === 1 ? (lastEp.end?.good ? `reached ${goalName(lastEp.end.label)} in ${plural(lastEp.steps.length, 'move')}` : lastEp.end ? `ended in the pit after ${plural(lastEp.steps.length, 'move')}` : 'cut off without reaching an end') : `${finished} of ${these.length} reached a goal, ${fmt(avg, 1)} moves on average`}${from === DETAIL_EPISODES ? ` (the best route takes ${bestMoves}; exploring adds detours)` : ''}. ${remarks.join(' ')}`.trim(),
      vars: { episodes: done, 'V(S)': Number(maxQ(q, startIndex).toFixed(3)) },
      stats: stats(),
      ...(checkpoint && { checkpoint }),
    });
  }

  const vS = maxQ(q, startIndex);
  const vStar = maxQ(qStar, startIndex);
  yield plotFrame(scene({ q, agent: learned.cells[learned.cells.length - 1], trail: [], done, episode: episodes.length, path: learned.cells }), {
    line: 8,
    note: `${finale(w, input, learned, best)} The start is worth V(S) = max Q(S, ·) = ${fmt(vS, 3)} after ${plural(episodes.length, 'episode')}; the true value from value iteration is ${fmt(vStar, 3)}.`,
    vars: { 'V(S)': Number(vS.toFixed(3)), 'V*(S)': Number(vStar.toFixed(3)), moves: learned.cells.length - 1 },
    stats: stats(),
  });
}

function apply(q: QTable, w: World, s: Step) {
  q[index(w, s.s) * A + s.a] = s.after;
}

/** An episode's path since its last fall off the cliff. */
function trailOf(w: World, steps: readonly Step[]): Cell[] {
  let trail: Cell[] = [w.start];
  for (const s of steps) trail = s.fell ? [w.start] : [...trail, s.next];
  return trail;
}

const goalName = (label: string) => (label === 'goal' ? 'the goal' : `the ${label}`);

/** Runs along the row next to the cliff for every cliff column. */
export function hugsEdge(w: World, cells: readonly Cell[]): boolean {
  return w.cliff.every(([c, r]) => cells.some((x) => x[0] === c && x[1] === r + 1));
}

function intro(w: World): string {
  switch (w.id) {
    case 'cliff':
      return `A cliff walk. The agent starts at S and must reach the goal in the bottom-right corner. Every move costs 1 (r = −1), so shorter is better, and stepping onto the cliff costs 100 and sends it back to S.`;
    case 'maze':
      return `A maze. The agent starts at S; the +10 square is the goal, the −10 square a pit. Moves cost nothing, but rewards are discounted by γ for every move it takes to get them, so a shorter route is worth more.`;
    case 'two-goals':
      return `Two ways out. From S, a +1 is two moves to the left and a +10 is four moves to the right. Moves cost nothing; what decides is the discount γ, which shrinks a reward for every move it is away. The agent explores most of the time here (ε = 0.8 by default), or the nearby +1 would hide the +10 from it.`;
  }
}

function describeLearned(q: QTable): string {
  let nonzero = 0;
  for (let s = 0; s < q.length / A; s++) for (let a = 0; a < A; a++) if (Math.abs(q[s * A + a]) > 1e-12) nonzero++;
  return nonzero === 0 ? 'still none, every entry is 0' : `${nonzero === 1 ? '1 entry' : `${nonzero} entries`} of the table ${nonzero === 1 ? 'is' : 'are'} no longer 0`;
}

function finale(w: World, input: QInput, learned: ReturnType<typeof greedyPath>, best: ReturnType<typeof greedyPath>): string {
  const n = learned.cells.length - 1;
  const lead = learned.end
    ? `With exploration switched off, the greedy arrows lead from S to ${goalName(learned.end.label)} in ${plural(n, 'move')} (the best route takes ${best.cells.length - 1}).`
    : `With exploration switched off, the greedy arrows from S go round in a loop: ${input.episodes} episodes weren't enough to learn a route.`;
  const g = input.gamma;
  switch (w.id) {
    case 'cliff':
      return hugsEdge(w, learned.cells)
        ? `${lead} The path hugs the cliff edge. Q-learning's target uses max Q(s′, ·), the value of acting greedily next, so it learns the shortest route as if it would never explore. While it still explores with ε = ${fmt(input.epsilon)}, that edge is risky: a random move drops it into the cliff, which is why the moves chart stays noisy. SARSA, which learns the value of the ε-greedy policy it actually follows, prefers a safer row.`
        : `${lead} It doesn't follow the cliff edge yet: with more episodes, Q-learning's greedy target pulls the route down to the shortest path along the edge.`;
    case 'maze':
      return `${lead} Values spread back from the +10 one cell per visit, shrunk by γ = ${fmt(g)} for every move: a cell d moves away is worth about 10·γ^(d−1), so the wash fades with distance and the arrows point along the shortest way round the walls, away from the pit.`;
    case 'two-goals': {
      const near = g * 1;
      const far = g ** 3 * 10;
      return `${lead} From S, the +1 is worth γ·1 = ${fmt(near, 3)} and the +10 is worth γ³·10 = ${fmt(far, 3)}, since each move away shrinks a reward by γ = ${fmt(g)}. ${far > near ? 'Patience pays: the far +10 wins.' : 'A short-sighted agent settles for the near +1, even though +10 is bigger.'}`;
    }
  }
}

const PARAMS: { key: keyof Params; label: string; min: number; max: number; integer?: boolean }[] = [
  { key: 'alpha', label: 'alpha', min: 0.01, max: 1 },
  { key: 'gamma', label: 'gamma', min: 0, max: 0.99 },
  { key: 'epsilon', label: 'epsilon', min: 0, max: 1 },
  { key: 'episodes', label: 'episodes', min: MIN_EPISODES, max: MAX_EPISODES, integer: true },
  { key: 'seed', label: 'seed', min: 0, max: 1_000_000, integer: true },
];

export function parseInput(text: string): { value: QInput } | { error: string } {
  const world = text.match(/\bworld\s*=\s*([a-z-]+)/i)?.[1]?.toLowerCase() as WorldId | undefined;
  if (!world || !WORLD_IDS.includes(world)) return { error: `Name the world: world = ${WORLD_IDS.join(', ')}.` };
  const value: Partial<QInput> = { world };
  for (const p of PARAMS) {
    const raw = text.match(new RegExp(`\\b${p.label}\\s*=\\s*(-?\\d*\\.?\\d+)`, 'i'))?.[1];
    const v = Number(raw);
    if (raw === undefined || !Number.isFinite(v)) return { error: `Give ${p.label}, e.g. ${p.label} = ${p.integer ? p.min : 0.5}.` };
    if (p.integer && !Number.isInteger(v)) return { error: `${p.label} must be a whole number.` };
    if (v < p.min || v > p.max) return { error: `${p.label} must be between ${p.min} and ${p.max}.` };
    value[p.key] = v;
  }
  return { value: value as QInput };
}

export const formatInput = (i: QInput) =>
  `world = ${i.world}, alpha = ${plain(i.alpha)}, gamma = ${plain(i.gamma)}, epsilon = ${plain(i.epsilon)}, episodes = ${i.episodes}, seed = ${i.seed}`;

export const qLearning = defineAlgorithm<QInput, PlotState>({
  kind: 'algorithm',
  slug: 'q-learning',
  view: 'plot',
  input: {
    examples: [
      { id: 'cliff', label: 'Cliff walk', make: ({ seed, size }) => ({ world: 'cliff', alpha: 0.5, gamma: 0.9, epsilon: 0.1, episodes: size, seed }) },
      { id: 'maze', label: 'Maze', make: ({ seed, size }) => ({ world: 'maze', alpha: 0.5, gamma: 0.9, epsilon: 0.1, episodes: size, seed }) },
      { id: 'two-goals', label: 'Near or far (γ = 0.9)', make: ({ seed, size }) => ({ world: 'two-goals', alpha: 0.5, gamma: 0.9, epsilon: 0.8, episodes: size, seed }) },
      { id: 'short-sighted', label: 'Near or far (γ = 0.25)', make: ({ seed, size }) => ({ world: 'two-goals', alpha: 0.5, gamma: 0.25, epsilon: 0.8, episodes: size, seed }) },
    ],
    size: { label: 'Episodes', min: MIN_EPISODES, max: MAX_EPISODES, default: 100 },
    custom: {
      label: 'World (cliff, maze, two-goals), α, γ, ε, episodes and seed',
      placeholder: 'e.g. world = cliff, alpha = 0.5, gamma = 0.9, epsilon = 0.1, episodes = 100, seed = 1',
      parse: parseInput,
      format: formatInput,
    },
  },
  pseudocode,
  stats: [
    { key: 'episodes', label: 'Episodes' },
    { key: 'moves', label: 'Moves' },
  ],
  legend: [
    { neutral: 'Walls, and the arrows: the greedy move in each cell' },
    { tone: 1, label: 'Wash: a cell worth a lot' },
    { tone: 2, label: 'Wash: a cell worth little' },
    { mark: 'key', label: 'The agent, and the move it chose' },
    { tone: 3, label: 'This episode’s trail' },
    { mark: 'found', label: 'A goal' },
    { mark: 'reject', label: 'The cliff or a pit' },
    { mark: 'path', label: 'The learned greedy path' },
  ],
  run,
  content: {
    idea: 'Reinforcement learning learns from rewards instead of labelled answers. Q-learning keeps a table Q(s, a), the reward it expects from making move a in state s and acting well afterwards. After every move it nudges that entry towards r + γ·max Q(s′, ·): the reward it just got plus the discounted value of the best move from where it landed. Mostly it makes the move with the largest Q-value; with chance ε it tries a random one, so it keeps discovering.',
    invariant: 'Each update moves Q(s, a) a fraction α of the way to its target r + γ·max Q(s′, ·). On a finite world, if every move keeps being tried and α shrinks suitably, the table converges to Q*, the values of the optimal policy, which satisfy the Bellman equation Q*(s, a) = r + γ·max Q*(s′, ·). In a deterministic world like these a fixed α gets there too.',
    whenToUse: 'When you can act and observe rewards but have no model of the world, and the states fit in a table. Value iteration (dynamic programming) finds the same Q* when the rules are known. For huge state spaces, a neural network replaces the table (DQN); policy-gradient methods learn the policy directly.',
    traits: [
      { label: 'Needs no model of the world', good: true },
      { label: 'Learns the optimal policy while exploring (off-policy)', good: true },
      { label: 'A table entry for every state and move', good: false },
      { label: 'Rewards spread back one step per visit', good: null },
    ],
    experiments: [
      { example: 'maze', prompt: 'In the first episode, watch nothing change until the goal is found. Then see the value creep back from the +10, one cell per visit.' },
      { example: 'cliff', prompt: 'The learned path hugs the cliff edge even though exploring keeps tipping the agent over it. Why does Q-learning ignore that risk?' },
      { example: 'two-goals', prompt: 'With γ = 0.9 the agent walks past the +1 for the +10. Now try γ = 0.25: which goal does it learn to prefer?' },
      { example: 'short-sighted', prompt: 'Compute γ·1 and γ³·10 for γ = 0.25 before running. Then raise γ in the input until the preference flips.' },
    ],
  },
});
