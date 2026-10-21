import type { Metadata } from 'next';
import { EmbedBuilder } from '@/components/embed/EmbedBuilder';
import { DetailHeader } from '@/components/explorer/DetailHeader';
import { visualisers } from '@/data/visualisers';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Embed a visualiser | Algorender',
  description: 'Put any Algorender visualiser on your own page: pick one, choose its theme and mode, and copy the iframe.',
};

export default function EmbedIndexPage() {
  const choices = visualisers
    .filter((v: { hidden?: boolean }) => !v.hidden)
    .map((v: { slug: string; name: string; type: string }) => ({ slug: v.slug, name: v.name, type: v.type }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
  return (
    <main className="flex flex-col gap-5 px-4 pt-6 pb-6 md:px-0 md:pt-1">
      <DetailHeader
        crumb="Embed"
        back="/explore"
        title="Embed a visualiser"
        description="Any visualiser can live on your own page: a blog post, course notes, a slide. It plays exactly as it does here, with stepping, scrubbing and Predict mode, and links back to its full page."
      />
      <EmbedBuilder choices={choices} origin={SITE_URL} />
    </main>
  );
}
