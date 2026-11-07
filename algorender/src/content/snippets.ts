// Short programs that lessons trace line by line on the memory view
// (<TraceCode snippet="…" />). Each runs as top-level code, so it calls its
// own functions. snippets.test.ts runs every one in every language it offers.

import type { Language } from '@/workspace/protocol';

export type Snippet = {
  id: string;
  /** Names the code for screen readers and the editor's label. */
  title: string;
  /** The program per language; a lesson offers the languages given here. */
  code: Partial<Record<Language, string>>;
};

export const snippets: Snippet[] = [
  {
    id: 'count-pairs',
    title: 'Counting the pairs two nested loops visit',
    code: {
      python: `def count_pairs(n):
    steps = 0
    for i in range(n):
        for j in range(i + 1, n):
            steps += 1
    return steps

print(count_pairs(4))
`,
      javascript: `function countPairs(n) {
  let steps = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      steps += 1;
    }
  }
  return steps;
}

console.log(countPairs(4));
`,
      typescript: `function countPairs(n: number): number {
  let steps = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      steps += 1;
    }
  }
  return steps;
}

console.log(countPairs(4));
`,
    },
  },
  {
    id: 'insert-front',
    title: 'Inserting at the front of an array by shifting',
    code: {
      python: `def insert_front(a, x):
    a.append(None)
    for j in range(len(a) - 1, 0, -1):
        a[j] = a[j - 1]
    a[0] = x

scores = [7, 23, 4, 42]
insert_front(scores, 99)
print(scores)
`,
      javascript: `function insertFront(a, x) {
  a.push(null);
  for (let j = a.length - 1; j > 0; j--) {
    a[j] = a[j - 1];
  }
  a[0] = x;
}

const scores = [7, 23, 4, 42];
insertFront(scores, 99);
console.log(scores);
`,
      typescript: `function insertFront(a: (number | null)[], x: number): void {
  a.push(null);
  for (let j = a.length - 1; j > 0; j--) {
    a[j] = a[j - 1];
  }
  a[0] = x;
}

const scores: (number | null)[] = [7, 23, 4, 42];
insertFront(scores, 99);
console.log(scores);
`,
    },
  },
  {
    id: 'balanced-brackets',
    title: 'Checking brackets match with a stack',
    code: {
      python: `def balanced(text):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in text:
        if ch in '([{':
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack

print(balanced('{[()]}'))
print(balanced('([)]'))
`,
      javascript: `function balanced(text) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of text) {
    if ('([{'.includes(ch)) {
      stack.push(ch);
    } else if (ch in pairs) {
      if (stack.length === 0 || stack.pop() !== pairs[ch]) {
        return false;
      }
    }
  }
  return stack.length === 0;
}

console.log(balanced('{[()]}'));
console.log(balanced('([)]'));
`,
      typescript: `function balanced(text: string): boolean {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const stack: string[] = [];
  for (const ch of text) {
    if ('([{'.includes(ch)) {
      stack.push(ch);
    } else if (ch in pairs) {
      if (stack.length === 0 || stack.pop() !== pairs[ch]) {
        return false;
      }
    }
  }
  return stack.length === 0;
}

console.log(balanced('{[()]}'));
console.log(balanced('([)]'));
`,
    },
  },
  {
    id: 'factorial',
    title: 'Factorial, recursively',
    code: {
      python: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

result = factorial(4)
print(result)
`,
      javascript: `function factorial(n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

const result = factorial(4);
console.log(result);
`,
      typescript: `function factorial(n: number): number {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

const result = factorial(4);
console.log(result);
`,
    },
  },
  {
    id: 'recursive-sum',
    title: 'Summing a list, recursively',
    code: {
      python: `def total(nums, i):
    if i == len(nums):
        return 0
    return nums[i] + total(nums, i + 1)

values = [3, 1, 4]
print(total(values, 0))
`,
      javascript: `function total(nums, i) {
  if (i === nums.length) {
    return 0;
  }
  return nums[i] + total(nums, i + 1);
}

const values = [3, 1, 4];
console.log(total(values, 0));
`,
      typescript: `function total(nums: number[], i: number): number {
  if (i === nums.length) {
    return 0;
  }
  return nums[i] + total(nums, i + 1);
}

const values = [3, 1, 4];
console.log(total(values, 0));
`,
    },
  },
  {
    id: 'reverse-list',
    title: 'Reversing a linked list in place',
    code: {
      python: `class Node:
    def __init__(self, value, next):
        self.value = value
        self.next = next

def reverse(head):
    prev = None
    cur = head
    while cur is not None:
        nxt = cur.next
        cur.next = prev
        prev = cur
        cur = nxt
    return prev

head = Node(1, Node(2, Node(3, None)))
head = reverse(head)
node = head
while node is not None:
    print(node.value)
    node = node.next
`,
      javascript: `class Node {
  constructor(value, next) {
    this.value = value;
    this.next = next;
  }
}

function reverse(head) {
  let prev = null;
  let cur = head;
  while (cur !== null) {
    const nxt = cur.next;
    cur.next = prev;
    prev = cur;
    cur = nxt;
  }
  return prev;
}

let head = new Node(1, new Node(2, new Node(3, null)));
head = reverse(head);
let node = head;
while (node !== null) {
  console.log(node.value);
  node = node.next;
}
`,
      typescript: `class Node {
  value: number;
  next: Node | null;

  constructor(value: number, next: Node | null) {
    this.value = value;
    this.next = next;
  }
}

function reverse(head: Node | null): Node | null {
  let prev: Node | null = null;
  let cur = head;
  while (cur !== null) {
    const nxt = cur.next;
    cur.next = prev;
    prev = cur;
    cur = nxt;
  }
  return prev;
}

let head: Node | null = new Node(1, new Node(2, new Node(3, null)));
head = reverse(head);
let node = head;
while (node !== null) {
  console.log(node.value);
  node = node.next;
}
`,
    },
  },
  {
    id: 'bst-insert-search',
    title: 'Inserting into and searching a binary search tree',
    code: {
      python: `class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None

def insert(node, key):
    if node is None:
        return Node(key)
    if key < node.key:
        node.left = insert(node.left, key)
    elif key > node.key:
        node.right = insert(node.right, key)
    return node

def search(node, key):
    while node is not None:
        if key == node.key:
            return True
        if key < node.key:
            node = node.left
        else:
            node = node.right
    return False

root = None
for key in [50, 30, 70, 40]:
    root = insert(root, key)
print(search(root, 40))
print(search(root, 60))
`,
      javascript: `class Node {
  constructor(key) {
    this.key = key;
    this.left = null;
    this.right = null;
  }
}

function insert(node, key) {
  if (node === null) {
    return new Node(key);
  }
  if (key < node.key) {
    node.left = insert(node.left, key);
  } else if (key > node.key) {
    node.right = insert(node.right, key);
  }
  return node;
}

function search(node, key) {
  while (node !== null) {
    if (key === node.key) {
      return true;
    }
    if (key < node.key) {
      node = node.left;
    } else {
      node = node.right;
    }
  }
  return false;
}

let root = null;
for (const key of [50, 30, 70, 40]) {
  root = insert(root, key);
}
console.log(search(root, 40));
console.log(search(root, 60));
`,
      typescript: `class Node {
  key: number;
  left: Node | null;
  right: Node | null;

  constructor(key: number) {
    this.key = key;
    this.left = null;
    this.right = null;
  }
}

function insert(node: Node | null, key: number): Node {
  if (node === null) {
    return new Node(key);
  }
  if (key < node.key) {
    node.left = insert(node.left, key);
  } else if (key > node.key) {
    node.right = insert(node.right, key);
  }
  return node;
}

function search(node: Node | null, key: number): boolean {
  while (node !== null) {
    if (key === node.key) {
      return true;
    }
    if (key < node.key) {
      node = node.left;
    } else {
      node = node.right;
    }
  }
  return false;
}

let root: Node | null = null;
for (const key of [50, 30, 70, 40]) {
  root = insert(root, key);
}
console.log(search(root, 40));
console.log(search(root, 60));
`,
    },
  },
  {
    id: 'heap-push',
    title: 'Pushing a value onto a min-heap and sifting it up',
    code: {
      python: `def heap_push(heap, x):
    heap.append(x)
    i = len(heap) - 1
    while i > 0:
        parent = (i - 1) // 2
        if heap[parent] <= heap[i]:
            break
        heap[i], heap[parent] = heap[parent], heap[i]
        i = parent

priorities = [1, 4, 3, 8, 6, 9, 7]
heap_push(priorities, 2)
print(priorities)
`,
      javascript: `function heapPush(heap, x) {
  heap.push(x);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2);
    if (heap[parent] <= heap[i]) {
      break;
    }
    [heap[i], heap[parent]] = [heap[parent], heap[i]];
    i = parent;
  }
}

const priorities = [1, 4, 3, 8, 6, 9, 7];
heapPush(priorities, 2);
console.log(priorities);
`,
      typescript: `function heapPush(heap: number[], x: number): void {
  heap.push(x);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2);
    if (heap[parent] <= heap[i]) {
      break;
    }
    [heap[i], heap[parent]] = [heap[parent], heap[i]];
    i = parent;
  }
}

const priorities: number[] = [1, 4, 3, 8, 6, 9, 7];
heapPush(priorities, 2);
console.log(priorities);
`,
    },
  },
  {
    id: 'longest-run-window',
    title: 'The longest run within a limit, with a window that grows and shrinks',
    code: {
      python: `def longest_run(nums, limit):
    left = 0
    total = 0
    best = 0
    for right in range(len(nums)):
        total += nums[right]
        while total > limit:
            total -= nums[left]
            left += 1
        best = max(best, right - left + 1)
    return best

costs = [2, 1, 3, 1, 1, 4, 2]
print(longest_run(costs, 6))
`,
      javascript: `function longestRun(nums, limit) {
  let left = 0;
  let total = 0;
  let best = 0;
  for (let right = 0; right < nums.length; right++) {
    total += nums[right];
    while (total > limit) {
      total -= nums[left];
      left += 1;
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}

const costs = [2, 1, 3, 1, 1, 4, 2];
console.log(longestRun(costs, 6));
`,
      typescript: `function longestRun(nums: number[], limit: number): number {
  let left = 0;
  let total = 0;
  let best = 0;
  for (let right = 0; right < nums.length; right++) {
    total += nums[right];
    while (total > limit) {
      total -= nums[left];
      left += 1;
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}

const costs: number[] = [2, 1, 3, 1, 1, 4, 2];
console.log(longestRun(costs, 6));
`,
    },
  },
  {
    id: 'fewest-coins',
    title: 'The fewest coins for an amount, filled bottom-up',
    code: {
      python: `def fewest_coins(coins, amount):
    too_many = amount + 1
    dp = [too_many] * (amount + 1)
    dp[0] = 0
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    if dp[amount] == too_many:
        return -1
    return dp[amount]

print(fewest_coins([1, 3, 4], 6))
`,
      javascript: `function fewestCoins(coins, amount) {
  const tooMany = amount + 1;
  const dp = new Array(amount + 1).fill(tooMany);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) {
      if (c <= a && dp[a - c] + 1 < dp[a]) {
        dp[a] = dp[a - c] + 1;
      }
    }
  }
  if (dp[amount] === tooMany) {
    return -1;
  }
  return dp[amount];
}

console.log(fewestCoins([1, 3, 4], 6));
`,
      typescript: `function fewestCoins(coins: number[], amount: number): number {
  const tooMany = amount + 1;
  const dp: number[] = new Array(amount + 1).fill(tooMany);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) {
      if (c <= a && dp[a - c] + 1 < dp[a]) {
        dp[a] = dp[a - c] + 1;
      }
    }
  }
  if (dp[amount] === tooMany) {
    return -1;
  }
  return dp[amount];
}

console.log(fewestCoins([1, 3, 4], 6));
`,
    },
  },
  {
    id: 'chained-map',
    title: 'Putting and getting keys in a hash map with chained buckets',
    code: {
      python: `def bucket_of(key, m):
    total = 0
    for ch in key:
        total += ord(ch)
    return total % m

def put(buckets, key, value):
    chain = buckets[bucket_of(key, len(buckets))]
    for pair in chain:
        if pair[0] == key:
            pair[1] = value
            return
    chain.append([key, value])

def get(buckets, key):
    chain = buckets[bucket_of(key, len(buckets))]
    for pair in chain:
        if pair[0] == key:
            return pair[1]
    return -1

buckets = [[], [], [], [], []]
put(buckets, 'no', 4)
put(buckets, 'on', 9)
print(get(buckets, 'on'))
`,
      javascript: `function bucketOf(key, m) {
  let total = 0;
  for (const ch of key) {
    total += ch.charCodeAt(0);
  }
  return total % m;
}

function put(buckets, key, value) {
  const chain = buckets[bucketOf(key, buckets.length)];
  for (const pair of chain) {
    if (pair[0] === key) {
      pair[1] = value;
      return;
    }
  }
  chain.push([key, value]);
}

function get(buckets, key) {
  const chain = buckets[bucketOf(key, buckets.length)];
  for (const pair of chain) {
    if (pair[0] === key) {
      return pair[1];
    }
  }
  return -1;
}

const buckets = [[], [], [], [], []];
put(buckets, 'no', 4);
put(buckets, 'on', 9);
console.log(get(buckets, 'on'));
`,
      typescript: `function bucketOf(key: string, m: number): number {
  let total = 0;
  for (const ch of key) {
    total += ch.charCodeAt(0);
  }
  return total % m;
}

function put(buckets: [string, number][][], key: string, value: number): void {
  const chain = buckets[bucketOf(key, buckets.length)];
  for (const pair of chain) {
    if (pair[0] === key) {
      pair[1] = value;
      return;
    }
  }
  chain.push([key, value]);
}

function get(buckets: [string, number][][], key: string): number {
  const chain = buckets[bucketOf(key, buckets.length)];
  for (const pair of chain) {
    if (pair[0] === key) {
      return pair[1];
    }
  }
  return -1;
}

const buckets: [string, number][][] = [[], [], [], [], []];
put(buckets, 'no', 4);
put(buckets, 'on', 9);
console.log(get(buckets, 'on'));
`,
    },
  },
  {
    id: 'rotate-right',
    title: 'Rotating a leaning subtree right',
    code: {
      python: `class BstNode:
    def __init__(self, key, left):
        self.key = key
        self.left = left
        self.right = None

def rotate_right(node):
    lifted = node.left
    node.left = lifted.right
    lifted.right = node
    return lifted

root = BstNode(30, BstNode(20, BstNode(10, None)))
print('root ' + str(root.key))
root = rotate_right(root)
print('root ' + str(root.key))
print(str(root.left.key) + ' < ' + str(root.key) + ' < ' + str(root.right.key))
`,
      javascript: `class BstNode {
  constructor(key, left) {
    this.key = key;
    this.left = left;
    this.right = null;
  }
}

function rotateRight(node) {
  const lifted = node.left;
  node.left = lifted.right;
  lifted.right = node;
  return lifted;
}

let root = new BstNode(30, new BstNode(20, new BstNode(10, null)));
console.log('root ' + root.key);
root = rotateRight(root);
console.log('root ' + root.key);
console.log(root.left.key + ' < ' + root.key + ' < ' + root.right.key);
`,
      typescript: `class BstNode {
  key: number;
  left: BstNode | null;
  right: BstNode | null;

  constructor(key: number, left: BstNode | null) {
    this.key = key;
    this.left = left;
    this.right = null;
  }
}

function rotateRight(node: BstNode): BstNode {
  const lifted = node.left!;
  node.left = lifted.right;
  lifted.right = node;
  return lifted;
}

let root = new BstNode(30, new BstNode(20, new BstNode(10, null)));
console.log('root ' + root.key);
root = rotateRight(root);
console.log('root ' + root.key);
console.log(root.left!.key + ' < ' + root.key + ' < ' + root.right!.key);
`,
    },
  },
  {
    id: 'adjacency-from-edges',
    title: 'Building adjacency lists from a list of edges',
    code: {
      python: `def build(vertices, edges):
    adj = {}
    for v in vertices:
        adj[v] = []
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    return adj

stops = ['A', 'B', 'C', 'D']
roads = [['A', 'B'], ['A', 'C'], ['B', 'C'], ['C', 'D']]
graph = build(stops, roads)
for v in stops:
    print(v + ': ' + ' '.join(graph[v]))
`,
      javascript: `function build(vertices, edges) {
  const adj = {};
  for (const v of vertices) {
    adj[v] = [];
  }
  for (const [u, v] of edges) {
    adj[u].push(v);
    adj[v].push(u);
  }
  return adj;
}

const stops = ['A', 'B', 'C', 'D'];
const roads = [['A', 'B'], ['A', 'C'], ['B', 'C'], ['C', 'D']];
const graph = build(stops, roads);
for (const v of stops) {
  console.log(v + ': ' + graph[v].join(' '));
}
`,
      typescript: `function build(vertices: string[], edges: string[][]): Record<string, string[]> {
  const adj: Record<string, string[]> = {};
  for (const v of vertices) {
    adj[v] = [];
  }
  for (const [u, v] of edges) {
    adj[u].push(v);
    adj[v].push(u);
  }
  return adj;
}

const stops: string[] = ['A', 'B', 'C', 'D'];
const roads: string[][] = [['A', 'B'], ['A', 'C'], ['B', 'C'], ['C', 'D']];
const graph = build(stops, roads);
for (const v of stops) {
  console.log(v + ': ' + graph[v].join(' '));
}
`,
    },
  },
  {
    id: 'union-by-rank',
    title: 'Union by rank, with path compression',
    code: {
      python: `def find_root(parent, x):
    if parent[x] != x:
        parent[x] = find_root(parent, parent[x])
    return parent[x]

def union(parent, rank, a, b):
    ra = find_root(parent, a)
    rb = find_root(parent, b)
    if ra == rb:
        return 0
    if rank[ra] < rank[rb]:
        ra, rb = rb, ra
    parent[rb] = ra
    if rank[ra] == rank[rb]:
        rank[ra] += 1
    return 1

forest = [0, 0, 0, 2, 4, 4]
rank = [2, 0, 1, 0, 1, 0]
groups = 2
groups -= union(forest, rank, 3, 5)
print(groups)
`,
      javascript: `function findRoot(parent, x) {
  if (parent[x] !== x) {
    parent[x] = findRoot(parent, parent[x]);
  }
  return parent[x];
}

function union(parent, rank, a, b) {
  let ra = findRoot(parent, a);
  let rb = findRoot(parent, b);
  if (ra === rb) {
    return 0;
  }
  if (rank[ra] < rank[rb]) {
    [ra, rb] = [rb, ra];
  }
  parent[rb] = ra;
  if (rank[ra] === rank[rb]) {
    rank[ra] += 1;
  }
  return 1;
}

const forest = [0, 0, 0, 2, 4, 4];
const rank = [2, 0, 1, 0, 1, 0];
let groups = 2;
groups -= union(forest, rank, 3, 5);
console.log(groups);
`,
      typescript: `function findRoot(parent: number[], x: number): number {
  if (parent[x] !== x) {
    parent[x] = findRoot(parent, parent[x]);
  }
  return parent[x];
}

function union(parent: number[], rank: number[], a: number, b: number): number {
  let ra = findRoot(parent, a);
  let rb = findRoot(parent, b);
  if (ra === rb) {
    return 0;
  }
  if (rank[ra] < rank[rb]) {
    [ra, rb] = [rb, ra];
  }
  parent[rb] = ra;
  if (rank[ra] === rank[rb]) {
    rank[ra] += 1;
  }
  return 1;
}

const forest: number[] = [0, 0, 0, 2, 4, 4];
const rank: number[] = [2, 0, 1, 0, 1, 0];
let groups = 2;
groups -= union(forest, rank, 3, 5);
console.log(groups);
`,
    },
  },
  {
    id: 'merge-sorted-lists',
    title: 'Merging two sorted lists, one index on each',
    code: {
      python: `def merge(left, right):
    out = []
    i = 0
    j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i])
            i += 1
        else:
            out.append(right[j])
            j += 1
    while i < len(left):
        out.append(left[i])
        i += 1
    while j < len(right):
        out.append(right[j])
        j += 1
    return out

