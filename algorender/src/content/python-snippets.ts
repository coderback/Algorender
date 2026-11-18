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
];
