import type { Snippet } from './snippets';

// The Python track's traced snippets (<TraceCode snippet="…" /> in its
// topics, src/content/lessons/py-*.mdx): one per topic, Python only, short
// enough to step through in a minute. snippets.test.ts runs each one.

export const PYTHON_SNIPPETS: Snippet[] = [
  {
    id: 'py-first-program',
    title: 'A first program, run from top to bottom',
    code: {
      python: `# Python runs these lines from top to bottom.
print("Hello!")
print("2 + 3 is", 2 + 3)
print()
# A comment like this one is skipped.
print("Bye", "for", "now")
print("The end")
`,
    },
  },
  {
    id: 'py-variables',
    title: 'Names pointing at values',
    code: {
      python: `apples = 5
pears = 3
total = apples + pears
print(total)
apples = 10
print(apples, total)
total = total + 1
print(total)
`,
    },
  },
  {
    id: 'py-numbers',
    title: 'Whole numbers, floats and three kinds of division',
    code: {
      python: `minutes = 135
hours = minutes // 60
left = minutes % 60
print(hours, "h", left, "min")
share = 10 / 4
print(share)
print(2 ** 10)
print(0.1 + 0.2)
`,
    },
  },
  {
    id: 'py-strings',
    title: 'Joining, measuring and indexing text',
    code: {
      python: `first = "Ada"
last = "Lovelace"
full = first + " " + last
print(full)
print(len(full))
print(full[0], full[-1])
age = 36
print(f"{first} was {age}")
print("=" * 10)
`,
    },
  },
  {
    id: 'py-input',
    title: 'Reading two lines of input',
    stdin: 'Ada\n7\n',
    code: {
      python: `name = input("Name? ")
text = input("Age? ")
age = int(text)
older = age + 1
print(f"Hi {name}!")
print("Next year you will be", older)
`,
    },
  },
  {
    id: 'py-booleans',
    title: 'Comparisons, and, or and not',
    code: {
      python: `age = 15
is_teen = age >= 13 and age <= 19
print(is_teen)
has_ticket = False
can_enter = is_teen or has_ticket
print(can_enter)
print(not has_ticket)
print(3 == "3")
`,
    },
  },
  {
    id: 'py-if',
    title: 'One branch of an if, elif and else',
    code: {
      python: `temp = 18
if temp > 25:
    advice = "shorts"
elif temp > 15:
    advice = "a light jacket"
else:
    advice = "a coat"
print("Wear", advice)
if temp < 0:
    print("Watch out for ice")
print("Have a good day")
`,
    },
  },
  {
    id: 'py-while',
    title: 'Adding up with a while loop',
    code: {
      python: `n = 1
total = 0
while n <= 4:
    total = total + n
    n = n + 1
print("total", total)
print("n ended at", n)
`,
    },
  },
  {
    id: 'py-for-range',
    title: 'Walking through a range and a string',
    code: {
      python: `total = 0
for i in range(1, 5):
    total += i
    print("added", i)
print("total", total)
for ch in "abc":
    print(ch * 2)
`,
    },
  },
  {
    id: 'py-break-continue',
    title: 'Skipping a turn and leaving a loop early',
    code: {
      python: `for n in range(1, 10):
    if n % 2 == 0:
        continue
    if n > 6:
        break
    print(n)
else:
    print("never printed")
print("after the loop")
`,
    },
  },
  {
    id: 'py-nested-loops',
    title: 'A times table from two loops',
    code: {
      python: `for row in range(1, 4):
    line = ""
    for col in range(1, 4):
        line += str(row * col) + " "
    print(line)
print("done")
`,
    },
  },
  {
    id: 'py-functions',
    title: 'Two calls: one returns, one prints',
    code: {
      python: `def square(n):
    result = n * n
    return result

def greet(name):
    print("Hello,", name)

a = square(4)
b = greet("Ada")
print(a, b)
`,
    },
  },
  {
    id: 'py-parameters',
    title: 'Defaults, keyword arguments and *args',
    code: {
      python: `def describe(name, sound="moo", times=1):
    return name + " says " + sound * times

print(describe("cow"))
print(describe("dog", "woof", 2))
print(describe("cat", times=3, sound="mew"))

def total(*numbers):
    result = 0
    for n in numbers:
        result += n
    return result

print(total(4, 5, 6))
`,
    },
  },
  {
    id: 'py-scope',
    title: 'A local name, a global one, and a closure',
    code: {
      python: `total = 100

def spend(amount):
    total = amount * 2
    return total

def make_counter():
    n = 0
    def tick():
        nonlocal n
        n += 1
        return n
    return tick

print(spend(5), total)
c = make_counter()
c()
print(c())
`,
    },
  },
  {
    id: 'py-recursion',
    title: 'A countdown and a factorial, frame by frame',
    code: {
      python: `def countdown(n):
    if n == 0:
        print("Go!")
        return
    print(n)
    countdown(n - 1)

def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

countdown(2)
print(factorial(3))
`,
    },
  },
  {
    id: 'py-lambdas',
    title: 'Functions passed, returned and made with lambda',
    code: {
      python: `def apply_twice(f, x):
    return f(f(x))

def make_adder(n):
    return lambda x: x + n

add3 = make_adder(3)
double = lambda x: x * 2
print(apply_twice(double, 5))
print(apply_twice(add3, 1))
print(max("pear", "fig", "banana", key=len))
`,
    },
  },
  {
    id: 'py-lists',
    title: 'A list changed in place, then sliced',
    code: {
      python: `scores = [70, 85, 60]
scores.append(90)
scores[0] = 75
last = scores.pop()
scores.insert(1, 100)
top = scores[:2]
print(scores, last, top)
print(len(scores), 85 in scores)
`,
    },
  },
  {
    id: 'py-references',
    title: 'Two names for one list, and a copy',
    code: {
      python: `a = [1, 2]
b = a
c = a.copy()
b.append(3)
print(a, c)
print(a == b, a is b)
print(a == c, a is c)
`,
    },
  },
  {
    id: 'py-references-calls',
    title: 'A list passed to a function, and a default list',
    code: {
      python: `def add_bonus(scores):
    scores.append(10)
    scores = [0]
    return scores

mine = [5, 7]
result = add_bonus(mine)
print(mine, result)

def add(item, box=[]):
    box.append(item)
    return box

x = add("pen")
y = add("cup")
print(x, x is y)
`,
    },
  },
  {
    id: 'py-tuples',
    title: 'Packing, unpacking and swapping',
    code: {
      python: `point = (3, 4)
x, y = point
x, y = y, x
print(point, x, y)

def min_max(a, b, c):
    return min(a, b, c), max(a, b, c)

lo, hi = min_max(5, 2, 9)
pair = min_max(1, 1, 0)
print(lo, hi, pair)
`,
    },
  },
];
