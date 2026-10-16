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
});
