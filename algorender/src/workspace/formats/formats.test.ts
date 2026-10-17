import { describe, expect, it } from 'vitest';
import { blankNumbers, fillTemplate, parseBlanks, segmentLines } from './blanks';
import { assemble, braceIndented, firstMisplaced, parsonsLines, seedOf, shuffled } from './parsons';

describe('blanks', () => {
  const marked = 'for i in range(«2:n - 1»):\n    if «1:arr[i] > x»:\n        pass\n';
  const segments = parseBlanks(marked);

  it('parses markers in order and fills hidden ones from answers', () => {
    expect(blankNumbers(segments)).toEqual([2, 1]);
    expect(fillTemplate(segments, new Set([1]), { 1: 'arr[i] < x' })).toBe('for i in range(n - 1):\n    if arr[i] < x:\n        pass\n');
    expect(fillTemplate(segments, new Set(), {})).toBe('for i in range(n - 1):\n    if arr[i] > x:\n        pass\n');
  });

  it('splits into lines without breaking blanks', () => {
    const lines = segmentLines(segments);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toEqual([
      { kind: 'text', text: '    if ' },
      { kind: 'blank', n: 1, answer: 'arr[i] > x' },
      { kind: 'text', text: ':' },
    ]);
  });
});

describe('parsons', () => {
  const py = 'def f(arr):\n    for x in arr:\n        print(x)\n';
  const lines = parsonsLines(py, ['print(arr)']);

  it('keeps each line’s indent and marks distractors', () => {
    expect(lines.map((l) => [l.text, l.indent, l.distractor])).toEqual([
      ['def f(arr):', 0, false],
      ['for x in arr:', 1, false],
      ['print(x)', 2, false],
      ['print(arr)', 0, true],
    ]);
  });

  it('shuffles the same way for the same seed and never returns the original order', () => {
    const a = shuffled(lines, seedOf('ex:python'));
    expect(shuffled(lines, seedOf('ex:python'))).toEqual(a);
    expect(a.map((l) => l.id)).not.toEqual(lines.map((l) => l.id));
  });

  it('assembles Python with the learner’s indents and JS by brace depth', () => {
    const placed = [
      { id: 'l0', indent: 0 },
      { id: 'l1', indent: 1 },
      { id: 'l2', indent: 2 },
    ];
    expect(assemble(placed, lines, 'python')).toBe(py);
    expect(braceIndented(['function f(a) {', 'for (const x of a) {', 'log(x);', '}', '}'])).toEqual([
      'function f(a) {',
      '  for (const x of a) {',
      '    log(x);',
      '  }',
      '}',
    ]);
  });

  it('finds the first line out of place, counting indentation in Python only', () => {
    const right = [
      { id: 'l0', indent: 0 },
      { id: 'l1', indent: 1 },
      { id: 'l2', indent: 2 },
    ];
    expect(firstMisplaced(right, lines, 'python')).toBeNull();
    expect(firstMisplaced([right[0], { id: 'l1', indent: 0 }, right[2]], lines, 'python')).toBe(1);
    expect(firstMisplaced([right[0], { id: 'l1', indent: 0 }, right[2]], lines, 'javascript')).toBeNull();
    expect(firstMisplaced([right[0], right[2], right[1]], lines, 'python')).toBe(1);
    expect(firstMisplaced(right.slice(0, 2), lines, 'python')).toBe(2);
  });
});
