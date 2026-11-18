import type { TaskInput } from '@/tasks/schema';

// The Python track, unit 3 (Functions): each topic's tasks, in the order its
// strip shows them. The first is the prediction the topic itself asks.

export const PYTHON_FUNCTIONS: TaskInput[] = [
  // ── py-functions ────────────────────────────────────────────
  {
    slug: 'py-call-order',
    kind: 'output',
    title: 'When does the body run?',
    concept: 'py-functions',
    prompt: 'Type exactly what this prints.',
    hints: [
      'The `def` lines only make the function. Its body runs each time something calls it, and not before.',
      'A call runs the whole body, prints and all, then hands back what `return` gives. The line that made the call carries on with that value.',
      '`double` is called twice here: once for `y`, and again inside the last `print`.',
    ],
    vary: { n: ['3', '5', '10'] },
    code: { python: 'def double(x):\n    print("doubling", x)\n    return x * 2\n\ny = double(«n»)\nprint("got", y)\nprint(double(y) + 1)\n' },
  },
  {
    slug: 'py-to-fahrenheit',
    kind: 'function',
    title: 'Celsius to Fahrenheit',
    concept: 'py-functions',
    prompt:
      'Write `to_fahrenheit(c)`, which **returns** the temperature `c` (in degrees Celsius) in degrees Fahrenheit: multiply by 9, divide by 5, then add 32. For example, `to_fahrenheit(100)` returns `212.0`.\n\nReturn the answer; don’t print it.',
    hints: ['The formula is `c * 9 / 5 + 32`.', 'Start the line with `return`, so the caller gets the number back.'],
    starter: { python: 'def to_fahrenheit(c):\n    pass\n' },
    solution: { python: 'def to_fahrenheit(c):\n    return c * 9 / 5 + 32\n' },
    check: { kind: 'function', entry: { python: 'to_fahrenheit' }, calls: [[100], [0], [-40], [37]], compare: 'float' },
  },
  {
    slug: 'py-sum-to',
    kind: 'function',
    title: 'Add up 1 to n',
    concept: 'py-functions',
    prompt: 'Write `sum_to(n)`, which returns 1 + 2 + … + n. For example, `sum_to(4)` returns `10`, and `sum_to(0)` returns `0`.',
    hints: ['Keep a running total inside the function, starting at 0.', 'Loop with `for i in range(1, n + 1):` and add each `i`.', 'Return the total after the loop, not inside it: a `return` inside the loop would end the function on its first turn.'],
    starter: { python: 'def sum_to(n):\n    total = 0\n    return total\n' },
    solution: { python: 'def sum_to(n):\n    total = 0\n    for i in range(1, n + 1):\n        total += i\n    return total\n' },
    check: { kind: 'function', entry: { python: 'sum_to' }, calls: [[4], [1], [0], [100]] },
  },
  {
    slug: 'py-delivery-none',
    kind: 'bug',
    title: 'You pay None',
    concept: 'py-functions',
    prompt: 'This program reads a price and should print what you pay once 3 is added for delivery, as `You pay 13` for a price of 10. Fix it.',
    symptom: 'For a price of 10 it prints 13 on a line of its own, then “You pay None”.',
    explanation:
      'The function prints the new price but never returns it, so the call gives back `None`, and `None` is what `total` points at. A function hands a value back only with `return`; printing it just shows it on the screen.',
    hints: ['What does `with_delivery(price)` give back? Look for a `return` in it.', 'Swap the `print(...)` inside the function for `return ...`.'],
    starter: { python: 'def with_delivery(price):\n    print(price + 3)\n\nprice = int(input())\ntotal = with_delivery(price)\nprint("You pay", total)\n' },
    solution: { python: 'def with_delivery(price):\n    return price + 3\n\nprice = int(input())\ntotal = with_delivery(price)\nprint("You pay", total)\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'A price of 10', stdin: '10\n' },
        { name: 'A price of 0', stdin: '0\n' },
        { name: 'A price of 25', stdin: '25\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-average-function',
    kind: 'fill',
    title: 'The average of three',
    concept: 'py-functions',
    prompt: 'Fill the gaps so `average` gives back the average of its three numbers, and the program prints the average of the three it reads. For 1, 2 and 3 it prints `2.0`.',
    hints: ['The function has to hand its answer back to the line that called it.', 'The average is the total divided by how many numbers there are.', 'The last line calls the function with the three numbers.'],
    solution: { python: 'def average(a, b, c):\n    total = a + b + c\n    «1:return» total «2:/» 3\n\nx = int(input())\ny = int(input())\nz = int(input())\nprint(«3:average»(x, y, z))\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '1, 2 and 3', stdin: '1\n2\n3\n' },
        { name: '4, 4 and 5', stdin: '4\n4\n5\n' },
        { name: 'With a negative number', stdin: '10\n0\n-1\n', hidden: true },
      ],
    },
  },

  // ── py-parameters ───────────────────────────────────────────
  {
    slug: 'py-power-defaults',
    kind: 'output',
    title: 'Defaults and keywords',
    concept: 'py-parameters',
    prompt: 'Type exactly what this prints.',
    hints: [
      'A parameter with a default takes that value when the call leaves it out.',
      'Arguments without names fill the parameters in order; `name=value` fills the parameter with that name, wherever it is in the call.',
    ],
    vary: { b: ['3', '2', '5'] },
    code: { python: 'def power(base, exp=2):\n    return base ** exp\n\nprint(power(«b»))\nprint(power(«b», 3))\nprint(power(exp=1, base=«b»))\n' },
  },
  {
    slug: 'py-greet-default',
    kind: 'function',
    title: 'A greeting with a default',
    concept: 'py-parameters',
    prompt:
      'Write `greet(name, greeting="Hello")`, which returns the greeting, a comma, a space, the name and an exclamation mark. `greet("Ada")` returns `"Hello, Ada!"`, and `greet("Bo", "Hi")` returns `"Hi, Bo!"`.',
    hints: ['Give `greeting` its default in the `def` line: `greeting="Hello"`.', 'An f-string builds it: `f"{greeting}, {name}!"`.'],
    starter: { python: 'def greet(name):\n    pass\n' },
    solution: { python: 'def greet(name, greeting="Hello"):\n    return f"{greeting}, {name}!"\n' },
    check: { kind: 'function', entry: { python: 'greet' }, calls: [['Ada'], ['Bo', 'Hi'], ['Cy', 'Welcome']] },
  },
  {
    slug: 'py-total-args',
    kind: 'function',
    title: 'Add up any number of numbers',
    concept: 'py-parameters',
    prompt: 'Write `total(*numbers)`, which takes any number of numbers and returns their sum. `total(1, 2, 3)` returns `6`, and `total()` returns `0`.',
    hints: ['`*numbers` collects every argument into one group you can loop over with `for`.', 'Start a running total at 0 and add each number to it.'],
    starter: { python: 'def total(numbers):\n    return 0\n' },
    solution: { python: 'def total(*numbers):\n    result = 0\n    for n in numbers:\n        result += n\n    return result\n' },
    check: { kind: 'function', entry: { python: 'total' }, calls: [[1, 2, 3], [], [5], [-1, 1, 10]] },
  },
  {
    slug: 'py-swapped-arguments',
    kind: 'bug',
    title: 'A discount gone wrong',
    concept: 'py-parameters',
    prompt: 'This program reads a price and a percentage off, and should print the price after the discount. For a price of 200 with 10 off, that’s `180`. Fix it.',
    symptom: 'For a price of 200 with 10 off it prints -10.',
    explanation:
      'Arguments without names fill the parameters in order: `price_after(d, p)` makes `price` the discount and `discount` the price. Pass them in the order the `def` lists them, or name them: `price_after(price=p, discount=d)`.',
    hints: ['Compare the order of the parameters in the `def` line with the order of the arguments in the call.', 'Either swap the arguments, or name each one with `=`.'],
    starter: { python: 'def price_after(price, discount):\n    return price - price * discount // 100\n\np = int(input())\nd = int(input())\nprint(price_after(d, p))\n' },
    solution: { python: 'def price_after(price, discount):\n    return price - price * discount // 100\n\np = int(input())\nd = int(input())\nprint(price_after(p, d))\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '200 with 10 off', stdin: '200\n10\n' },
        { name: '50 with 50 off', stdin: '50\n50\n' },
        { name: '99 with nothing off', stdin: '99\n0\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-label-keywords',
    kind: 'fill',
    title: 'Padding a label',
    concept: 'py-parameters',
    prompt:
      'Read a word and a width. `label` pads the word to the width with its `fill` character. Fill the gaps so the first line pads with the default dots and the second with dashes. For `cat` and `6`:\n\n```\ncat...\ncat---\n```',
    hints: ['A keyword argument is the parameter’s name, `=`, then the value.', 'The second call gives `width` by position, so only `fill` needs its name.'],
    solution: { python: 'def label(text, width=10, fill="."):\n    return text + fill * (width - len(text))\n\nword = input()\nn = int(input())\nprint(label(word, «1:width»=n))\nprint(label(word, n, «2:fill»="-"))\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'cat, 6', stdin: 'cat\n6\n' },
        { name: 'hello, 8', stdin: 'hello\n8\n' },
        { name: 'Already as wide', stdin: 'ab\n2\n', hidden: true },
      ],
    },
  },

  // ── py-scope ────────────────────────────────────────────────
  {
    slug: 'py-scope-shadow',
    kind: 'output',
    title: 'Which x?',
    concept: 'py-scope',
    prompt: 'Type exactly what this prints.',
    hints: [
      'An assignment inside a function makes a name local to that call. It leaves a global with the same name alone.',
      'A function that only reads a name, without assigning it, finds the global one.',
    ],
    vary: { a: ['5', '1', '40'] },
    code: { python: 'x = «a»\n\ndef change():\n    x = 99\n    return x\n\ndef show():\n    return x + 1\n\nprint(change())\nprint(x)\nprint(show())\n' },
  },
  {
    slug: 'py-click-counter',
    kind: 'bug',
    title: 'Counting clicks',
    concept: 'py-scope',
    prompt: 'This program reads a number and calls `click()` that many times; each call should add one to `clicks`, and the program prints the count at the end. Fix it.',
    symptom: 'For 3 it stops at line 4 with UnboundLocalError: cannot access local variable \'clicks\' where it is not associated with a value.',
    explanation:
      'Because `click` assigns to `clicks`, Python treats `clicks` as a local name for the whole function. `clicks + 1` then reads that local before anything has set it. `global clicks` at the top of the function says the name means the global one.',
    hints: ['An assignment anywhere in a function makes that name local to it, unless the function says otherwise.', 'Add `global clicks` as the first line of `click`.'],
    starter: { python: 'clicks = 0\n\ndef click():\n    clicks = clicks + 1\n\nn = int(input())\nfor i in range(n):\n    click()\nprint(clicks)\n' },
    solution: { python: 'clicks = 0\n\ndef click():\n    global clicks\n    clicks = clicks + 1\n\nn = int(input())\nfor i in range(n):\n    click()\nprint(clicks)\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '3 clicks', stdin: '3\n' },
        { name: 'No clicks', stdin: '0\n' },
        { name: '7 clicks', stdin: '7\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-make-multiplier',
    kind: 'tests',
    title: 'A function that makes functions',
    concept: 'py-scope',
    prompt:
      'Write `make_multiplier(n)`, which returns a function. The function it returns takes one number and returns it times `n`:\n\n```python\ntriple = make_multiplier(3)\nprint(triple(5))   # 15\n```\n\nEach function made keeps its own `n`.',
    hints: ['Inside `make_multiplier`, define a function `multiply(x)` that returns `x * n`.', 'Return `multiply` itself, without brackets: the function, not a call of it.', '`multiply` can read `n` from `make_multiplier`: it keeps it after `make_multiplier` returns.'],
    starter: { python: 'def make_multiplier(n):\n    def multiply(x):\n        pass\n    return multiply\n' },
    solution: { python: 'def make_multiplier(n):\n    def multiply(x):\n        return x * n\n    return multiply\n' },
    check: {
      kind: 'tests',
      tests: {
        python:
          'def test_triple():\n    assert make_multiplier(3)(5) == 15\n\n\ndef test_double():\n    assert make_multiplier(2)(21) == 42\n\n\ndef test_each_keeps_its_own_n():\n    triple = make_multiplier(3)\n    double = make_multiplier(2)\n    assert triple(4) == 12\n    assert double(4) == 8\n\n\ndef test_zero():\n    assert make_multiplier(0)(9) == 0\n',
      },
    },
  },
  {
    slug: 'py-counter-nonlocal',
    kind: 'bug',
    title: 'A counter that can’t count',
    concept: 'py-scope',
    prompt: '`make_counter()` should return a function that gives 1 the first time it is called, then 2, then 3, and so on; two counters count on their own. Fix it.',
    symptom: 'The first call to a counter stops with UnboundLocalError: cannot access local variable \'count\' where it is not associated with a value.',
    explanation:
      'Assigning `count += 1` inside `tick` makes `count` local to `tick`, so it no longer means the `count` in `make_counter`. `nonlocal count` says it is the enclosing function’s name, which `tick` keeps after `make_counter` returns.',
    hints: ['Which `count` does `tick` mean when it assigns to it?', 'Add `nonlocal count` as the first line of `tick`.'],
    starter: { python: 'def make_counter():\n    count = 0\n    def tick():\n        count += 1\n        return count\n    return tick\n' },
    solution: { python: 'def make_counter():\n    count = 0\n    def tick():\n        nonlocal count\n        count += 1\n        return count\n    return tick\n' },
    check: {
      kind: 'tests',
      tests: {
        python:
          'def test_counts_up():\n    c = make_counter()\n    assert c() == 1\n    assert c() == 2\n    assert c() == 3\n\n\ndef test_two_counters_count_apart():\n    a = make_counter()\n    b = make_counter()\n    a()\n    a()\n    assert b() == 1\n    assert a() == 3\n',
      },
    },
  },
  {
    slug: 'py-where-is-len',
    kind: 'choice',
    title: 'Where does Python find len?',
    concept: 'py-scope',
    prompt:
      'A function uses the name `len`. It doesn’t set `len` itself, isn’t inside another function, and the program never sets `len` at the top level. Where does Python find it?',
    choices: ['Among Python’s built-in names', 'Nowhere: it’s a NameError', 'In whichever function ran last'],
    answer: 0,
    why: 'Python looks for a name in the local names first, then in any enclosing function, then in the global names, and last among the built-ins (L, E, G, B). `len` is a built-in.',
  },

  // ── py-recursion ────────────────────────────────────────────
  {
    slug: 'py-down-and-up',
    kind: 'output',
    title: 'Down, then back up',
    concept: 'py-recursion',
    prompt: 'Type exactly what this prints.',
    hints: [
      'Each call prints its “down” line, then makes the next call, and waits for it to finish before printing its “up” line.',
      'Each call has its own `n`, in its own frame: a call’s `n` doesn’t change while it waits.',
    ],
    vary: { n: ['2', '3', '1'] },
    code: { python: 'def echo(n):\n    if n == 0:\n        return\n    print("down", n)\n    echo(n - 1)\n    print("up", n)\n\necho(«n»)\n' },
  },
  {
    slug: 'py-digit-sum',
    kind: 'function',
    title: 'Add up the digits',
    concept: 'py-recursion',
    prompt:
      'Write `digit_sum(n)`, which returns the sum of the digits of a whole number `n` (0 or more), **by calling itself**. `digit_sum(123)` returns `6`, and `digit_sum(0)` returns `0`. (The check only compares answers, so the recursion is up to you.)\n\nThe last digit is `n % 10`, and `n // 10` is everything before it.',
    hints: ['Base case: a number below 10 is its own digit sum.', 'Otherwise: the last digit plus the digit sum of the rest, `n % 10 + digit_sum(n // 10)`.'],
    starter: { python: 'def digit_sum(n):\n    return n % 10\n' },
    solution: { python: 'def digit_sum(n):\n    if n < 10:\n        return n\n    return n % 10 + digit_sum(n // 10)\n' },
    check: { kind: 'function', entry: { python: 'digit_sum' }, calls: [[123], [0], [7], [9045], [99999]] },
  },
  {
    slug: 'py-power-recursive',
    kind: 'function',
    title: 'Powers by recursion',
    concept: 'py-recursion',
    prompt: 'Write `power(base, exp)`, which returns `base` to the power `exp` (a whole number, 0 or more) **by calling itself**, without `**`. `power(2, 10)` returns `1024`. (The check only compares answers, so the recursion is up to you.)',
    hints: ['Anything to the power 0 is 1: that is the base case.', 'Otherwise `base` to the `exp` is `base` times `base` to the `exp - 1`.'],
    starter: { python: 'def power(base, exp):\n    return base\n' },
    solution: { python: 'def power(base, exp):\n    if exp == 0:\n        return 1\n    return base * power(base, exp - 1)\n' },
    check: { kind: 'function', entry: { python: 'power' }, calls: [[2, 10], [3, 3], [5, 1], [7, 0]] },
  },
  {
    slug: 'py-stars-forever',
    kind: 'bug',
    title: 'Stars that never stop',
    concept: 'py-recursion',
    prompt: 'This program reads a number and should print that many stars on one line, made by a function that calls itself. Fix it.',
    symptom: 'For 3 it stops with RecursionError: maximum recursion depth exceeded.',
    explanation:
      'Each call passes the same `n` on, so the calls never get closer to the base case, `n == 0`. They pile up until Python stops them. The call inside has to make the problem smaller: `stars(n - 1)`.',
    hints: ['Follow the calls with 3: what is `n` in the second call? And the third?', 'The call inside the function needs a smaller number.'],
    starter: { python: 'def stars(n):\n    if n == 0:\n        return ""\n    return "*" + stars(n)\n\nn = int(input())\nprint(stars(n))\n' },
    solution: { python: 'def stars(n):\n    if n == 0:\n        return ""\n    return "*" + stars(n - 1)\n\nn = int(input())\nprint(stars(n))\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '3 stars', stdin: '3\n' },
        { name: '1 star', stdin: '1\n' },
        { name: 'No stars', stdin: '0\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-fill-fib',
    kind: 'fill',
    title: 'Fibonacci, recursively',
    concept: 'py-recursion',
    prompt:
      'In the Fibonacci numbers, 0, 1, 1, 2, 3, 5, 8…, each one after the first two is the sum of the two before it. Fill the gaps so `fib(n)` returns the `n`th (counting from 0), and the program prints it for the number it reads. `fib(7)` is `13`.',
    hints: ['The first two are their own position: `fib(0)` is 0 and `fib(1)` is 1.', 'Every later one adds the two before it: `fib(n - 1)` and `fib(n - 2)`.'],
    solution: { python: 'def fib(n):\n    if n «1:<» 2:\n        return «2:n»\n    return fib(n - 1) «3:+» fib(n - 2)\n\nn = int(input())\nprint(fib(n))\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'The 7th', stdin: '7\n' },
        { name: 'The 0th', stdin: '0\n' },
        { name: 'The 1st', stdin: '1\n' },
        { name: 'The 12th', stdin: '12\n', hidden: true },
      ],
    },
  },

  // ── py-lambdas ──────────────────────────────────────────────
  {
    slug: 'py-lambda-calls',
    kind: 'output',
    title: 'Small functions, passed around',
    concept: 'py-lambdas',
    prompt: 'Type exactly what this prints.',
    hints: [
      '`lambda n: n * n` is a function that gives back its argument times itself.',
      '`twice(f, x)` calls `f` on `x`, then calls `f` again on that answer.',
      '`key=len` makes `min` compare the words by their length, not by the alphabet.',
    ],
    vary: { a: ['3', '2', '5'] },
    code: { python: 'square = lambda n: n * n\ntwice = lambda f, x: f(f(x))\nprint(square(«a»))\nprint(twice(square, «a»))\nprint(min("kiwi", "fig", "apple", key=len))\n' },
  },
  {
    slug: 'py-longest-word',
    kind: 'function',
    title: 'The longest of three',
    concept: 'py-lambdas',
    prompt:
      'Write `longest(a, b, c)`, which returns the longest of its three words; if two are as long, the one that comes first. `longest("fig", "banana", "kiwi")` returns `"banana"`.\n\nThe starter uses `max`, which on its own compares words by the alphabet. Tell it what to compare by.',
    hints: ['`max` takes `key=`: a function it calls on each word, comparing what that gives back.', '`len` is already a function that gives a word’s length: pass it as `key=len`, without brackets.'],
    starter: { python: 'def longest(a, b, c):\n    return max(a, b, c)\n' },
    solution: { python: 'def longest(a, b, c):\n    return max(a, b, c, key=len)\n' },
    check: { kind: 'function', entry: { python: 'longest' }, calls: [['fig', 'banana', 'kiwi'], ['ox', 'cat', 'dog'], ['a', 'bb', 'cc'], ['plum', 'pear', 'fig']] },
  },
  {
    slug: 'py-compose',
    kind: 'tests',
    title: 'One function after another',
    concept: 'py-lambdas',
    prompt:
      'Write `compose(f, g)`, which returns a function that applies `g` first, then `f` to what `g` gave back:\n\n```python\nadd_one = lambda x: x + 1\ndouble = lambda x: x * 2\nboth = compose(add_one, double)\nprint(both(5))   # double, then add 1: 11\n```',
    hints: ['`compose` returns a function, so its body can be one line: `return lambda x: ...`.', 'The inner part runs first: `f(g(x))`.'],
    starter: { python: 'def compose(f, g):\n    pass\n' },
    solution: { python: 'def compose(f, g):\n    return lambda x: f(g(x))\n' },
    check: {
      kind: 'tests',
      tests: {
        python:
          'def test_double_then_add_one():\n    assert compose(lambda x: x + 1, lambda x: x * 2)(5) == 11\n\n\ndef test_order_matters():\n    assert compose(lambda x: x * 2, lambda x: x + 1)(5) == 12\n\n\ndef test_any_functions():\n    assert compose(len, str)(12345) == 5\n',
      },
    },
  },
  {
    slug: 'py-key-lambdas',
    kind: 'fill',
    title: 'Comparing by a key',
    concept: 'py-lambdas',
    prompt:
      'Read three words. Fill the gaps so the program prints the shortest word, then the word whose **last** letter comes latest in the alphabet. For `pear`, `fig` and `banana`:\n\n```\nfig\npear\n```',
    hints: ['`min` and `max` take `key=`: a function to compare by.', 'A lambda with one parameter `w` that gives back `w[-1]` is a function giving a word’s last letter.'],
    solution: { python: 'a = input()\nb = input()\nc = input()\nlast_letter = «1:lambda» w: w[-1]\nprint(min(a, b, c, key=«2:len»))\nprint(max(a, b, c, key=«3:last_letter»))\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'pear, fig, banana', stdin: 'pear\nfig\nbanana\n' },
        { name: 'aa, b, cc', stdin: 'aa\nb\ncc\n' },
        { name: 'zebra, ox, kiwi', stdin: 'zebra\nox\nkiwi\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-make-adder',
    kind: 'parsons',
    title: 'A function that makes adders',
    concept: 'py-lambdas',
    prompt: 'Put the lines in order, and indent them, so the program reads a number and prints it plus 5, using a function made by `make_adder`. One line doesn’t belong.',
    hints: ['`make_adder` returns a lambda that adds `n` to whatever it is given.', 'A lambda gives back its expression on its own: it never says `return`.'],
    solution: { python: 'def make_adder(n):\n    return lambda x: x + n\nadd5 = make_adder(5)\nk = int(input())\nprint(add5(k))\n' },
    distractors: { python: ['return lambda x: return x + n'] },
    check: {
      kind: 'program',
      cases: [
        { name: '1', stdin: '1\n' },
        { name: '10', stdin: '10\n' },
        { name: '-5', stdin: '-5\n' },
      ],
    },
  },
];
