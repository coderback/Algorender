import { joinWords } from '@/algorithms/dp/shared';
import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { GridTracer } from '@/viz/grid/tracer';
import type { GridState } from '@/viz/grid/types';
import { busiest, byStart, intervalsCustom, intervalsOf, letter, randomIntervals, span, type Interval } from './shared';

const pseudocode = [
  'sort meetings by start',
  'heap ← empty   (end time of each room)',
  'for each meeting m, in that order:',
  '  if heap and heap.min ≤ m.start:',
  '    pop it: that room is free again',
  '  else: open a new room',
  '  push m.end   (busy until then)',
  'rooms ← the number of rooms opened',
];

const ROOMS = 'rooms';
const HEAP = 'heap';
const CHOICES = ['Reuse the room that frees up first', 'Open a new room'];

type Room = { id: string; num: number; end: number; meeting: number };

function* run(ms: readonly Interval[]): Generator<Frame<GridState>> {
  const n = ms.length;
  const T = Math.max(1, ...ms.map((m) => m.end));
  const ids = ms.map((_, i) => `m${i}`);
  const cols = Array.from({ length: T }, () => ({ label: '' }));
  const t = new GridTracer(['placed', 'heap', 'rooms']);
  t.addTable({
    label: 'Meetings over time',
    look: 'timeline',
    rows: ms.map((m, i) => ({ id: ids[i], label: letter(i), sub: span(m) })),
    cols,
    group: 'time',
  });
  ms.forEach((m, i) => t.setBar(ids[i], ids[i], m.start, m.end));
  t.addTable({ id: ROOMS, label: 'Rooms', look: 'timeline', rows: [], cols, group: 'time', empty: 'No rooms open yet' });
  t.addList({ id: HEAP, label: 'Min-heap of room end times (earliest first)', empty: 'Empty' });

  const rooms: Room[] = [];
  const heapOrder = () => [...rooms].sort((a, b) => a.end - b.end || a.num - b.num);
  const chip = (r: Room) => `Room ${r.num}: free at ${r.end}`;
  /** Puts meeting i in a room's row, and shows the heap smallest end first. */
  const place = (i: number, room: Room) => {
    room.end = ms[i].end;
    room.meeting = i;
    t.setBar(ids[i], room.id, ms[i].start, ms[i].end, ROOMS);
    t.mark({ bar: ids[i], table: ROOMS }, 'visited');
    t.mark({ bar: ids[i] }, 'visited');
    t.setItemText(HEAP, room.id, chip(room));
    t.reorderItems(HEAP, heapOrder().map((r) => r.id));
    t.count('placed');
  };
  const openRoom = (i: number): Room => {
    const room: Room = { id: `room${rooms.length + 1}`, num: rooms.length + 1, end: ms[i].end, meeting: i };
    rooms.push(room);
    t.addRow({ id: room.id, label: `Room ${room.num}` }, ROOMS);
    t.addItem(HEAP, { id: room.id, text: chip(room) });
    t.count('rooms');
    t.count('heap');
    place(i, room);
    return room;
  };

  yield t.frame({
    note: `Give each of these ${n} meetings a room, never two at once in the same room, using as few rooms as possible; a room is free again the moment its meeting ends.`,
    vars: { n },
  });

  const order = byStart(ms);
  t.reorderRows(order.map((i) => ids[i]));
  yield t.frame({
    line: 0,
    note: 'Sort by start time, so meetings are handed rooms in the order they begin: when one starts, every meeting that began earlier already has its room.',
    vars: { n },
  });

  for (let k = 0; k < n; k++) {
    const i = order[k];
    const { start: s, end: e } = ms[i];
    const name = letter(i);
    const current = [{ bar: ids[i] }, { row: k }, { bar: ids[i], table: ROOMS }];

    if (k === 0) {
      const room = openRoom(i);
      yield t.frame({
        line: 5,
        note: `${name} starts first and no room is open yet, so open Room 1 for it and push its end time, ${e}, onto the heap.`,
        marks: { key: [...current, { item: room.id, list: HEAP }] },
        vars: { m: name, 'm.start': s, 'm.end': e, rooms: rooms.length },
      });
      continue;
    }

    const top = heapOrder()[0];
    const reuse = top.end <= s;
    yield t.frame({
      line: 3,
      note: `Next to start is ${name} at ${s}; the top of the heap says Room ${top.num} frees up first, at ${top.end}.`,
      marks: {
        key: current,
        compare: [{ item: top.id, list: HEAP }, { row: rooms.indexOf(top), table: ROOMS }, { bar: ids[top.meeting], table: ROOMS }],
      },
      guides: [{ at: top.end, label: `Room ${top.num} free`, mark: 'compare' }],
      vars: { m: name, 'm.start': s, 'heap.min': top.end, rooms: rooms.length },
      checkpoint: { question: `Where does ${name} go?`, choices: CHOICES, answer: reuse ? 0 : 1 },
    });

    if (reuse) {
      const freed = top.end;
      t.count('heap', 2);
      place(i, top);
      yield t.frame({
        line: 4,
        note: `${freed} ≤ ${s}: Room ${top.num} is free by the time ${name} starts, so pop ${freed}, put ${name} in Room ${top.num} and push its end, ${e}.`,
        marks: { key: [...current, { item: top.id, list: HEAP }] },
        vars: { m: name, 'm.start': s, 'm.end': e, rooms: rooms.length },
      });
    } else {
      const room = openRoom(i);
      yield t.frame({
        line: 5,
        note: `${top.end} > ${s}: even the room that frees up first is still busy when ${name} starts, so every room is; open Room ${room.num} and push ${e}.`,
        marks: { key: [...current, { item: room.id, list: HEAP }] },
        vars: { m: name, 'm.start': s, 'm.end': e, rooms: rooms.length },
      });
    }
  }

  const peak = busiest(ms);
  yield t.frame({
    line: 7,
    note:
      rooms.length === 1
        ? 'One room is enough: no two meetings overlap, so each one starts once the one before it has ended.'
        : `${rooms.length} rooms: at time ${peak.at}, ${joinWords(peak.who.map(letter))} are all in progress, so no schedule can use fewer, and the heap never needed more.`,
    ...(rooms.length > 1 && {
      marks: { found: peak.who.map((i) => ({ bar: ids[i] })) },
      guides: [{ at: peak.at, label: `${peak.count} at once`, mark: 'found' as const }],
    }),
    vars: { rooms: rooms.length },
  });
}

