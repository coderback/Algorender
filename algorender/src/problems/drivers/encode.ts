// The server judge's test input: every test as typed tokens on stdin, which
// the generated drivers (java.ts, cpp.ts, go.ts) read with a few lines of
// code each, without a JSON library.
//
//   file    := count test*                    (one test per line)
//   test    := value* (a function's arguments, in order)
//            | count call*                    (a design problem's calls)
//   call    := index value*                   (0 is the constructor, 1… the methods in order)
//   int, long, float, bool := the number, true / false
//   string  := byteLength ':' bytes           (UTF-8; may hold spaces and newlines)
//   array   := count value*                   (2D arrays nest)
//   TreeNode := count (int | null)*           (level order, LeetCode style)
//   ListNode := count int*
//
// The expected answers never go into the sandbox: the server compares them.

import type { Json } from '@/workspace/protocol';
import type { JudgeCase } from '../judge';
import type { DesignSig, FunctionSig, ValueType } from '../schema';

const utf8 = new TextEncoder();

export function encodeValue(type: ValueType, value: Json): string {
  switch (type) {
    case 'int':
    case 'long':
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`not an integer: ${JSON.stringify(value)}`);
      return String(value);
    case 'float':
      if (typeof value !== 'number') throw new Error(`not a number: ${JSON.stringify(value)}`);
      return String(value);
    case 'bool':
      return value ? 'true' : 'false';
    case 'string':
      if (typeof value !== 'string') throw new Error(`not a string: ${JSON.stringify(value)}`);
      return `${utf8.encode(value).length}:${value}`;
    case 'TreeNode':
      return list(value).length === 0 ? '0' : `${list(value).length} ${list(value).map((v) => (v === null ? 'null' : encodeValue('int', v))).join(' ')}`;
    case 'ListNode':
      return encodeValue('int[]', value);
    default: {
      const items = list(value);
      const inner = type.slice(0, -2) as ValueType;
      return items.length === 0 ? '0' : `${items.length} ${items.map((v) => encodeValue(inner, v)).join(' ')}`;
    }
  }
}

function list(value: Json): Json[] {
  if (!Array.isArray(value)) throw new Error(`not a list: ${JSON.stringify(value)}`);
  return value;
}

/** One test's line. */
export function encodeCase(shape: { signature?: FunctionSig; design?: DesignSig }, test: JudgeCase): string {
  if (shape.signature) return shape.signature.params.map((p) => encodeValue(p.type, test.input?.[p.name] ?? null)).join(' ');
  const design = shape.design!;
  const calls = test.calls ?? [];
  const parts = calls.map(([method, ...args], i) => {
    const index = i === 0 ? 0 : design.methods.findIndex((m) => m.name === method) + 1;
    if (index < 0 || (i > 0 && index === 0)) throw new Error(`no method called ${method}`);
    const params = index === 0 ? design.init : design.methods[index - 1].params;
    return [String(index), ...params.map((p, k) => encodeValue(p.type, args[k] ?? null))].join(' ');
  });
  return [String(calls.length), ...parts].join(' ');
}

/** The whole stdin for a run. */
export const encodeCases = (shape: { signature?: FunctionSig; design?: DesignSig }, tests: JudgeCase[]) =>
  `${tests.length}\n${tests.map((t) => encodeCase(shape, t)).join('\n')}\n`;
