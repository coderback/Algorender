'use client';

import { createContext, useContext, type ReactNode } from 'react';

const LessonContext = createContext<string>('');

/** Lets lesson widgets record progress under the lesson they appear in. */
export function LessonProvider({ slug, children }: { slug: string; children: ReactNode }) {
  return <LessonContext.Provider value={slug}>{children}</LessonContext.Provider>;
}

export const useLessonSlug = () => useContext(LessonContext);