merged = merge([4, 7, 12], [3, 7, 9, 15])
print(*merged)
`,
      javascript: `function merge(left, right) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      out.push(left[i]);
      i += 1;
    } else {
      out.push(right[j]);
      j += 1;
    }
  }
  while (i < left.length) {
    out.push(left[i]);
    i += 1;
  }
  while (j < right.length) {
    out.push(right[j]);
    j += 1;
  }
  return out;
}

const merged = merge([4, 7, 12], [3, 7, 9, 15]);
console.log(merged.join(' '));
`,
      typescript: `function merge(left: number[], right: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      out.push(left[i]);
      i += 1;
    } else {
      out.push(right[j]);
      j += 1;
    }
  }
  while (i < left.length) {
    out.push(left[i]);
    i += 1;
  }
  while (j < right.length) {
    out.push(right[j]);
    j += 1;
  }
  return out;
}

const merged: number[] = merge([4, 7, 12], [3, 7, 9, 15]);
console.log(merged.join(' '));
`,
    },
  },
  {
    id: 'bfs-distances',
    title: 'Breadth-first search with a list and a head index as the queue',
    code: {
      python: `def bfs(graph, start):
    dist = {start: 0}
    queue = [start]
    head = 0
    while head < len(queue):
        u = queue[head]
        head += 1
        for v in graph[u]:
            if v not in dist:
                dist[v] = dist[u] + 1
                queue.append(v)
    print(' '.join(queue))
    return dist

