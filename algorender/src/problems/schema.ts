// The problem format: one YAML file per problem in src/content/problems/,
// validated by Zod when it is loaded (load.ts). A problem is an interview-style
// task with a typed signature: the signature generates each language's stub
// (codegen.ts) and tells the judge how to pass tests in and read answers out
// (judge.ts).
//
// Statements are our own words, never copied from another site.

import { z } from 'zod';
import type { Json } from '@/workspace/protocol';
import { PATTERN_IDS } from './patterns';

/**
 * The types a signature may use. Arrays nest at most two deep. `long` is a
 * 64-bit integer (up to 2^53, JavaScript's safe limit): the same as `int` in
 * Python, JavaScript and Go, but `long` / `long long` in Java and C++.
 */
export const VALUE_TYPES = [
  'int',
  'long',
  'float',
  'bool',
  'string',
  'int[]',
  'float[]',
  'bool[]',
  'string[]',
  'int[][]',
  'float[][]',
  'string[][]',
  'TreeNode',
  'ListNode',
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];
export type ReturnType = ValueType | 'void';

/** camelCase names: Python gets them in snake_case (codegen.ts). */
const camel = z.string().regex(/^[a-z][A-Za-z0-9]*$/, 'names are camelCase');
const pascal = z.string().regex(/^[A-Z][A-Za-z0-9]*$/, 'class names are PascalCase');
const json: z.ZodType<Json> = z.lazy(() => z.union([z.null(), z.boolean(), z.number(), z.string(), z.array(json), z.record(z.string(), json)]));

const Param = z.object({ name: camel, type: z.enum(VALUE_TYPES) });
export type Param = z.infer<typeof Param>;

const Returns = z.enum([...VALUE_TYPES, 'void']);

/** A function to write. A void function answers in place: `inPlace` names the argument the judge reads afterwards. */
const FunctionSignature = z
  .object({
    function: camel,
    params: z.array(Param).min(1),
    returns: Returns,
    inPlace: camel.optional(),
  })
  .refine((s) => (s.returns === 'void') === (s.inPlace !== undefined), 'a void function must name its inPlace argument, and only a void one')
  .refine((s) => s.inPlace === undefined || s.params.some((p) => p.name === s.inPlace), 'inPlace must name a parameter');

/** A class to write, called method by method (a design problem). */
const DesignSignature = z.object({
  class: pascal,
  /** The constructor's parameters. (Not `constructor`: every JS object already has one.) */
  init: z.array(Param).default([]),
  methods: z.array(z.object({ name: camel, params: z.array(Param).default([]), returns: Returns })).min(1),
});

/**
 * One test. A function problem's input maps each parameter to its value; a
 * design problem's lists the calls, constructor first: [[MinStack], [push, 3], [getMin]].
 */
const Test = z.object({
  input: z.record(z.string(), json).optional(),
  calls: z.array(z.tuple([z.string()]).rest(json)).min(1).optional(),
  output: json,
  /** Examples only: a sentence on why that is the answer. Markdown. */
  explanation: z.string().optional(),
});
export type Test = z.infer<typeof Test>;

export const COMPARATORS = ['exact', 'float', 'unordered', 'unordered-deep'] as const;
export type Comparator = (typeof COMPARATORS)[number];

export const ProblemSchema = z
  .object({
    title: z.string().min(3),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    /** The first is the problem's main pattern; drills ask for it. */
    patterns: z.array(z.enum(PATTERN_IDS)).min(1),
    /** Why the main pattern fits: the signal in the statement that points to it. One or two sentences. */
    why: z.string().min(20),
    /** One line for lists and link previews. */
    summary: z.string().min(10),
    /** The task, in Markdown. Code in backticks, math in $…$. */
    statement: z.string().min(40),
    constraints: z.array(z.string()).min(1),
    signature: FunctionSignature.optional(),
    design: DesignSignature.optional(),
    /**
     * How an answer is compared with the expected one: exactly; as floats
     * (within 1e-5); as a list in any order; or in any order at every level.
     */
    compare: z.enum(COMPARATORS).default('exact'),
    /** A custom check in src/content/problems/checks.ts, for problems with more than one right answer. */
    check: z.string().optional(),
    /** Shown on the page and judged. */
    examples: z.array(Test).min(1),
    /** Hand-picked edge cases, judged. */
    tests: z.array(Test).min(3),
    /** Seeded random tests from src/content/problems/generators.ts; answers come from the TypeScript solution. */
    generated: z.object({ count: z.number().int().min(1).max(50), seed: z.number().int().default(1) }).optional(),
    hints: z.array(z.string()).min(2),
    /** The reference approach, in Markdown, revealed on request. */
    approach: z.string().min(40),
    complexity: z.object({ time: z.string(), space: z.string() }),
    /** Reference solutions; JavaScript is the TypeScript one with its types stripped. Java, C++ and Go run on the server judge. */
    solutions: z.object({ python: z.string(), typescript: z.string(), java: z.string(), cpp: z.string(), go: z.string() }),
    /** Where a failing test is watched; inferred from the signature when left out. */
    view: z.enum(['array', 'grid', 'tree', 'memory']).optional(),
    /** Per-test time limit in JavaScript, in ms; other languages get TIME_FACTOR times as long (languages.ts). */
    timeLimitMs: z.number().int().min(500).max(10_000).default(2_000),
    /** Visualisers that teach what the problem needs. */
    visualisers: z.array(z.string()).default([]),
  })
  .refine((p) => (p.signature === undefined) !== (p.design === undefined), 'a problem has a signature or a design, not both');

export type Problem = z.infer<typeof ProblemSchema> & { slug: string };
export type FunctionSig = z.infer<typeof FunctionSignature>;
export type DesignSig = z.infer<typeof DesignSignature>;

