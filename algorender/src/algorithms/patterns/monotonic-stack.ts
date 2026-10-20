import { arrayInput } from '@/engine/inputs';
import { defineAlgorithm } from '@/engine/module';
import { ArrayTracer } from '@/viz/array/tracer';
import type { ArrayState } from '@/viz/array/types';

const pseudocode = [
  'answer ← all −1;  stack ← empty',
  'for i from 0 to n − 1:',
  '  while stack not empty and',
  '        A[top] < A[i]:',
  '    answer[top] ← A[i];  pop',
  '  push i',
  'whatever is left has no greater value',
];

const STACK = 'stack';
const ANSWER = 'answer';

function* run(input: readonly number[]) {
  const t = new ArrayTracer(input, ['comparisons', 'pushes']);
  // Position matters here, not size: values sit in cells (V1).
  t.setLook('cells');
  const n = t.length;
  // Waiting elements lift into the stack lane (bottom on the left) and drop
  // back into their own slot once their next greater value is found.
  t.addLane(STACK, 'stack: waiting for a greater value (bottom → top)', n);
  t.addCounter(ANSWER, 'next greater value (−1 = none)', input.map((_, i) => String(i)));
  for (let i = 0; i < n; i++) t.setCounter(ANSWER, i, -1);
  const stack: number[] = []; // original indices

  yield t.frame({
    line: 0,
    note: 'For each value, find the first value to its right that is larger. Values still waiting for an answer sit on a stack, which always decreases from bottom to top.',
  });

  for (let i = 0; i < n; i++) {
    const cur = t.value(i);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const topValue = t.value([STACK, stack.length - 1]);
      t.count('comparisons');
      const pops = topValue < cur;
      yield t.frame({
        line: 3,
        note: `Compare ${cur} with the top of the stack, ${topValue} (from position ${top}).`,
        marks: { key: [i], compare: [[STACK, stack.length - 1]] },
        pointers: { i },
        vars: { i, current: cur, top: topValue },
        counterHighlight: { [ANSWER]: null },
        checkpoint: { question: `Is ${cur} the next greater value for ${topValue}?`, choices: ['Yes: pop it', 'No: stop popping'], answer: pops ? 0 : 1 },
      });
      if (!pops) {
        yield t.frame({
          line: 5,
          note: `${topValue} ≥ ${cur}, so ${cur} answers nothing below it either: the stack is decreasing. Stop popping.`,
          marks: { key: [i], compare: [[STACK, stack.length - 1]] },
          pointers: { i },
          vars: { i, current: cur, top: topValue },
        });
        break;
      }
      t.move([STACK, stack.length - 1], top, { count: false });
      stack.pop();
      t.setCounter(ANSWER, top, cur);
      t.markSorted(top);
      yield t.frame({
        line: 4,
        note: `${topValue} < ${cur}: ${cur} is the first larger value to the right of ${topValue}. Record it and pop ${topValue} back into place.`,
        marks: { key: [i] },
        pointers: { i },
        counterHighlight: { [ANSWER]: top },
        vars: { i, current: cur },
      });
    }
    t.move(i, [STACK, stack.length], { count: false });
    stack.push(i);
    t.count('pushes');
    yield t.frame({
      line: 5,
      note: `Push ${cur}: it waits on the stack until a larger value arrives.`,
      marks: { key: [[STACK, stack.length - 1]] },
      vars: { i, current: cur, depth: stack.length },
    });
  }

  // Values left on the stack have no answer: they go back unmarked, keeping −1.
  for (let s = stack.length - 1; s >= 0; s--) t.move([STACK, s], stack[s], { count: false });
  yield t.frame({
    line: 6,
    note:
      stack.length === 0
        ? 'Every value found a larger value to its right. Each value was pushed and popped at most once: O(n) in total.'
        : `${stack.map((s) => input[s]).join(', ')} never met a larger value to the right, so their answer stays −1. Each value was pushed and popped at most once: O(n) in total.`,
  });
}

export const monotonicStack = defineAlgorithm<number[], ArrayState>({
  kind: 'algorithm',
  slug: 'monotonic-stack',
  view: 'array',
  input: arrayInput({ min: 1, max: 99, defaultSize: 10, maxSize: 20 }),
  pseudocode,
  stats: [
    { key: 'comparisons', label: 'Comparisons' },
    { key: 'pushes', label: 'Pushes' },
  ],
  legend: [
    { neutral: 'Not reached yet' },
    { mark: 'key', label: 'Current value' },
    { mark: 'compare', label: 'Top of the stack' },
    { mark: 'sorted', label: 'Answer found' },
  ],
  run,
  content: {
    idea: 'Walk left to right keeping a stack of values that are still waiting for a larger value. When a new value arrives, it answers every smaller value on top of the stack: pop them all, then push the new value. The stack always decreases from bottom to top.',
    invariant: 'The stack holds exactly the values seen so far that have no larger value to their right yet, in decreasing order from bottom to top.',
    whenToUse: 'Next/previous greater or smaller element, daily temperatures, stock span, largest rectangle in a histogram, trapping rain water. A naive scan is O(n²); the stack makes it O(n) because each value is pushed and popped at most once.',
    traits: [
      { label: 'O(n) time', good: true },
      { label: 'O(n) extra space', good: null },
    ],
    experiments: [
      { example: 'reversed', prompt: 'A decreasing array: nothing is ever popped until the end, and every answer is −1.' },
      { example: 'sorted', prompt: 'An increasing array: every new value pops the one before it immediately.' },
    ],
  },
});