graph = {'A': ['B', 'D'], 'B': ['A', 'C'], 'C': ['B', 'D'], 'D': ['A', 'C']}
hops = bfs(graph, 'A')
print('C: ' + str(hops['C']))
`,
      javascript: `function bfs(graph, start) {
  const dist = { [start]: 0 };
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head];
    head += 1;
    for (const v of graph[u]) {
      if (!(v in dist)) {
        dist[v] = dist[u] + 1;
        queue.push(v);
      }
    }
  }
  console.log(queue.join(' '));
  return dist;
}

const graph = { A: ['B', 'D'], B: ['A', 'C'], C: ['B', 'D'], D: ['A', 'C'] };
const hops = bfs(graph, 'A');
console.log('C: ' + hops['C']);
`,
      typescript: `function bfs(graph: Record<string, string[]>, start: string): Record<string, number> {
  const dist: Record<string, number> = { [start]: 0 };
  const queue: string[] = [start];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head];
    head += 1;
    for (const v of graph[u]) {
      if (!(v in dist)) {
        dist[v] = dist[u] + 1;
        queue.push(v);
      }
    }
  }
  console.log(queue.join(' '));
  return dist;
}

const graph = { A: ['B', 'D'], B: ['A', 'C'], C: ['B', 'D'], D: ['A', 'C'] };
const hops = bfs(graph, 'A');
console.log('C: ' + hops['C']);
`,
    },
  },
  {
    id: 'partition-last-pivot',
    title: 'One Lomuto partition, last value as pivot',
    code: {
      python: `def partition(a, lo, hi):
    pivot = a[hi]
    i = lo
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]
    return i

