import { describe, expect, it } from 'vitest';
import { defineStructure, type ArgSpec } from '@/engine/module';
import { blockedReason, parseArg, parseArgs, parseOps, replay, serializeOps } from './operations';

// A tiny structure: a set of letters, with a remove that may only name a letter that is present.
type M = readonly string[];
const LETTER: ArgSpec<M> = { name: 'letter', label: 'Letter', type: 'choice', options: (m) => m };
const NEW: ArgSpec = { name: 'letter', label: 'Letter', type: 'text', maxLength: 1 };

const letters = defineStructure<M, M>({
  kind: 'structure',
  slug: 'letters',
  view: 'array',
  initial: [{ id: 'abc', label: 'abc', make: () => ['a', 'b', 'c'] }],
  snapshot: (m) => m,
  operations: [
    {
      id: 'add',
      label: 'Add',
      args: [NEW],
      pseudocode: ['add x'],
      disabledReason: (m, args) => (args && m.includes(String(args.letter)) ? `${args.letter} is already in the set` : null),
      *run(m, args) {
        const next = [...m, String(args.letter)];
        yield { state: next, line: 0, note: 'added', vars: {}, stats: {} };
        return next;
      },
    },
    {
      id: 'remove',
      label: 'Remove',
      args: [LETTER],
      pseudocode: ['remove x'],
      *run(m, args) {
        const next = m.filter((x) => x !== args.letter);
        yield { state: next, line: 0, note: 'removed', vars: {}, stats: {} };
        return next;
      },
    },
  ],
  stats: [],
  legend: [{ neutral: 'Letter' }],
  content: { idea: '', invariant: '', whenToUse: '', traits: [], experiments: [] },
});

describe('choice arguments', () => {
  it('accept only current options when a model is given', () => {
    expect(parseArg(LETTER, 'b', ['a', 'b'])).toBe('b');
    expect(parseArg(LETTER, 'z', ['a', 'b'])).toBeNull();
    expect(parseArg(LETTER, 'z')).toBe('z'); // URL parsing: checked later against the model
    expect(parseArg(LETTER, '  ')).toBeNull();
  });

  it('parse a whole argument list or nothing', () => {
    expect(parseArgs([LETTER], { letter: 'a' }, ['a'])).toEqual({ letter: 'a' });
    expect(parseArgs([LETTER], { letter: 'q' }, ['a'])).toBeNull();
  });
});

describe('blockedReason', () => {
  it('passes the arguments to disabledReason', () => {
    expect(blockedReason(letters, ['a'], { op: 'add', args: { letter: 'a' } })).toBe('a is already in the set');
    expect(blockedReason(letters, ['a'], { op: 'add', args: { letter: 'b' } })).toBeNull();
  });

  it('rejects a choice that is not an option for this model', () => {
    expect(blockedReason(letters, ['a'], { op: 'remove', args: { letter: 'b' } })).toMatch(/pick one/);
  });
});

describe('replay', () => {
  it('rebuilds a model from URL operations and stops at the first blocked call', () => {
    const calls = parseOps('remove:b;add:d;add:d;remove:a', letters);
    expect(calls).toHaveLength(4);
    const { model, applied } = replay(letters, ['a', 'b', 'c'] as M, calls);
    expect(applied.map((a) => a.call.op)).toEqual(['remove', 'add']); // the second "add d" is blocked
    expect(model).toEqual(['a', 'c', 'd']);
  });

  it('round-trips through the URL form', () => {
    const calls = [
      { op: 'add', args: { letter: ':' } },
      { op: 'remove', args: { letter: 'a' } },
    ];
    expect(parseOps(serializeOps(calls, letters), letters)).toEqual(calls);
  });
});
