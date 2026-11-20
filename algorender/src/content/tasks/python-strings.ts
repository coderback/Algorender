import type { TaskInput } from '@/tasks/schema';

// The Python track, unit 5 (Strings): each topic's tasks, in the order its
// strip shows them. The first is the prediction the topic itself asks.
// (L2's batch 3 wrote string methods, formatting and regular expressions.)

export const PYTHON_STRINGS: TaskInput[] = [
  // ── py-string-methods ───────────────────────────────────────
  {
    slug: 'py-upper-split-join',
    kind: 'output',
    title: 'New strings, split and joined',
    concept: 'py-string-methods',
    prompt: 'Type exactly what this prints.',
    hints: [
      'A string method never changes the string it’s called on: line 2 makes a new string and throws it away.',
      'In a chain, each method works on what the one before gave back. `find` gives the index where the text first starts.',
      '`split(",")` cuts at exactly each comma and keeps everything between, spaces and empty pieces included.',
    ],
    vary: { w: ['tea', 'moon', 'kiwi'], x: ['E', 'N', 'K'], line: ['a,b,,c', '1, 2,3', 'x,y'] },
    code: {
      python:
        'word = "«w»"\nword.upper()\nprint(word)\nloud = word.upper().replace("«x»", "*")\nprint(loud, loud.find("*"))\nparts = "«line»".split(",")\nprint(len(parts), "|".join(parts))\n',
    },
  },
  {
    slug: 'py-make-slug',
    kind: 'fill',
    title: 'A title as a web address',
    concept: 'py-string-methods',
    prompt:
      'A web address often ends with a page’s title in small letters, its words joined by dashes. Fill the gaps so the program reads a title, however it’s spaced, and prints it that way. For `  Hello   World ` it prints `hello-world`.',
    hints: [
      'Make the letters small first, then cut the title into words.',
      'Which `split` ignores extra spaces and never gives empty pieces?',
      'In `join`, the separator is the string the method is called on.',
    ],
    solution: { python: 'title = input()\nwords = title.«1:lower()».«2:split()»\nslug = «3:"-"».join(words)\nprint(slug)\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'Extra spaces', stdin: '  Hello   World \n' },
        { name: 'One word', stdin: 'Python\n' },
        { name: 'Four words', stdin: 'The Quick  Brown Fox\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-name-initials',
    kind: 'function',
    title: 'Initials of a whole name',
    concept: 'py-string-methods',
    prompt:
      'Write `initials(name)`, which returns the first letter of each word in `name`, in capitals, joined with nothing between. `initials("ada lovelace")` returns `"AL"`. Names may have extra spaces anywhere.',
    hints: [
      '`name.split()` gives the words, without empty pieces even when there are extra spaces.',
      'A word’s first letter is `word[0]`, and `.upper()` gives it back in capitals.',
      'Collect the letters in a list, then `"".join(letters)`.',
    ],
    starter: { python: 'def initials(name):\n    letters = []\n    return "".join(letters)\n' },
    solution: {
      python: 'def initials(name):\n    letters = []\n    for word in name.split():\n        letters.append(word[0].upper())\n    return "".join(letters)\n',
    },
    check: { kind: 'function', entry: { python: 'initials' }, calls: [['ada lovelace'], ['  grace   brewster hopper '], ['Alan'], ['x y z']] },
  },
  {
    slug: 'py-tidy-answer',
    kind: 'bug',
    title: 'Yes means yes',
    concept: 'py-string-methods',
    prompt:
      'The program reads an answer and should print `Booked` when it’s yes, however it’s typed: `yes`, `YES` or `  Yes ` with spaces round it. Anything else prints `Not booked`. Fix it.',
    symptom: 'For Yes typed with spaces round it, it prints Not booked.',
    explanation:
      'Strings never change. `answer.strip().lower()` makes a new, tidied string, but nothing keeps it, so `answer` is still what was typed, spaces and capitals included. Point the name at the result: `answer = answer.strip().lower()`.',
    hints: ['After line 2 runs, what is `answer`?', 'A string method gives back a new string. Keep it by pointing a name at it.'],
    starter: { python: 'answer = input()\nanswer.strip().lower()\nif answer == "yes":\n    print("Booked")\nelse:\n    print("Not booked")\n' },
    solution: { python: 'answer = input()\nanswer = answer.strip().lower()\nif answer == "yes":\n    print("Booked")\nelse:\n    print("Not booked")\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'Yes with spaces round it', stdin: '  Yes \n' },
        { name: 'no', stdin: 'no\n' },
        { name: 'YES in capitals', stdin: 'YES\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-count-starting',
    kind: 'parsons',
    title: 'Words that start with a letter',
    concept: 'py-string-methods',
    prompt:
      'Put the lines in order, and indent them, so the program reads a sentence and then a letter, and prints how many words start with that letter, capitals or not: for `Peter Piper picked a peck` and `p`, `4`. One line doesn’t belong.',
    hints: ['Make the sentence small letters, and keep the result, before splitting it into words.', '`word.startswith(letter)` is True when the word begins with the letter.'],
    solution: {
      python:
        'sentence = input()\nsentence = sentence.lower()\nletter = input().lower()\ncount = 0\nfor word in sentence.split():\n    if word.startswith(letter):\n        count = count + 1\nprint(count)\n',
    },
    distractors: { python: ['sentence.lower()'] },
    check: {
      kind: 'program',
      cases: [
        { name: 'Peter Piper and p', stdin: 'Peter Piper picked a peck\np\n' },
        { name: 'No words match', stdin: 'the cat sat\nz\n' },
        { name: 'A capital letter', stdin: 'Apples and avocados\nA\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-email-domain',
    kind: 'function',
    title: 'After the @',
    concept: 'py-string-methods',
    prompt:
      'Write `domain(email)`, which returns the part of `email` after its first `@`: `domain("ada@example.com")` returns `"example.com"`. If there is no `@`, return the empty string `""` instead of stopping with an error.',
    hints: [
      '`email.find("@")` gives the index of the first `@`, or `-1` when there isn’t one.',
      'Check for `-1` before slicing.',
      'The part after index `at` is the slice `email[at + 1:]`.',
    ],
    starter: { python: 'def domain(email):\n    at = email.index("@")\n    return email[at + 1:]\n' },
    solution: { python: 'def domain(email):\n    at = email.find("@")\n    if at == -1:\n        return ""\n    return email[at + 1:]\n' },
    check: { kind: 'function', entry: { python: 'domain' }, calls: [['ada@example.com'], ['no-at-sign'], ['@start'], ['a@b@c'], ['end@']] },
  },

  // ── py-formatting ───────────────────────────────────────────
  {
    slug: 'py-format-a-line',
    kind: 'output',
    title: 'Widths, decimals and commas',
    concept: 'py-formatting',
    prompt: 'Type exactly what this prints, spaces and all.',
    hints: [
      'A width is the least room a value takes. With no arrow, text sits on the left of it and numbers on the right.',
      '`.2f` shows exactly 2 decimal places, rounding the digits it drops; `,` puts commas between thousands.',
      'Formatting builds new text. The variable still holds its full value.',
    ],
    vary: { n: ['tea', 'jam', 'pens'], p: ['2.5', '1.999', '0.75'], q: ['600', '3', '40'] },
    code: {
      python:
        'item = "«n»"\nprice = «p»\nqty = «q»\ntotal = price * qty\nprint(f"[{item:6}][{qty:4}]")\nprint(f"[{price:7.2f}]")\nprint(f"Total: {total:,.2f}")\nprint(price)\n',
    },
  },
  {
    slug: 'py-money-format',
    kind: 'function',
    title: 'Pounds and pence',
    concept: 'py-formatting',
    prompt:
      'Write `money(amount)`, which returns the amount as text for a price tag: a pound sign, commas between thousands and exactly 2 decimal places. `money(1234.5)` returns `"£1,234.50"`, and `money(7)` returns `"£7.00"`.',
    hints: ['An f-string can do it all: the `£` is plain text before the curly brackets.', 'The spec puts the comma before the decimals: `{amount:,.2f}`.'],
    starter: { python: 'def money(amount):\n    return f"£{amount}"\n' },
    solution: { python: 'def money(amount):\n    return f"£{amount:,.2f}"\n' },
    check: { kind: 'function', entry: { python: 'money' }, calls: [[1234.5], [7], [0.5], [1000000], [19.999]] },
  },
  {
    slug: 'py-receipt-table',
    kind: 'program',
    title: 'A receipt that lines up',
    concept: 'py-formatting',
    prompt:
      'The first line of input is how many items there are. Each line after it is an item’s name and price, split by a space, like `tea 2.5`. Print a receipt: each item’s name on the left of 12 characters and its price on the right of 8, with 2 decimals; then a line of 20 dashes; then `Total` and the sum, laid out the same way. For three items:\n\n```\ntea             2.50\nbiscuits       12.75\njam             3.00\n--------------------\nTotal          18.25\n```',
    hints: [
      '`name, price = input().split()` gives two strings; turn the price into a number with `float`.',
      'Each row is `f"{name:<12}{price:>8.2f}"`. The `<` and `>` are what Python would do anyway, but they make the layout plain to read.',
      'Add each price to a running total as you go, and format the total as you print it, not before.',
    ],
    starter: { python: 'n = int(input())\ntotal = 0\nfor i in range(n):\n    name, price = input().split()\n    price = float(price)\n    total = total + price\n    print(name, price)\nprint(total)\n' },
    solution: {
      python:
        'n = int(input())\ntotal = 0\nfor i in range(n):\n    name, price = input().split()\n    price = float(price)\n    total = total + price\n    print(f"{name:<12}{price:>8.2f}")\nprint("-" * 20)\nprint(f"{\'Total\':<12}{total:>8.2f}")\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: 'Three items', stdin: '3\ntea 2.5\nbiscuits 12.75\njam 3\n' },
        { name: 'One item', stdin: '1\nbread 1.1\n' },
        { name: 'A big price', stdin: '4\npens 0.99\nnotebook 4.5\nstapler 12\nink 1234.5\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-percent-score',
    kind: 'bug',
    title: 'A percentage a hundred times too big',
    concept: 'py-formatting',
    prompt: 'This program reads a score and the most it could have been, and should print the score as a percentage with 1 decimal place: for 8 out of 10, `Score: 80.0%`. Fix it.',
    symptom: 'For 8 out of 10 it prints Score: 8000.0%.',
    explanation:
      'The `%` format spec multiplies by 100 itself before it shows the number, so it wants the fraction, `score / total`, which is 0.8. Multiplying by 100 first does it twice. Drop the `* 100`.',
    hints: ['What does `f"{0.8:.1%}"` show?', 'The `%` spec already multiplies by 100. Give it the fraction.'],
    starter: { python: 'score = int(input())\ntotal = int(input())\nprint(f"Score: {score / total * 100:.1%}")\n' },
    solution: { python: 'score = int(input())\ntotal = int(input())\nprint(f"Score: {score / total:.1%}")\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '8 out of 10', stdin: '8\n10\n' },
        { name: '1 out of 3', stdin: '1\n3\n' },
        { name: '7 out of 8', stdin: '7\n8\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-clock-digits',
    kind: 'fill',
    title: 'A digital clock',
    concept: 'py-formatting',
    prompt:
      'Fill the gaps so the program reads a number of minutes after midnight and prints the time as a clock does, with two digits for the hours and two for the minutes: for 125, `02:05`.',
    hints: ['`//` gives the whole hours and `%` the minutes left over.', 'A `0` before the width pads with zeros instead of spaces: `{5:02}` is `05`.'],
    solution: { python: 'total = int(input())\nhours = total «1:// 60»\nmins = total «2:% 60»\nprint(f"{hours:«3:02»}:{mins:«4:02»}")\n' },
    check: {
      kind: 'program',
      cases: [
        { name: '125 minutes', stdin: '125\n' },
        { name: 'Ten o’clock', stdin: '600\n' },
        { name: 'Midnight', stdin: '0\n' },
        { name: '59 minutes', stdin: '59\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-times-table-grid',
    kind: 'parsons',
    title: 'A times table in columns',
    concept: 'py-formatting',
    prompt:
      'Put the lines in order, and indent them, so the program reads `n` and prints an `n` by `n` times table, each number on the right of 4 characters so the columns line up. For 3:\n\n```\n   1   2   3\n   2   4   6\n   3   6   9\n```\n\nOne line doesn’t belong.',
    hints: ['Build each row as a string, adding one formatted number at a time, then print it.', 'With no arrow, a number sits on the right of its width, which lines up the last digits.'],
    solution: { python: 'n = int(input())\nfor i in range(1, n + 1):\n    line = ""\n    for j in range(1, n + 1):\n        line = line + f"{i * j:4}"\n    print(line)\n' },
    distractors: { python: ['line = line + f"{i * j:<4}"'] },
    check: {
      kind: 'program',
      cases: [
        { name: '4 by 4', stdin: '4\n' },
        { name: '1 by 1', stdin: '1\n' },
        { name: '10 by 10', stdin: '10\n', hidden: true },
      ],
    },
  },

  // ── py-regex ────────────────────────────────────────────────
  {
    slug: 'py-regex-digit-runs',
    kind: 'output',
    title: 'Runs of digits',
    concept: 'py-regex',
    prompt: 'Type exactly what this prints.',
    hints: [
      '`\\d+` is one or more digits in a row, so a number such as 640 is one match, not three.',
      '`\\d` on its own is a single digit, and `re.search` stops at the first one it finds.',
      '`re.sub` builds a new string. It never changes `text`.',
    ],
    vary: { t: ['Room 101, 2 doors', '7 days, 52 weeks', 'Flat 12B, floor 3'] },
    code: {
      python:
        'import re\n\ntext = "«t»"\nnums = re.findall(r"\\d+", text)\nprint(nums)\nfirst = re.search(r"\\d", text)\nprint(first.group())\nprint(re.sub(r"\\d+", "N", text))\nprint(text)\n',
    },
  },
  {
    slug: 'py-regex-hashtags',
    kind: 'function',
    title: 'Find the hashtags',
    concept: 'py-regex',
    prompt:
      'Write `find_hashtags(text)`, which returns a list of the hashtags in `text`, in order, without their `#`. A hashtag is a `#` followed by one or more letters, digits or underscores:\n\n```python\nfind_hashtags("Loving the #sun and #sea")   # [\'sun\', \'sea\']\nfind_hashtags("no tags here")               # []\n```',
    hints: [
      '`re.findall` gives back a list of every match, as strings.',
      '`\\w+` is one or more letters, digits or underscores.',
      'Put the part you want back in a group, `#(\\w+)`: with one group, `findall` lists just the groups.',
    ],
    starter: { python: 'import re\n\ndef find_hashtags(text):\n    return []\n' },
    solution: { python: 'import re\n\ndef find_hashtags(text):\n    return re.findall(r"#(\\w+)", text)\n' },
    check: {
      kind: 'function',
      entry: { python: 'find_hashtags' },
      calls: [['Loving the #sun and #sea'], ['no tags here'], ['#one#two'], ['#2026 plans for #new_year!'], ['# not a tag, but #this is']],
    },
  },
  {
    slug: 'py-regex-ticket-code',
    kind: 'bug',
    title: 'A code that’s too long',
    concept: 'py-regex',
    prompt:
      'A ticket code is two capital letters and then four digits, and nothing else: `AB1234`. The program reads a code and should print `valid` or `invalid`. For `AB12345` it should print `invalid`. Fix it.',
    symptom: 'For AB12345 it prints valid, though the code has five digits.',
    explanation:
      '`re.search` looks for the pattern anywhere in the text, and `AB1234` sits inside `AB12345`, so it finds a match. The rest of the text can be anything. To check that the whole code has the shape, use `re.fullmatch`, which only matches when the pattern covers the text from its first character to its last.',
    hints: ['Does `re.search` care what comes before or after the part that fits?', 'Which `re` function only matches when the whole text fits?'],
    starter: { python: 'import re\n\ncode = input()\nif re.search(r"[A-Z]{2}\\d{4}", code):\n    print("valid")\nelse:\n    print("invalid")\n' },
    solution: { python: 'import re\n\ncode = input()\nif re.fullmatch(r"[A-Z]{2}\\d{4}", code):\n    print("valid")\nelse:\n    print("invalid")\n' },
    check: {
      kind: 'program',
      cases: [
        { name: 'Five digits', stdin: 'AB12345\n' },
        { name: 'A good code', stdin: 'AB1234\n' },
        { name: 'Something in front', stdin: 'xAB1234\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-regex-capital-words',
    kind: 'parsons',
    title: 'Names with capitals',
    concept: 'py-regex',
    prompt:
      'Put the lines in order, and indent them, so the program reads a line and prints each word that starts with a capital letter followed by small letters, one per line, then how many there were: for `Ada met Alan in London`, the three names and then `3 names`. One line doesn’t belong.',
    hints: ['`[A-Z][a-z]+` is one capital letter followed by one or more small letters.', 'You want every match, as a list you can loop over and count.'],
    solution: {
      python: 'import re\ntext = input()\nnames = re.findall(r"[A-Z][a-z]+", text)\nfor name in names:\n    print(name)\nprint(len(names), "names")\n',
    },
    distractors: { python: ['names = re.search(r"[A-Z][a-z]+", text)'] },
    check: {
      kind: 'program',
      cases: [
        { name: 'Three names', stdin: 'Ada met Alan in London\n' },
        { name: 'No capitals', stdin: 'no capitals here\n' },
        { name: 'Cities', stdin: 'Paris, Rome and Oslo\n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-regex-digits-spaces',
    kind: 'fill',
    title: 'Digits and spaces',
    concept: 'py-regex',
    prompt:
      'Fill the gaps so the program reads a line and prints two things: first just its digits, run together, then the line with every run of spaces squeezed down to one space. For `Call  0161 496   0000` it prints `01614960000` and then `Call 0161 496 0000`.',
    hints: [
      '`re.findall` lists every match; `"".join(...)` runs a list of strings together.',
      '`\\d` is one digit, `\\s` one space (or tab), and `+` after a piece means one or more of it.',
      '`re.sub` gives back a new string with every match replaced.',
    ],
    solution: {
      python: 'import re\ntext = input()\ndigits = re.«1:findall»(r"«2:\\d»", text)\nprint("".join(digits))\ntidy = re.«3:sub»(r"«4:\\s+»", " ", text)\nprint(tidy)\n',
    },
    check: {
      kind: 'program',
      cases: [
        { name: 'A phone number', stdin: 'Call  0161 496   0000\n' },
        { name: 'No digits', stdin: 'no digits\n' },
        { name: 'Spaced-out digits', stdin: '  1 2  3 \n', hidden: true },
      ],
    },
  },
  {
    slug: 'py-regex-or-method',
    kind: 'choice',
    title: 'Regex or method?',
    concept: 'py-regex',
    prompt: 'You want to swap every `-` in a date such as `2026-11-20` for a `/`. Which is clearest?',
    choices: ['re.sub(r"-", "/", date)', 'date.replace("-", "/")', 're.findall(r"-", date)'],
    answer: 1,
    why: 'The text to swap is fixed, a single dash, so the string method says it plainly. `re.sub` gives the same answer, but a pattern is harder to read and earns its place only when the text has a shape rather than a fixed spelling. `re.findall` just lists the dashes.',
  },
];