nums = [7, 2, 9, 4, 1, 6]
p = partition(nums, 0, len(nums) - 1)
print('pivot at ' + str(p))
print(*nums)
`,
      javascript: `function partition(a, lo, hi) {
  const pivot = a[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (a[j] < pivot) {
      [a[i], a[j]] = [a[j], a[i]];
      i += 1;
    }
  }
  [a[i], a[hi]] = [a[hi], a[i]];
  return i;
}

const nums = [7, 2, 9, 4, 1, 6];
const p = partition(nums, 0, nums.length - 1);
console.log('pivot at ' + p);
console.log(nums.join(' '));
`,
      typescript: `function partition(a: number[], lo: number, hi: number): number {
  const pivot = a[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (a[j] < pivot) {
      [a[i], a[j]] = [a[j], a[i]];
      i += 1;
    }
  }
  [a[i], a[hi]] = [a[hi], a[i]];
  return i;
}

const nums: number[] = [7, 2, 9, 4, 1, 6];
const p = partition(nums, 0, nums.length - 1);
console.log('pivot at ' + p);
console.log(nums.join(' '));
`,
    },
  },
  {
    id: 'kmp-lps-table',
    title: 'Building the KMP lps table',
    code: {
      python: `def build_lps(p):
    lps = [0] * len(p)
    border = 0
    i = 1
    while i < len(p):
        if p[i] == p[border]:
            border += 1
            lps[i] = border
            i += 1
        elif border > 0:
            border = lps[border - 1]
        else:
            lps[i] = 0
            i += 1
    return lps

