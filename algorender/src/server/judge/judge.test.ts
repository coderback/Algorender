// The server judge's drivers, end to end in the local Docker sandbox: right
// answers pass in every value shape (arrays, trees, lists, in place, design
// calls, floats), and wrong answers, errors, crashes, endless loops, prints
// and compile errors come back the way the workspace shows them.
// Skipped when Docker or the algorender-judge image isn't there
// (npm run judge:image builds it).

import { beforeAll, describe, expect, it } from 'vitest';
import type { ServerLanguage } from '@/problems/languages';
import { stub } from '@/problems/codegen';
import { getProblem, specFor } from '@/problems/load';
import { dockerAvailable, dockerSandbox } from './docker';
import { judgeInSandbox } from './sandbox';

const available = await dockerAvailable();
const TIMEOUT = 120_000;

async function judge(slug: string, language: ServerLanguage, code: string, groups: string[] = ['example', 'test', 'random']) {
  const spec = specFor(getProblem(slug)!);
  const tests = spec.cases.filter((c) => groups.includes(c.group));
  return { tests, result: await judgeInSandbox(dockerSandbox, spec, language, code, tests) };
}

const allPass = async (slug: string, language: ServerLanguage, code: string) => {
  const { tests, result } = await judge(slug, language, code);
  expect(result.fatal).toBeNull();
  expect(result.checked.filter((c) => c.verdict.status !== 'pass').map((c) => `${c.id}: ${c.verdict.message}`)).toEqual([]);
  expect(result.checked).toHaveLength(tests.length);
};

const TWO_SUM = {
  java: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[] {j, i};
            seen.put(nums[i], i);
        }
        return new int[0];
    }
}
`,
  cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            auto it = seen.find(target - nums[i]);
            if (it != seen.end()) return {it->second, i};
            seen[nums[i]] = i;
        }
        return {};
    }
};
`,
  go: `func twoSum(nums []int, target int) []int {
	seen := map[int]int{}
	for i, x := range nums {
		if j, ok := seen[target-x]; ok {
			return []int{j, i}
		}
		seen[x] = i
	}
	return nil
}
`,
};

