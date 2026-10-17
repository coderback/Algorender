import { describe, expect, it } from 'vitest';
import { snake, stub } from './codegen';
import type { DesignSig, FunctionSig } from './schema';

describe('snake', () => {
  it.each([
    ['twoSum', 'two_sum'],
    ['getMin', 'get_min'],
    ['evalRPN', 'eval_rpn'],
    ['isValidBST', 'is_valid_bst'],
    ['lengthOfLIS', 'length_of_lis'],
    ['parseHTMLTag', 'parse_html_tag'],
    ['kClosest', 'k_closest'],
    ['log2Floor', 'log2_floor'],
    ['nums', 'nums'],
  ])('%s → %s', (name, expected) => {
    expect(snake(name)).toBe(expected);
  });
});

describe('stubs', () => {
  const fn: FunctionSig = {
    function: 'invertTree',
    params: [{ name: 'root', type: 'TreeNode' }],
    returns: 'TreeNode',
  };
  const inPlace: FunctionSig = {
    function: 'setZeroes',
    params: [{ name: 'matrix', type: 'int[][]' }],
    returns: 'void',
    inPlace: 'matrix',
  };
  const design: DesignSig = {
    class: 'MinStack',
    init: [],
    methods: [
      { name: 'push', params: [{ name: 'val', type: 'int' }], returns: 'void' },
      { name: 'getMin', params: [], returns: 'int' },
    ],
  };

  it('writes a function in each language, saying which node classes exist', () => {
    expect(stub({ signature: fn }, 'python')).toBe(
      '# TreeNode(val, left=None, right=None) is defined for you.\n\ndef invert_tree(root: TreeNode | None) -> TreeNode | None:\n    pass\n',
    );
    expect(stub({ signature: fn }, 'typescript')).toBe(
      '// TreeNode is defined for you: new TreeNode(val, left, right).\n\nfunction invertTree(root: TreeNode | null): TreeNode | null {\n\n}\n',
    );
    expect(stub({ signature: fn }, 'javascript')).toContain('/**\n * @param {TreeNode | null} root\n * @return {TreeNode | null}\n */\nfunction invertTree(root) {');
  });

  it('says an in-place function returns nothing', () => {
    expect(stub({ signature: inPlace }, 'python')).toBe(
      'def set_zeroes(matrix: list[list[int]]) -> None:\n    # Change matrix in place; nothing to return.\n    pass\n',
    );
    expect(stub({ signature: inPlace }, 'javascript')).toContain('function setZeroes(matrix) {\n  // Change matrix in place; nothing to return.\n}');
  });

  it('writes a design class with snake_case methods in Python and JSDoc only where it says something', () => {
    expect(stub({ design }, 'python')).toBe(
      'class MinStack:\n    def __init__(self):\n        pass\n\n    def push(self, val: int) -> None:\n        pass\n\n    def get_min(self) -> int:\n        pass\n',
    );
    expect(stub({ design }, 'javascript')).toBe(
      'class MinStack {\n  constructor() {\n\n  }\n\n  /**\n   * @param {number} val\n   */\n  push(val) {\n\n  }\n\n  /**\n   * @return {number}\n   */\n  getMin() {\n\n  }\n}\n',
    );
  });

  it('writes LeetCode-style classes in Java and C++, and a function in Go', () => {
    expect(stub({ signature: fn }, 'java')).toBe(
      '// TreeNode is defined for you: new TreeNode(val, left, right), with fields val, left and right.\n\nclass Solution {\n    public TreeNode invertTree(TreeNode root) {\n\n    }\n}\n',
    );
    expect(stub({ signature: inPlace }, 'cpp')).toBe(
      'class Solution {\npublic:\n    void setZeroes(vector<vector<int>>& matrix) {\n        // Change matrix in place; nothing to return.\n    }\n};\n',
    );
    expect(stub({ signature: fn }, 'go')).toContain('func invertTree(root *TreeNode) *TreeNode {\n\n}\n');
  });

  it('returns lists of lists as List<List<…>> in Java, as LeetCode does', () => {
    const groups: FunctionSig = { function: 'groupAnagrams', params: [{ name: 'strs', type: 'string[]' }], returns: 'string[][]' };
    expect(stub({ signature: groups }, 'java')).toContain('public List<List<String>> groupAnagrams(String[] strs) {');
    expect(stub({ signature: groups }, 'cpp')).toContain('vector<vector<string>> groupAnagrams(vector<string>& strs) {');
    expect(stub({ signature: groups }, 'go')).toContain('func groupAnagrams(strs []string) [][]string {');
  });

  it('writes a design problem as a Go struct with Constructor and exported methods', () => {
    expect(stub({ design }, 'go')).toBe(
      'type MinStack struct {\n\n}\n\nfunc Constructor() MinStack {\n\n}\n\nfunc (this *MinStack) Push(val int) {\n\n}\n\nfunc (this *MinStack) GetMin() int {\n\n}\n',
    );
    expect(stub({ design }, 'java')).toContain('class MinStack {\n    public MinStack() {\n\n    }\n\n    public void push(int val) {');
    expect(stub({ design }, 'cpp')).toContain('class MinStack {\npublic:\n    MinStack() {\n\n    }\n\n    void push(int val) {');
  });
});
