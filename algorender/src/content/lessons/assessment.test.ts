import { describe, expect, it } from 'vitest';
import { CARD_ID } from '@/progress/events';
import { misconceptionCard } from '@/progress/misconceptions';
import { lessonMisconceptions, lessonPrompts, misconceptionsIn, promptsIn, tagsIn } from './assessment';
import { lessons } from './index';
import { lessonQuizzes } from './quizzes';

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const words = (s: string) => s.trim().split(/\s+/).length;

describe('reading assessment tags from MDX', () => {
  it('reads string and literal attributes, children, and self-closing tags', () => {
    const source = [
      '<Misconception id="a" title="x > y, really" probes={[{ q: "Is } a brace?", choices: ["yes", "no"], answer: 0, trap: 1, why: "It is > that." }]}>',
      '',
      'The **correction**.',
      '',
      '</Misconception>',
      '<ExplainBack id="p" prompt="Why?" rubric={[\'one\', `two`]} example="Because." />',
    ].join('\n');
    const tags = tagsIn(source, 'Misconception', 't');
    expect(tags).toHaveLength(1);
    expect(tags[0].attrs).toMatchObject({ id: 'a', title: 'x > y, really' });
    expect(tags[0].children).toBe('The **correction**.');
    const [m] = misconceptionsIn('t', source);
    expect(m.probes).toEqual([{ q: 'Is } a brace?', choices: ['yes', 'no'], answer: 0, trap: 1, why: 'It is > that.' }]);
    expect(promptsIn('t', source)).toEqual([{ lesson: 't', id: 'p', prompt: 'Why?', rubric: ['one', 'two'], example: 'Because.' }]);
  });

  it('rejects attributes that are not literals', () => {
    expect(() => tagsIn('<ExplainBack id="p" rubric={points} />', 'ExplainBack', 't')).toThrow(/literal/);
  });
});

describe('common mistakes in lessons', () => {
  const quizzes = lessonQuizzes();

  it('names every mistake with a unique id and a title, and corrects it', () => {
    for (const l of lessons) {
      const mine = lessonMisconceptions().filter((m) => m.lesson === l.slug);
      expect(new Set(mine.map((m) => m.id)).size, l.slug).toBe(mine.length);
      for (const m of mine) {
        expect(m.id, `${l.slug}: ${m.id}`).toMatch(SLUG);
        expect(misconceptionCard(m.lesson, m.id)).toMatch(CARD_ID);
        expect(m.correction.length, `${l.slug}: ${m.id} has no correction`).toBeGreaterThan(20);
      }
    }
  });

  it('gives every mistake at least two well-formed probe questions', () => {
    for (const m of lessonMisconceptions()) {
      const where = `${m.lesson}: ${m.id}`;
      expect(m.probes.length, where).toBeGreaterThanOrEqual(2);
      for (const p of m.probes) {
        expect(p.q.trim(), where).not.toBe('');
        expect(p.why.trim(), where).not.toBe('');
        expect(p.choices.length, where).toBeGreaterThanOrEqual(2);
        expect(new Set(p.choices).size, `${where}: repeated choices`).toBe(p.choices.length);
        expect(Number.isInteger(p.answer) && p.answer >= 0 && p.answer < p.choices.length, `${where}: answer out of range`).toBe(true);
        expect(Number.isInteger(p.trap) && p.trap >= 0 && p.trap < p.choices.length, `${where}: trap out of range`).toBe(true);
        expect(p.trap, `${where}: the trap is the right answer`).not.toBe(p.answer);
      }
    }
  });

  it('only sets quiz traps on wrong choices that name a mistake in the same lesson', () => {
    for (const { lesson, quiz, questions } of quizzes) {
      const ids = new Set(lessonMisconceptions().filter((m) => m.lesson === lesson).map((m) => m.id));
      questions.forEach((q, i) => {
        for (const [choice, id] of Object.entries(q.traps ?? {})) {
          const where = `${lesson}/${quiz} question ${i + 1}`;
          expect(ids.has(id), `${where}: no <Misconception id="${id}">`).toBe(true);
          expect(Number(choice) >= 0 && Number(choice) < q.choices.length, `${where}: trap choice out of range`).toBe(true);
          expect(Number(choice), `${where}: the trap is the right answer`).not.toBe(q.answer);
        }
      });
    }
  });

  it('can detect every mistake: a quiz question in its lesson traps it', () => {
    for (const m of lessonMisconceptions()) {
      const trapped = quizzes.some((z) => z.lesson === m.lesson && z.questions.some((q) => Object.values(q.traps ?? {}).includes(m.id)));
      expect(trapped, `${m.lesson}: no quiz question traps "${m.id}"`).toBe(true);
    }
  });

  it('names at least one mistake in every lesson', () => {
    for (const l of lessons) expect(lessonMisconceptions().some((m) => m.lesson === l.slug), l.slug).toBe(true);
  });
});

describe('explain-it-back prompts', () => {
  it('asks every lesson to be explained back, with a rubric and an example answer', () => {
    for (const l of lessons) {
      const mine = lessonPrompts().filter((p) => p.lesson === l.slug);
      expect(mine.length, `${l.slug} has no <ExplainBack>`).toBeGreaterThanOrEqual(1);
      expect(new Set(mine.map((p) => p.id)).size, l.slug).toBe(mine.length);
      for (const p of mine) {
        const where = `${l.slug}: ${p.id}`;
        expect(p.id, where).toMatch(SLUG);
        expect(p.rubric.length, `${where}: 3 to 5 rubric points`).toBeGreaterThanOrEqual(3);
        expect(p.rubric.length, `${where}: 3 to 5 rubric points`).toBeLessThanOrEqual(5);
        for (const r of p.rubric) expect(words(r), `${where}: a rubric point is one checkable claim`).toBeLessThanOrEqual(30);
        expect(words(p.example), `${where}: the example answer is a short paragraph`).toBeGreaterThanOrEqual(30);
        expect(words(p.example), `${where}: the example answer is a short paragraph`).toBeLessThanOrEqual(150);
      }
    }
  });
});
