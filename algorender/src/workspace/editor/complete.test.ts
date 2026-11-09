import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { cpp } from '@codemirror/lang-cpp';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import type { ProblemLanguage } from '@/problems/languages';
import { completionSource, KEYWORDS, namesIn } from './complete';

const LANGUAGE: Record<ProblemLanguage, Extension> = {
  python: python(),
  javascript: javascript(),
  typescript: javascript({ typescript: true }),
  java: java(),
  cpp: cpp(),
  go: go(),
};

/** The code with `|` marking the cursor. */
function complete(marked: string, language: ProblemLanguage, explicit = false): CompletionResult | null {
  const pos = marked.indexOf('|');
  const doc = marked.slice(0, pos) + marked.slice(pos + 1);
  const state = EditorState.create({ doc, extensions: LANGUAGE[language] });
  ensureSyntaxTree(state, doc.length, 5000);
  return completionSource(language)(new CompletionContext(state, pos, explicit)) as CompletionResult | null;
}

const labels = (result: CompletionResult | null) => result?.options.map((o) => o.label) ?? [];

describe('names in the file', () => {
  const cases: [ProblemLanguage, string, string[]][] = [
    ['python', 'class MinStack:\n    def push_item(self, value):\n        total_sum = len(self.items)\n', ['MinStack', 'items', 'len', 'push_item', 'self', 'total_sum', 'value']],
    ['javascript', 'function twoSum(nums, target) {\n  const seen = new Map();\n  return seen.size + target;\n}\n', ['Map', 'nums', 'seen', 'size', 'target', 'twoSum']],
    ['typescript', 'type Pair = { left: number };\nfunction f(xs: Pair[]): number { return xs.length; }\n', ['Pair', 'f', 'left', 'length', 'number', 'xs']],
    ['java', 'class Solution {\n  public int count(int[] nums) { int total = nums.length; return total; }\n}\n', ['Solution', 'count', 'length', 'nums', 'total']],
    ['cpp', 'class Solution {\npublic:\n  int count(vector<int>& nums) { int total = nums.size(); return total; }\n};\n', ['Solution', 'count', 'nums', 'size', 'total', 'vector']],
    ['go', 'func twoSum(nums []int, target int) []int {\n  seen := map[int]int{}\n  return nil\n}\n', ['int', 'nums', 'seen', 'target', 'twoSum']],
  ];
  for (const [language, code, expected] of cases) {
    it(`finds the names in ${language}, without strings, comments or keywords`, () => {
      const state = EditorState.create({ doc: `${code}\n// "notAName" in a comment\n`.replace('//', language === 'python' ? '#' : '//'), extensions: LANGUAGE[language] });
      const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
      expect(namesIn(tree, state.doc.toString())).toEqual(expected);
    });
  }
});

describe('the completion source', () => {
  it('offers names in the file and keywords that match what is typed', () => {
    const result = complete('def f(nums, target):\n    total = 0\n    for n in nums:\n        to|\n', 'python');
    expect(result?.from).toBe('def f(nums, target):\n    total = 0\n    for n in nums:\n        '.length);
    expect(labels(result)).toEqual(expect.arrayContaining(['total', 'target', 'nums', 'return', 'for', 'True']));
    expect(result?.options.find((o) => o.label === 'total')?.type).toBe('variable');
    expect(result?.options.find((o) => o.label === 'return')?.type).toBe('keyword');
  });

  it('leaves out the word being typed, unless it is also written elsewhere', () => {
    expect(labels(complete('const value = 1;\nconst va|\n', 'javascript'))).not.toContain('va');
    expect(labels(complete('const value = 1;\nconst va = value;\nva|\n', 'javascript'))).toContain('va');
  });

  it('waits for two letters, unless asked with Ctrl+Space', () => {
    expect(complete('total = 1\nt|', 'python')).toBeNull();
    expect(labels(complete('total = 1\nt|', 'python', true))).toContain('total');
    expect(labels(complete('total = 1\n|', 'python', true))).toContain('total');
    expect(complete('total = 1\n|', 'python')).toBeNull();
  });

  it('stays quiet in strings and comments, but not in a template or f-string’s braces', () => {
    expect(complete("total = 1\ns = 'to|'\n", 'python')).toBeNull();
    expect(complete('total = 1\n# to|\n', 'python')).toBeNull();
    expect(complete('const total = 1;\n// to|\n', 'javascript')).toBeNull();
    expect(complete('const total = 1;\nconst s = "to|";\n', 'typescript')).toBeNull();
    expect(labels(complete('const total = 1;\nconst s = `${to|}`;\n', 'javascript'))).toContain('total');
    expect(labels(complete("total = 1\ns = f'{to|}'\n", 'python'))).toContain('total');
  });

  it('offers each language its own keywords', () => {
    for (const language of Object.keys(KEYWORDS) as ProblemLanguage[]) {
      const offered = labels(complete('|', language, true));
      expect(offered).toEqual(expect.arrayContaining([...KEYWORDS[language]]));
      expect(new Set(KEYWORDS[language]).size).toBe(KEYWORDS[language].length);
    }
    expect(KEYWORDS.python).toContain('elif');
    expect(KEYWORDS.typescript).toContain('interface');
    expect(KEYWORDS.javascript).not.toContain('interface');
    expect(KEYWORDS.go).toContain('func');
  });

  it('never lists a name twice, or a keyword as a name', () => {
    const offered = labels(complete('if x:\n    x = x + 1\nif|\n', 'python', true));
    expect(offered.filter((l) => l === 'x')).toHaveLength(1);
    expect(offered.filter((l) => l === 'if')).toHaveLength(1);
  });
});
