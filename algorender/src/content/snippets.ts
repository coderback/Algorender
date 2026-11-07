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
];

export function getSnippet(id: string): Snippet | undefined {
  return snippets.find((s) => s.id === id);
}
