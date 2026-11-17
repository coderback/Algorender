'use client';

import { useState } from 'react';
import { TextAreaField } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import type { Language } from '@/workspace/protocol';
import { ReplayConsole } from '@/workspace/ReplayConsole';

type Example = { main: string; helper: [path: string, code: string] };

// A guessing game: input in a loop, seeded random, and a function from another file.
const EXAMPLES: Record<Language, Example> = {
  python: {
    main: `import random
from referee import verdict

secret = random.randint(1, 20)
name = input("Your name? ")
print(f"Hello, {name}. I'm thinking of a number from 1 to 20.")
tries = 0
while True:
    guess = int(input("Guess: "))
    tries += 1
    word = verdict(guess, secret)
    print(word)
    if word == "Got it!":
        break
print(f"{name} took {tries} tries.")
`,
    helper: [
      'referee.py',
      `def verdict(guess, secret):
    if guess < secret:
        return "Too low"
    if guess > secret:
        return "Too high"
    return "Got it!"
`,
    ],
  },
  javascript: {
    main: `const { verdict } = require('./referee');

const secret = 1 + Math.floor(Math.random() * 20);
const name = input('Your name? ');
console.log(\`Hello, \${name}. I'm thinking of a number from 1 to 20.\`);
let tries = 0;
while (true) {
  const guess = Number(input('Guess: '));
  tries += 1;
  const word = verdict(guess, secret);
  console.log(word);
  if (word === 'Got it!') break;
}
console.log(\`\${name} took \${tries} tries.\`);
`,
    helper: [
      'referee.js',
      `exports.verdict = (guess, secret) => {
  if (guess < secret) return 'Too low';
  if (guess > secret) return 'Too high';
  return 'Got it!';
};
`,
    ],
  },
  typescript: {
    main: `import { verdict } from './referee';

const secret: number = 1 + Math.floor(Math.random() * 20);
const name: string = input('Your name? ');
console.log(\`Hello, \${name}. I'm thinking of a number from 1 to 20.\`);
let tries = 0;
while (true) {
  const guess = Number(input('Guess: '));
  tries += 1;
  const word = verdict(guess, secret);
  console.log(word);
  if (word === 'Got it!') break;
}
console.log(\`\${name} took \${tries} tries.\`);
`,
    helper: [
      'referee.ts',
      `export function verdict(guess: number, secret: number): string {
  if (guess < secret) return 'Too low';
  if (guess > secret) return 'Too high';
  return 'Got it!';
}
`,
    ],
  },
};

export function ConsoleSpike() {
  const [language, setLanguage] = useState<Language>('python');
  const [code, setCode] = useState<Record<Language, Example>>(EXAMPLES);
  const example = code[language];
  const edit = (patch: Partial<Example>) => setCode((all) => ({ ...all, [language]: { ...all[language], ...patch } }));
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Language"
        value={language}
        onChange={setLanguage}
        options={[
          { value: 'python', label: 'Python' },
          { value: 'javascript', label: 'JavaScript' },
          { value: 'typescript', label: 'TypeScript' },
        ]}
      />
      <TextAreaField label="Main file" mono rows={14} value={example.main} onChange={(e) => edit({ main: e.target.value })} />
      <TextAreaField
        label={example.helper[0]}
        mono
        rows={7}
        value={example.helper[1]}
        onChange={(e) => edit({ helper: [example.helper[0], e.target.value] })}
      />
      <ReplayConsole key={language} language={language} code={example.main} files={{ [example.helper[0]]: example.helper[1] }} />
    </div>
  );
}