lps_table = build_lps('aabaaab')
print(*lps_table)
`,
      javascript: `function buildLps(p) {
  const lps = new Array(p.length).fill(0);
  let border = 0;
  let i = 1;
  while (i < p.length) {
    if (p[i] === p[border]) {
      border += 1;
      lps[i] = border;
      i += 1;
    } else if (border > 0) {
      border = lps[border - 1];
    } else {
      lps[i] = 0;
      i += 1;
    }
  }
  return lps;
}

const lpsTable = buildLps('aabaaab');
console.log(lpsTable.join(' '));
`,
      typescript: `function buildLps(p: string): number[] {
  const lps: number[] = new Array(p.length).fill(0);
  let border = 0;
  let i = 1;
  while (i < p.length) {
    if (p[i] === p[border]) {
      border += 1;
      lps[i] = border;
      i += 1;
    } else if (border > 0) {
      border = lps[border - 1];
    } else {
      lps[i] = 0;
      i += 1;
    }
  }
  return lps;
}

const lpsTable: number[] = buildLps('aabaaab');
console.log(lpsTable.join(' '));
`,
    },
  },
  {
    id: 'subsets-backtracking',
    title: 'Listing every subset by choosing, exploring and un-choosing',
    code: {
      python: `def subsets(items, i, path):
    if i == len(items):
        print('{' + ', '.join(path) + '}')
        return
    path.append(items[i])
    subsets(items, i + 1, path)
    path.pop()
    subsets(items, i + 1, path)