/** Right answers for problems that use every value shape: trees, lists, in place, strings, design calls and floats. */
const SHAPES: Record<string, Record<ServerLanguage, string>> = {
  'invert-binary-tree': {
    java: 'class Solution {\n    public TreeNode invertTree(TreeNode root) {\n        if (root == null) return null;\n        TreeNode left = invertTree(root.left);\n        root.left = invertTree(root.right);\n        root.right = left;\n        return root;\n    }\n}\n',
    cpp: 'class Solution {\npublic:\n    TreeNode* invertTree(TreeNode* root) {\n        if (!root) return nullptr;\n        swap(root->left, root->right);\n        invertTree(root->left);\n        invertTree(root->right);\n        return root;\n    }\n};\n',
    go: 'func invertTree(root *TreeNode) *TreeNode {\n\tif root == nil {\n\t\treturn nil\n\t}\n\troot.Left, root.Right = invertTree(root.Right), invertTree(root.Left)\n\treturn root\n}\n',
  },
  'reverse-linked-list': {
    java: 'class Solution {\n    public ListNode reverseList(ListNode head) {\n        ListNode prev = null;\n        while (head != null) { ListNode next = head.next; head.next = prev; prev = head; head = next; }\n        return prev;\n    }\n}\n',
    cpp: 'class Solution {\npublic:\n    ListNode* reverseList(ListNode* head) {\n        ListNode* prev = nullptr;\n        while (head) { ListNode* next = head->next; head->next = prev; prev = head; head = next; }\n        return prev;\n    }\n};\n',
    go: 'func reverseList(head *ListNode) *ListNode {\n\tvar prev *ListNode\n\tfor head != nil {\n\t\thead, head.Next, prev = head.Next, prev, head\n\t}\n\treturn prev\n}\n',
  },
  'rotate-image': {
    java: 'class Solution {\n    public void rotate(int[][] m) {\n        int n = m.length;\n        for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) { int t = m[i][j]; m[i][j] = m[j][i]; m[j][i] = t; }\n        for (int[] row : m) for (int i = 0, j = n - 1; i < j; i++, j--) { int t = row[i]; row[i] = row[j]; row[j] = t; }\n    }\n}\n',
    cpp: 'class Solution {\npublic:\n    void rotate(vector<vector<int>>& m) {\n        int n = m.size();\n        for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) swap(m[i][j], m[j][i]);\n        for (auto& row : m) reverse(row.begin(), row.end());\n    }\n};\n',
    go: 'func rotate(m [][]int) {\n\tn := len(m)\n\tfor i := 0; i < n; i++ {\n\t\tfor j := i + 1; j < n; j++ {\n\t\t\tm[i][j], m[j][i] = m[j][i], m[i][j]\n\t\t}\n\t}\n\tfor _, row := range m {\n\t\tslices.Reverse(row)\n\t}\n}\n',
  },
  'group-anagrams': {
    java: 'class Solution {\n    public List<List<String>> groupAnagrams(String[] strs) {\n        Map<String, List<String>> groups = new LinkedHashMap<>();\n        for (String s : strs) {\n            char[] key = s.toCharArray();\n            Arrays.sort(key);\n            groups.computeIfAbsent(new String(key), k -> new ArrayList<>()).add(s);\n        }\n        return new ArrayList<>(groups.values());\n    }\n}\n',
    cpp: 'class Solution {\npublic:\n    vector<vector<string>> groupAnagrams(vector<string>& strs) {\n        map<string, vector<string>> groups;\n        for (auto& s : strs) { string k = s; sort(k.begin(), k.end()); groups[k].push_back(s); }\n        vector<vector<string>> out;\n        for (auto& [k, g] : groups) out.push_back(g);\n        return out;\n    }\n};\n',
    go: 'func groupAnagrams(strs []string) [][]string {\n\tgroups := map[string][]string{}\n\tfor _, s := range strs {\n\t\tk := []byte(s)\n\t\tsort.Slice(k, func(i, j int) bool { return k[i] < k[j] })\n\t\tgroups[string(k)] = append(groups[string(k)], s)\n\t}\n\tout := [][]string{}\n\tfor _, g := range groups {\n\t\tout = append(out, g)\n\t}\n\treturn out\n}\n',
  },
  'min-stack': {
    java: 'class MinStack {\n    private final Deque<int[]> stack = new ArrayDeque<>();\n\n    public MinStack() {}\n\n    public void push(int val) { stack.push(new int[] {val, stack.isEmpty() ? val : Math.min(val, stack.peek()[1])}); }\n\n    public void pop() { stack.pop(); }\n\n    public int top() { return stack.peek()[0]; }\n\n    public int getMin() { return stack.peek()[1]; }\n}\n',
    cpp: 'class MinStack {\n    vector<pair<int, int>> s;\npublic:\n    MinStack() {}\n    void push(int val) { s.push_back({val, s.empty() ? val : min(val, s.back().second)}); }\n    void pop() { s.pop_back(); }\n    int top() { return s.back().first; }\n    int getMin() { return s.back().second; }\n};\n',
    go: 'type MinStack struct {\n\tvals, mins []int\n}\n\nfunc Constructor() MinStack { return MinStack{} }\n\nfunc (this *MinStack) Push(val int) {\n\tm := val\n\tif len(this.mins) > 0 {\n\t\tm = min(m, this.mins[len(this.mins)-1])\n\t}\n\tthis.vals = append(this.vals, val)\n\tthis.mins = append(this.mins, m)\n}\n\nfunc (this *MinStack) Pop() {\n\tthis.vals = this.vals[:len(this.vals)-1]\n\tthis.mins = this.mins[:len(this.mins)-1]\n}\n\nfunc (this *MinStack) Top() int { return this.vals[len(this.vals)-1] }\n\nfunc (this *MinStack) GetMin() int { return this.mins[len(this.mins)-1] }\n',
  },
  'median-finder': {
    java: 'class MedianFinder {\n    private final PriorityQueue<Integer> low = new PriorityQueue<>(Collections.reverseOrder()), high = new PriorityQueue<>();\n\n    public MedianFinder() {}\n\n    public void addNum(int num) {\n        low.add(num);\n        high.add(low.poll());\n        if (high.size() > low.size()) low.add(high.poll());\n    }\n\n    public double findMedian() { return low.size() > high.size() ? low.peek() : (low.peek() + high.peek()) / 2.0; }\n}\n',
    cpp: 'class MedianFinder {\n    priority_queue<int> low;\n    priority_queue<int, vector<int>, greater<int>> high;\npublic:\n    MedianFinder() {}\n    void addNum(int num) {\n        low.push(num); high.push(low.top()); low.pop();\n        if (high.size() > low.size()) { low.push(high.top()); high.pop(); }\n    }\n    double findMedian() { return low.size() > high.size() ? low.top() : (low.top() + (double)high.top()) / 2; }\n};\n',
    go: 'type MedianFinder struct{ nums []int }\n\nfunc Constructor() MedianFinder { return MedianFinder{} }\n\nfunc (this *MedianFinder) AddNum(num int) {\n\ti := sort.SearchInts(this.nums, num)\n\tthis.nums = slices.Insert(this.nums, i, num)\n}\n\nfunc (this *MedianFinder) FindMedian() float64 {\n\tn := len(this.nums)\n\tif n%2 == 1 {\n\t\treturn float64(this.nums[n/2])\n\t}\n\treturn float64(this.nums[n/2-1]+this.nums[n/2]) / 2\n}\n',
  },
};

