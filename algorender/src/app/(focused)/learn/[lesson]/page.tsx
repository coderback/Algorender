import { FocusBar } from '@/components/shell/PhoneHeader';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FiArrowLeft, FiArrowRight, FiClock } from 'react-icons/fi';
import { LessonComplete } from '@/components/lesson/Completion';
import { LessonProvider } from '@/components/lesson/LessonContext';
import { getConcept, loadConcepts, unlockedBy } from '@/content/concepts';
import { getLesson, lessons } from '@/content/lessons';
import { lessonMisconceptions } from '@/content/lessons/assessment';

export const dynamicParams = false;

export function generateStaticParams() {
  return lessons.map((l) => ({ lesson: l.slug }));
}

type Props = { params: Promise<{ lesson: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = getLesson((await params).lesson);
  return lesson ? { title: `${lesson.title} | Algorender`, description: lesson.summary } : {};
}

export default async function LessonPage({ params }: Props) {
  const { lesson: slug } = await params;
  const lesson = getLesson(slug);
  const concept = lesson && getConcept(lesson.concept);
  if (!lesson || !concept) notFound();

  const { default: Body } = await import(`@/content/lessons/${slug}.mdx`);
  const track = loadConcepts().tracks.find((t) => t.id === concept.track);
  const prereqs = concept.prereqs.map((p) => getConcept(p)!);
  const next = unlockedBy(concept.id).filter((c) => !c.planned);
  const href = (c: { id: string; lesson?: string }) => (c.lesson ? `/learn/${c.lesson}` : `/learn#${c.id}`);

  return (
    <>
      {/* TODO(redesign): this page gets its own focus header in its phase. */}
      <FocusBar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <Link href="/learn" className="inline-flex items-center gap-1.5 text-accent-ink hover:underline">
            <FiArrowLeft aria-hidden /> Concept map
          </Link>
          {track && <span className="text-ink-muted"> / {track.title}</span>}
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">{lesson.title}</h1>
          <p className="mt-2 text-lg text-ink-soft">{lesson.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <FiClock aria-hidden /> About {lesson.minutes} minutes
            </span>
            {prereqs.length > 0 && (
              <span>
                Builds on{' '}
                {prereqs.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ', '}
                    <Link href={href(p)} className="text-ink-soft underline decoration-line-strong underline-offset-2 hover:text-accent-ink">
                      {p.title}
                    </Link>
                  </span>
                ))}
              </span>
            )}
          </div>
        </header>

        <LessonProvider slug={slug} mistakes={Object.fromEntries(lessonMisconceptions().filter((m) => m.lesson === slug).map((m) => [m.id, m.title]))}>
          <article className="space-y-10">
            <Body />
          </article>
        </LessonProvider>

        <footer className="mt-12 space-y-6 border-t border-line pt-8">
          <LessonComplete slug={slug} />
          {next.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">What this unlocks</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {next.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={href(c)}
                      className="flex h-full items-start justify-between gap-3 rounded-xl border border-line-soft bg-surface p-4 shadow-xs hover:border-accent-line"
                    >
                      <span>
                        <span className="block font-medium text-ink">{c.title}</span>
                        <span className="text-sm text-ink-soft">{c.summary}</span>
                      </span>
                      <FiArrowRight aria-hidden className="mt-1 shrink-0 text-accent-ink" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </footer>
      </main>
    </>
  );
}