letters = ['a', 'b']
path = []
subsets(letters, 0, path)
`,
      javascript: `function subsets(items, i, path) {
  if (i === items.length) {
    console.log('{' + path.join(', ') + '}');
    return;
  }
  path.push(items[i]);
  subsets(items, i + 1, path);
  path.pop();
  subsets(items, i + 1, path);
}

const letters = ['a', 'b'];
const path = [];
subsets(letters, 0, path);
`,
      typescript: `function subsets(items: string[], i: number, path: string[]): void {
  if (i === items.length) {
    console.log('{' + path.join(', ') + '}');
    return;
  }
  path.push(items[i]);
  subsets(items, i + 1, path);
  path.pop();
  subsets(items, i + 1, path);
}

const letters: string[] = ['a', 'b'];
const path: string[] = [];
subsets(letters, 0, path);
`,
    },
  },
  {
    id: 'trie-insert-search',
    title: 'Inserting words into a trie and searching for a prefix',
    code: {
      python: `def insert(node, word):
    added = 0
    for ch in word:
        if ch not in node:
            node[ch] = {}
            added += 1
        node = node[ch]
    node['$'] = 1
    return added

def search(node, word):
    for ch in word:
        if ch not in node:
            return 'no'
        node = node[ch]
    if '$' in node:
        return 'yes'
    return 'no'

