import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LessonChrome } from '@/components/lesson/LessonChrome';
import { LessonFinish } from '@/components/lesson/Completion';
import { LessonProvider } from '@/components/lesson/LessonContext';
import { TrackCard, trackTitle } from '@/components/ui/Card';
import { cx } from '@/components/ui/cx';
import { TRACK_CLASSES, trackColour } from '@/data/tracks';
import { getConcept, loadConcepts, unlockedBy } from '@/content/concepts';
import { getLesson, lessons } from '@/content/lessons';
import { lessonMisconceptions } from '@/content/lessons/assessment';
import { lessonSections } from '@/content/lessons/sections';

export const dynamicParams = false;

export function generateStaticParams() {
  return lessons.map((l) => ({ lesson: l.slug }));
}

type Props = { params: Promise<{ lesson: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = getLesson((await params).lesson);
  return lesson ? { title: `${lesson.title} | Algorender`, description: lesson.summary } : {};
}

/** Bars of the track's colour across the hero: decoration only. */
const MOTIF = [
  [44, 46],
  [44, 22, 22],
  [44, 18, 10],
];

export default async function LessonPage({ params }: Props) {
  const { lesson: slug } = await params;
  const lesson = getLesson(slug);
  const concept = lesson && getConcept(lesson.concept);
  if (!lesson || !concept) notFound();

  const { default: Body } = await import(`@/content/lessons/${slug}.mdx`);
  const track = loadConcepts().tracks.find((t) => t.id === concept.track);
  const prereqs = concept.prereqs.map((p) => getConcept(p)!);
  const href = (c: { id: string; lesson?: string; visualisers?: string[] }) => (c.lesson ? `/learn/${c.lesson}` : c.visualisers?.[0] ? `/visualisers/${c.visualisers[0]}` : `/learn?concept=${c.id}`);
  // The next lesson: the first concept this one unlocks that has a lesson.
  const nextConcept = unlockedBy(concept.id).find((c) => !c.planned && c.lesson);
  const nextLesson = nextConcept?.lesson ? getLesson(nextConcept.lesson) : undefined;

  return (
    <LessonChrome lesson={slug} trackTitle={track?.title ?? ''} title={concept.title} minutes={lesson.minutes} sections={lessonSections(slug)}>
      <TrackCard track={concept.track} as="div" className="gap-5 rounded-[36px] p-7 sm:p-9">
        <p className="text-eyebrow uppercase">
          {track?.title} · {lesson.minutes} min
        </p>
        <h1 className={cx('font-display text-[clamp(34px,4.6vw,56px)] leading-[1.02] font-bold tracking-[-0.03em]', trackTitle(concept.track))}>{lesson.title}</h1>
        <p className="max-w-2xl text-[16px] leading-relaxed">{lesson.summary}</p>
        {prereqs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-semibold">Builds on</span>
            {prereqs.map((p) => (
              <Link key={p.id} href={href(p)} className="rounded-full bg-chip-on-track px-3 py-1 font-semibold hover:underline">
                {p.title}
              </Link>
            ))}
          </div>
        )}
        <div aria-hidden className="mt-1 flex flex-col gap-2.5">
          {MOTIF.map((row, r) => (
            <div key={r} className="flex gap-1.5">
              {row.map((w, i) => (
                <span key={i} className={cx('h-2 rounded-full', i === 0 ? 'bg-chip-on-track' : TRACK_CLASSES[trackColour(concept.track)].fill, i === 1 && 'opacity-60')} style={{ width: `${w}%` }} />
              ))}
            </div>
          ))}
        </div>
      </TrackCard>

      <LessonProvider slug={slug} mistakes={Object.fromEntries(lessonMisconceptions().filter((m) => m.lesson === slug).map((m) => [m.id, m.title]))}>
        <article className="flex flex-col gap-14">
          <Body />
        </article>
      </LessonProvider>

      <LessonFinish slug={slug} next={nextLesson && { href: `/learn/${nextLesson.slug}`, title: nextConcept!.title }} />
    </LessonChrome>
  );
}
