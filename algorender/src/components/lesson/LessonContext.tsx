'use client';

import { createContext, useContext, type ReactNode } from 'react';

type Lesson = { slug: string; mistakes: Record<string, string> };

const LessonContext = createContext<Lesson>({ slug: '', mistakes: {} });

/**
 * Lets lesson widgets record progress under the lesson they appear in, and
 * name its common mistakes (`<Misconception>` id → title) when a quiz answer
 * comes from one.
 */
export function LessonProvider({ slug, mistakes = {}, children }: { slug: string; mistakes?: Record<string, string>; children: ReactNode }) {
  return <LessonContext.Provider value={{ slug, mistakes }}>{children}</LessonContext.Provider>;
}

export const useLessonSlug = () => useContext(LessonContext).slug;
export const useLessonMistakes = () => useContext(LessonContext).mistakes;