export const meetingRooms = defineAlgorithm<Interval[], GridState>({
  kind: 'algorithm',
  slug: 'meeting-rooms',
  view: 'grid',
  input: {
    examples: [
      { id: 'textbook', label: 'Textbook', make: () => intervalsOf([[0, 15], [5, 8], [2, 5], [9, 12], [6, 10], [13, 16]]) },
      { id: 'back-to-back', label: 'Back-to-back meetings', make: () => intervalsOf([[5, 8], [1, 3], [8, 10], [3, 5]]) },
      { id: 'all-overlap', label: 'All overlap', make: () => intervalsOf([[1, 9], [2, 8], [3, 10], [4, 7]]) },
      { id: 'random', label: 'Random', make: ({ seed }) => randomIntervals(seed, 7, 16, 6) },
    ],
    custom: intervalsCustom('Meetings', 'e.g. 0-15, 5-8, 2-5, 9-12'),
  },
  pseudocode,
  stats: [
    { key: 'placed', label: 'Meetings placed' },
    { key: 'heap', label: 'Heap pushes and pops' },
    { key: 'rooms', label: 'Rooms opened' },
  ],
  legend: [
    { neutral: 'Meeting waiting for a room' },
    { mark: 'key', label: 'Meeting being placed' },
    { mark: 'compare', label: 'Room that frees up first' },
    { mark: 'visited', label: 'Placed in a room' },
    { mark: 'found', label: 'Busiest moment' },
  ],
  run,
  content: {
    idea: 'Hand out rooms in order of start time, keeping each room’s end time in a min-heap. If the room that frees up first is free when the next meeting starts, reuse it; if not, no room is free, so open a new one.',
    invariant: 'The heap holds one end time per open room, and its minimum is the earliest moment any room is free. A room is opened only when every room is busy at that start time, so the number of rooms equals the most meetings in progress at once.',
    whenToUse: 'Assigning identical resources to time intervals: meeting rooms, CPU cores, platforms at a station, cars in a rental fleet. O(n log n): the sort, plus one or two heap operations per meeting.',
    traits: [
      { label: 'O(n log n) with a heap', good: true },
      { label: 'Rooms = most meetings at once', good: null },
      { label: 'Back-to-back meetings can share', good: null },
    ],
    experiments: [
      { example: 'textbook', prompt: 'C ends at 5 and B starts at 5, so B reuses C’s room. E arrives at 6 while every room is busy: that is when the third room opens.' },
      { example: 'back-to-back', prompt: 'Each meeting starts exactly when the one before it ends, so a single room is enough.' },
      { example: 'all-overlap', prompt: 'All four meetings are in progress at time 4, so each needs its own room: the heap’s top is never free in time.' },
    ],
  },
});