describe.skipIf(!available)('the server judge in Docker', () => {
  beforeAll(() => {
    expect(available).toBe(true);
  });

  it.each(['java', 'cpp', 'go'] as const)('passes a right answer to every test in %s', async (language) => {
    await allPass('two-sum', language, TWO_SUM[language]);
  }, TIMEOUT);

  for (const [slug, solutions] of Object.entries(SHAPES)) {
    it.each(['java', 'cpp', 'go'] as const)(`passes ${slug} in %s`, async (language) => {
      await allPass(slug, language, solutions[language]);
    }, TIMEOUT);
  }

  const examples = (language: ServerLanguage, code: string) => judge('two-sum', language, code, ['example']);

  it.each(['java', 'cpp', 'go'] as const)('fails a wrong answer and says what it got, in %s', async (language) => {
    // The tree as given, not inverted.
    const wrong = {
      java: 'class Solution {\n    public TreeNode invertTree(TreeNode root) { return root; }\n}\n',
      cpp: 'class Solution {\npublic:\n    TreeNode* invertTree(TreeNode* root) { return root; }\n};\n',
      go: 'func invertTree(root *TreeNode) *TreeNode { return root }\n',
    };
    const { tests, result } = await judge('invert-binary-tree', language, wrong[language], ['example']);
    expect(result.checked[0].verdict).toMatchObject({ status: 'fail', got: tests[0].input!.root });
    expect(result.checked[0].verdict.message).toMatch(/^Expected \[.*\], got \[.*\]\.$/);
  }, TIMEOUT);

  it('reports an exception with its line, keeps judging the next tests, and keeps each test’s prints', async () => {
    const java = 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        System.out.println("n=" + nums.length);\n        int[] none = new int[0];\n        if (nums.length > 3) return new int[] {none[1]};\n        return new int[] {0, 1};\n    }\n}\n';
    const { result } = await examples('java', java);
    expect(result.checked[0]).toMatchObject({ output: ['n=4'], verdict: { status: 'error', message: 'Line 5: ArrayIndexOutOfBoundsException: Index 1 out of bounds for length 0' } });
    expect(result.checked[1]).toMatchObject({ output: ['n=3'], verdict: { status: 'fail' } });
  }, TIMEOUT);

  it('reports a Go panic with its line, and a C++ exception', async () => {
    const go = 'func twoSum(nums []int, target int) []int {\n\tvar none []int\n\treturn []int{none[3]}\n}\n';
    const { result } = await examples('go', go);
    expect(result.checked[0].verdict).toMatchObject({ status: 'error', message: 'Line 3: panic: runtime error: index out of range [3] with length 0' });
    const cpp = 'class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        return {nums.at(99)};\n    }\n};\n';
    const thrown = await examples('cpp', cpp);
    expect(thrown.result.checked[0].verdict.status).toBe('error');
    expect(thrown.result.checked[0].verdict.message).toMatch(/^Exception: vector::_M_range_check/);
  }, TIMEOUT);

  it('explains a C++ crash and stops judging there', async () => {
    const cpp = 'class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        volatile int* p = nullptr;\n        return {*p};\n    }\n};\n';
    const { tests, result } = await examples('cpp', cpp);
    expect(result.checked).toHaveLength(1);
    expect(result.checked[0].verdict.message).toMatch(/^Segmentation fault/);
    expect(result.skipped).toBe(tests.length - 1);
  }, TIMEOUT);

  it.each([
    ['java', 'class Solution {\n    int depth(int n) { return depth(n + 1) + 1; }\n    public int[] twoSum(int[] nums, int target) { return new int[] {depth(0)}; }\n}\n', /^Line 2: StackOverflowError/],
    ['go', 'func depth(n int) int { return depth(n+1) + 1 }\n\nfunc twoSum(nums []int, target int) []int { return []int{depth(0)} }\n', /^Line 1: Stack overflow/],
    ['cpp', 'class Solution {\n    int depth(int n) { volatile int pad[8]; pad[0] = n; return depth(n + 1) + pad[0]; }\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) { return {depth(0)}; }\n};\n', /^Segmentation fault/],
  ] as const)('explains endless recursion in %s', async (language, code, message) => {
    const { result } = await examples(language, code);
    expect(result.checked[0].verdict.status).toBe('error');
    expect(result.checked[0].verdict.message).toMatch(message);
  }, TIMEOUT);

  it.each([
    ['java', 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        while (true) {}\n    }\n}\n'],
    ['go', 'func twoSum(nums []int, target int) []int {\n\tfor {\n\t}\n}\n'],
  ] as const)('stops an endless loop in %s as a timeout, and runs no more tests', async (language, code) => {
    const { tests, result } = await examples(language, code);
    expect(result.checked).toHaveLength(1);
    expect(result.checked[0].verdict.status).toBe('timeout');
    expect(result.skipped).toBe(tests.length - 1);
  }, TIMEOUT);

  it.each([
    ['java', 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        int x = 1\n        return nums;\n    }\n}\n', 3, /Solution\.java:3: error: ';' expected/],
    ['cpp', 'class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        return undefinedThing;\n    }\n};\n', 4, /solution\.cpp:4:\d+: error: 'undefinedThing' was not declared/],
    ['go', 'func twoSum(nums []int, target int) []int {\n\tunused := 1\n\treturn nums\n}\n', 2, /solution\.go:2(:\d+)?: declared and not used: unused/],
  ] as const)('reports a %s compile error at the learner’s line', async (language, code, line, message) => {
    const { result } = await examples(language, code);
    expect(result.fatal).toMatchObject({ kind: 'compile', line });
    expect(result.fatal!.message).toMatch(message);
    expect(result.checked).toEqual([]);
  }, TIMEOUT);

  it.each(['java', 'cpp', 'go'] as const)('fails the generated %s stubs, as written', async (language) => {
    for (const slug of ['two-sum', 'min-stack', 'rotate-image']) {
      const spec = specFor(getProblem(slug)!);
      const { result } = await judge(slug, language, stub(spec, language), ['example']);
      expect(result.fatal != null || result.checked.some((c) => c.verdict.status !== 'pass'), slug).toBe(true);
    }
  }, TIMEOUT * 2);
});