root = {}
nodes = 1
nodes += insert(root, 'car')
nodes += insert(root, 'cat')
print(nodes)
print(search(root, 'ca'))
`,
      javascript: `function insert(node, word) {
  let added = 0;
  for (const ch of word) {
    if (!(ch in node)) {
      node[ch] = {};
      added += 1;
    }
    node = node[ch];
  }
  node['$'] = 1;
  return added;
}

function search(node, word) {
  for (const ch of word) {
    if (!(ch in node)) {
      return 'no';
    }
    node = node[ch];
  }
  if ('$' in node) {
    return 'yes';
  }
  return 'no';
}

const root = {};
let nodes = 1;
nodes += insert(root, 'car');
nodes += insert(root, 'cat');
console.log(nodes);
console.log(search(root, 'ca'));
`,
      typescript: `type Trie = { [key: string]: Trie | number };

function insert(node: Trie, word: string): number {
  let added = 0;
  for (const ch of word) {
    if (!(ch in node)) {
      node[ch] = {};
      added += 1;
    }
    node = node[ch] as Trie;
  }
  node['$'] = 1;
  return added;
}

function search(node: Trie, word: string): string {
  for (const ch of word) {
    if (!(ch in node)) {
      return 'no';
    }
    node = node[ch] as Trie;
  }
  if ('$' in node) {
    return 'yes';
  }
  return 'no';
}

const root: Trie = {};
let nodes = 1;
nodes += insert(root, 'car');
nodes += insert(root, 'cat');
console.log(nodes);
console.log(search(root, 'ca'));
`,
    },
  },
];

export function getSnippet(id: string): Snippet | undefined {
  return snippets.find((s) => s.id === id);
}
