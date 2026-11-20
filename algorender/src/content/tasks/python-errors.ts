import type { TaskInput } from '@/tasks/schema';

// The Python track, unit 6 (Errors): each topic's tasks, in the order its
// strip shows them. The first is the prediction the topic itself asks.
// (L2's batch 3 wrote handling and raising errors.)

export const PYTHON_ERRORS: TaskInput[] = [
  // ── py-exceptions ───────────────────────────────────────────
  {
    slug: 'py-which-except-runs',
    kind: 'output',
    title: 'Which except runs?',
    concept: 'py-exceptions',
    prompt: 'Type exactly what this prints.',
    hints: [
      'When a line in the `try` block raises, the lines after it in that block are skipped for that item.',
      '`int("x")` raises a `ValueError`; `12 // 0` raises a `ZeroDivisionError`. Each goes to its own `except`.',
      'After an `except` block, the loop simply moves on to the next item.',
    ],
    vary: { a: ['"3"', '"0"', '"x"'], b: ['"x"', '"4"', '"6"'], c: ['"0"', '"y"', '"2"'] },
    code: {
      python:
        'items = [«a», «b», «c»]\ntotal = 0\nfor text in items:\n    try:\n        n = int(text)\n        total = total + 12 // n\n        print("ok", text)\n    except ValueError:\n        print("skip", text)\n    except ZeroDivisionError:\n        print("zero")\nprint(total)\n',
    },
  },
  {
    slug: 'py-hidden-typo',
    kind: 'bug',
    title: 'The error that wasn’t bad input',
    concept: 'py-exceptions',
    prompt:
      'This program reads a whole number and prints its square: for 4, `4 squared is 16`. For anything that isn’t a whole number it should print `Please type a whole number.` Fix it.',
    symptom: 'For 4 it prints “Please type a whole number.”, though 4 is a whole number.',
    explanation:
      'Line 4 misspells `square` as `sqaure`, which raises a `NameError`. The bare `except:` catches every error, that one too, so the program blames the input instead of showing the typo. Fix the name, and catch only `ValueError`, the error bad input to `int()` really raises: then a mistake like this one stops the program with a traceback pointing at its line.',
    hints: [
      'Change `except:` to `except ValueError:` and run it again. What error do you see now, and on which line?',
      'Read the name on line 4 letter by letter.',
    ],
    starter: {
      python: 'try:\n    n = int(input())\n    square = n * n\n    print(n, "squared is", sqaure)\nexcept:\n    print("Please type a whole number.")\n',
    },
    solution: {
      python: 'try:\n    n = int(input())\n    square = n * n\n    print(n, "squared is", square)\nexcept ValueError:\n    print("Please type a whole number.")\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: '4', stdin: '4\n' },
        { name: 'Not a number', stdin: 'four\n' },
        { name: 'A negative number', stdin: '-3\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-parse-numbers',
    kind: 'function',
    title: 'Keep the numbers, skip the rest',
    concept: 'py-exceptions',
    prompt:
      'Write `parse_numbers(texts)`, which takes a list of strings and returns a list of the whole numbers among them, in order, skipping any string `int()` can’t read. `parse_numbers(["4", "x", "10"])` returns `[4, 10]`.\n\nThe starter stops with a `ValueError` at the first string that isn’t a number.',
    hints: [
      'Put the line that might fail, the `append` of `int(text)`, in a `try` block.',
      'Catch only `ValueError`. Its block needs at least one line: `pass` (do nothing) or `continue` will do.',
    ],
    starter: { python: 'def parse_numbers(texts):\n    result = []\n    for text in texts:\n        result.append(int(text))\n    return result\n' },
    solution: {
      python: 'def parse_numbers(texts):\n    result = []\n    for text in texts:\n        try:\n            result.append(int(text))\n        except ValueError:\n            pass\n    return result\n',
    },
    check: { kind: 'function', entry: { python: 'parse_numbers' }, calls: [[['4', 'x', '10']], [[]], [['-2', '3.5', '007']], [['a', 'b']]] },
  },
  {
    slug: 'py-ask-until-number',
    kind: 'fill',
    title: 'Ask until it’s a number',
    concept: 'py-exceptions',
    prompt:
      'Fill the gaps so the program keeps asking `How many?` until the answer is a whole number, printing `That isn\'t a whole number.` after each bad answer, and then prints `You asked for` and the number.',
    hints: [
      'The loop has no condition of its own to stop it: it runs until a `break`.',
      'The `break` belongs straight after the line that might fail, so it is only reached when that line worked.',
      'Which error does `int()` raise for text that isn’t a whole number?',
    ],
    solution: {
      python: 'while «1:True»:\n    try:\n        n = int(input("How many? "))\n        «2:break»\n    except «3:ValueError»:\n        print("That isn\'t a whole number.")\nprint("You asked for", n)\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: 'A word, then a number', stdin: 'lots\n12\n' },
        { name: 'A number first time', stdin: '3\n' },
        { name: 'Two bad answers', stdin: 'two\n2.5\n-4\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-share-sweets',
    kind: 'parsons',
    title: 'Sharing sweets safely',
    concept: 'py-exceptions',
    prompt:
      'Put the lines in order, and indent them, so the program reads a number of sweets and a number of people and prints how many each gets: for 10 and 3, `Each gets 3`. For 0 people it prints `Can\'t share among 0 people` instead. Either way it ends with `Done`. One line doesn’t belong.',
    hints: [
      'Only the division can fail, so it is the one line in the `try` block.',
      'Dividing by zero raises a `ZeroDivisionError`.',
      '`else` runs only when nothing was raised; `finally` runs every time. They go after the `except`, `else` first and `finally` last.',
    ],
    solution: {
      python:
        'sweets = int(input())\npeople = int(input())\ntry:\n    each = sweets // people\nexcept ZeroDivisionError:\n    print("Can\'t share among 0 people")\nelse:\n    print("Each gets", each)\nfinally:\n    print("Done")\n',
    },
    distractors: { python: ['except ValueError:'] },
    check: {
      kind: 'program',
      cases: [
        { name: '10 sweets, 3 people', stdin: '10\n3\n' },
        { name: 'Nobody to share with', stdin: '5\n0\n' },
        { name: 'No sweets', stdin: '0\n4\n' },
      ],
    },
  },

  // ── py-raising ──────────────────────────────────────────────
  {
    slug: 'py-raise-travels',
    kind: 'output',
    title: 'Where does the error go?',
    concept: 'py-raising',
    prompt: 'Type exactly what this prints.',
    hints: [
      '`raise` stops `take` on that line: the `print` and the `return` after it don’t run.',
      'Once the error is raised, the rest of the `try` block is skipped. The `else` part runs only if nothing was raised.',
      '`stock` changes only when a call to `take` finishes and its answer is assigned.',
    ],
    vary: { s: ['4', '7', '2'] },
    code: {
      python:
        'def take(stock, n):\n    if n > stock:\n        raise ValueError(f"only {stock} left")\n    print("took", n)\n    return stock - n\n\nstock = «s»\ntry:\n    stock = take(stock, 3)\n    stock = take(stock, 3)\nexcept ValueError as e:\n    print("refused:", e)\nelse:\n    print("both done")\nprint("stock", stock)\n',
    },
  },
  {
    slug: 'py-parse-age',
    kind: 'tests',
    title: 'Refuse an impossible age',
    concept: 'py-raising',
    prompt:
      'Write `parse_age(text)`, which turns text such as `"42"` into the whole number `42`.\n\nAn age below 0 or above 150 is impossible: raise a `ValueError` whose message includes the age, such as `not a possible age: -3`. Text that isn’t a whole number, such as `"old"`, should raise a `ValueError` too (`int` already does that for you).',
    hints: [
      'Turn the text into a number with `int(text)` first, then check it.',
      '`if age < 0 or age > 150:` then `raise ValueError(f"not a possible age: {age}")`.',
      'Only return the age once it has passed the check.',
    ],
    starter: { python: 'def parse_age(text):\n    return int(text)\n' },
    solution: {
      python: 'def parse_age(text):\n    age = int(text)\n    if age < 0 or age > 150:\n        raise ValueError(f"not a possible age: {age}")\n    return age\n',
    },
    check: {
      kind: 'tests',
      tests: {
        python:
          'def test_a_good_age():\n    assert parse_age("42") == 42\n\n\ndef test_the_edges():\n    assert parse_age("0") == 0\n    assert parse_age("150") == 150\n\n\ndef test_refuses_a_negative_age():\n    with raises(ValueError) as r:\n        parse_age("-3")\n    assert "-3" in str(r.value)\n\n\ndef test_refuses_a_huge_age():\n    with raises(ValueError) as r:\n        parse_age("200")\n    assert "200" in str(r.value)\n\n\ndef test_refuses_text_that_is_not_a_number():\n    with raises(ValueError):\n        parse_age("old")\n',
      },
    },
  },
  {
    slug: 'py-not-enough-stock',
    kind: 'fill',
    title: 'An error of your own',
    concept: 'py-raising',
    prompt:
      'Fill the gaps. The program makes its own kind of error, `NotEnoughStock`, reads how many items are in stock and how many are wanted, and takes them, unless there aren’t enough. For 3 in stock and 4 wanted it prints:\n\n```\nsorry, only 3 left\nstock 3\n```',
    hints: [
      'The new kind of error is made from `Exception`.',
      'To start an error on purpose, `raise` it. The `except` names the kind of error it catches.',
      'When there are enough, `take` gives back what is left.',
    ],
    solution: {
      python:
        'class NotEnoughStock(«1:Exception»):\n    pass\n\ndef take(stock, n):\n    if n > stock:\n        «2:raise» NotEnoughStock(f"only {stock} left")\n    return «3:stock - n»\n\nstock = int(input())\nn = int(input())\ntry:\n    stock = take(stock, n)\nexcept «4:NotEnoughStock» as e:\n    print("sorry,", e)\nprint("stock", stock)\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: '3 in stock, 4 wanted', stdin: '3\n4\n' },
        { name: '5 in stock, 2 wanted', stdin: '5\n2\n' },
        { name: 'None left', stdin: '0\n1\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-withdraw-refuse',
    kind: 'bug',
    title: 'A refusal that doesn’t stop anything',
    concept: 'py-raising',
    prompt:
      '`withdraw(balance, amount)` should refuse to take more than the balance. The program reads an amount, takes it from a balance of 20, and prints the new balance, or why it was refused. For 50 it should print:\n\n```\nrefused: only 20 left\n```\n\nFix it.',
    symptom: 'For 50 it prints new balance: only 20 left, instead of refusing.',
    explanation:
      '`return ValueError(…)` doesn’t start an error: it makes an error object and hands it back as the answer, like any other value. So the `try` sees no error, `balance` points at the error object, and `print` shows its message. `raise ValueError(…)` stops the function and sends the error up to the `except`.',
    hints: ['Does the `except` ever run? What does `withdraw` hand back for 50?', 'Handing an error back and starting one are different words.'],
    starter: {
      python:
        'def withdraw(balance, amount):\n    if amount > balance:\n        return ValueError(f"only {balance} left")\n    return balance - amount\n\namount = int(input())\ntry:\n    balance = withdraw(20, amount)\n    print("new balance:", balance)\nexcept ValueError as e:\n    print("refused:", e)\n',
    },
    solution: {
      python:
        'def withdraw(balance, amount):\n    if amount > balance:\n        raise ValueError(f"only {balance} left")\n    return balance - amount\n\namount = int(input())\ntry:\n    balance = withdraw(20, amount)\n    print("new balance:", balance)\nexcept ValueError as e:\n    print("refused:", e)\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: '50, too much', stdin: '50\n' },
        { name: '5', stdin: '5\n' },
        { name: 'All 20', stdin: '20\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-reraise-count',
    kind: 'parsons',
    title: 'Note it, then pass it on',
    concept: 'py-raising',
    prompt:
      'Put the lines in order, and indent them. `to_count(text)` turns text into a whole number; when it can’t, it prints a note and sends the same error on up. The program reads a line and prints the count, or 0 when the line isn’t a whole number: for `ten`, `bad count: ten` and then `count 0`. One line doesn’t belong.',
    hints: [
      'Inside `to_count`, the `except` prints the note and then re-raises with a bare `raise`.',
      'The caller catches the re-raised error with its own `try` and uses 0 instead.',
    ],
    solution: {
      python:
        'def to_count(text):\n    try:\n        return int(text)\n    except ValueError:\n        print("bad count:", text)\n        raise\ntext = input()\ntry:\n    count = to_count(text)\nexcept ValueError:\n    count = 0\nprint("count", count)\n',
    },
    distractors: { python: ['return ValueError(text)'] },
    check: {
      kind: 'program',
      cases: [
        { name: 'A number', stdin: '12\n' },
        { name: 'A word', stdin: 'ten\n' },
        { name: 'Not a whole number', stdin: '2.5\n' },
      ],
    },
  },
  {
    slug: 'py-pick-error-type',
    kind: 'choice',
    title: 'Which error fits?',
    concept: 'py-raising',
    prompt:
      '`repeat(word, times)` gives back `word` repeated `times` times. Someone calls `repeat("ha", "3")`: `times` is the text `"3"`, not a number. Which error should `repeat` raise to refuse it?',
    choices: ['ValueError', 'TypeError', 'AssertionError'],
    answer: 1,
    why: 'Text where a number belongs is the wrong kind of value altogether: a `TypeError`. `ValueError` is for the right kind with a value that won’t do, such as `repeat("ha", -2)`. `AssertionError` is for your own mistakes, not a caller’s.',
  },
];
