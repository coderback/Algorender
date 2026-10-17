import { getLesson, lessons } from '@/content/lessons';
import { OG_SIZE, ogCard } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'An Algorender lesson';

export function generateStaticParams() {
  return lessons.map((l) => ({ lesson: l.slug }));
}

export default async function Image({ params }: { params: Promise<{ lesson: string }> }) {
  const lesson = getLesson((await params).lesson);
  return ogCard({
    eyebrow: `Lesson · ${lesson?.minutes ?? 10} min`,
    title: lesson?.title ?? 'Algorender lesson',
    detail: lesson?.summary ?? 'Learn it by seeing it, predicting it and checking yourself.',
  });
}
