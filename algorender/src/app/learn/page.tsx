import type { Metadata } from 'next';
import Link from 'next/link';
import { FiBookOpen, FiClock, FiPlayCircle } from 'react-icons/fi';
import { CompletedTick } from '@/components/lesson/Completion';
import { depths, loadConcepts, type Concept } from '@/content/concepts';
import { getLesson } from '@/content/lessons';
import { getVisualiserBySlug } from '@/data/visualisers';

export const metadata: Metadata = {
  title: 'Learn: the concept map | Algorender',
  description: 'Every concept in the order it builds on the others, from Big-O to graphs and dynamic programming, with lessons and interactive visualisers.',
};

export default function LearnPage() {
  const { tracks, concepts } = loadConcepts();
  const depth = depths();
  const titleOf = new Map(concepts.map((c) => [c.id, c.title]));
  const lessonCount = concepts.filter((c) => c.lesson).length;
  const ordered = [...tracks].sort((a, b) => Number(a.planned) - Number(b.planned));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-ink">Learn</div>
        <h1 className="text-3xl font-bold text-ink">The concept map</h1>
        <p className="mt-2 text-ink-soft">
          Each concept lists what it builds on, so you can start anywhere and fill gaps as you go. {lessonCount} have a full
          lesson so far: a hook, the key parts, the visualiser, predictions to make, and questions to check yourself. The rest
          open straight into their visualisers.
        </p>
      </div>

      <div className="space-y-10">
        {ordered.map((track) => {
          const items = concepts
            .filter((c) => c.track === track.id)
            .sort((a, b) => depth.get(a.id)! - depth.get(b.id)! || a.title.localeCompare(b.title));
          return (
            <section key={track.id} aria-labelledby={`track-${track.id}`}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
                <h2 id={`track-${track.id}`} className="text-xl font-semibold text-ink">
                  {track.title}
                </h2>
                {track.planned && <span className="rounded-full bg-sunken px-2 py-0.5 text-xs text-ink-soft">Coming next</span>}
                <p className="text-sm text-ink-muted">{track.summary}</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => (
                  <ConceptCard key={c.id} concept={c} titleOf={titleOf} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function ConceptCard({ concept: c, titleOf }: { concept: Concept; titleOf: Map<string, string> }) {
  const lesson = c.lesson ? getLesson(c.lesson) : undefined;
  return (
    <li
      id={c.id}
      className={`flex flex-col rounded-xl border p-4 ${c.planned ? 'border-dashed border-line bg-subtle' : 'border-line-soft bg-surface shadow-xs'}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className={`font-semibold ${c.planned ? 'text-ink-muted' : 'text-ink'}`}>{c.title}</h3>
        {lesson && <CompletedTick slug={lesson.slug} />}
      </div>
      <p className={`mb-3 text-sm ${c.planned ? 'text-ink-muted' : 'text-ink-soft'}`}>{c.summary}</p>

      {c.prereqs.length > 0 && (
        <p className="mb-3 text-xs text-ink-muted">
          Builds on{' '}
          {c.prereqs.map((p, i) => (
            <span key={p}>
              {i > 0 && ', '}
              <a href={`#${p}`} className="text-ink-soft underline decoration-line-strong underline-offset-2 hover:text-accent-ink">
                {titleOf.get(p)}
              </a>
            </span>
          ))}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-1.5">
        {lesson && (
          <Link
            href={`/learn/${lesson.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-strong"
          >
            <FiBookOpen aria-hidden /> Lesson <FiClock aria-hidden className="ml-1" /> {lesson.minutes} min
          </Link>
        )}
        {c.visualisers.map((slug) => (
          <Link
            key={slug}
            href={`/visualisers/${slug}`}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft hover:border-accent-line hover:bg-accent-soft"
          >
            <FiPlayCircle aria-hidden className="text-ink-muted" /> {getVisualiserBySlug(slug)?.name ?? slug}
          </Link>
        ))}
        {c.links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft hover:border-accent-line hover:bg-accent-soft">
            {l.label}
          </Link>
        ))}
        {c.planned && <span className="text-xs text-ink-muted">Coming soon</span>}
      </div>
    </li>
  );
}
