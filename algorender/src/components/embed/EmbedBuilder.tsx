'use client';

import { useState } from 'react';
import { FiCheck, FiCopy, FiExternalLink } from 'react-icons/fi';
import { useTheme } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Segmented } from '@/components/ui/Segmented';

export type EmbedChoice = { slug: string; name: string; type: string };

const GROUPS: { type: string; label: string }[] = [
  { type: 'data-structure', label: 'Data structures' },
  { type: 'algorithm', label: 'Algorithms' },
  { type: 'math', label: 'Math & ML' },
  { type: 'systems', label: 'Systems' },
];

type Theme = 'auto' | 'light' | 'dark';
const HEIGHTS = [480, 560, 680] as const;

/** The embed's address with the chosen options: a theme to force, and Predict mode. */
export function embedPath(slug: string, theme: Theme, predict: boolean): string {
  const params = new URLSearchParams();
  if (theme !== 'auto') params.set('theme', theme);
  if (predict) params.set('mode', 'predict');
  const query = params.toString();
  return `/embed/${slug}${query ? `?${query}` : ''}`;
}

/** The snippet to paste: a plain iframe, lazy-loaded, titled for screen readers. */
export function embedSnippet(origin: string, choice: EmbedChoice, theme: Theme, predict: boolean, height: number): string {
  return `<iframe src="${origin}${embedPath(choice.slug, theme, predict)}" title="${choice.name}, an interactive visualiser from Algorender" width="100%" height="${height}" style="border:0;border-radius:16px" loading="lazy"></iframe>`;
}

/**
 * Pick a visualiser and its options, see the embed live, and copy the iframe
 * snippet. Embeds are the same visualiser without the side panels, with a link
 * back to the full page; they follow the visitor's light or dark setting
 * unless a theme is forced.
 */
export function EmbedBuilder({ choices, origin }: { choices: readonly EmbedChoice[]; origin: string }) {
  const [slug, setSlug] = useState('bubble-sort');
  const [theme, setTheme] = useState<Theme>('auto');
  const [predict, setPredict] = useState(false);
  const [height, setHeight] = useState<number>(560);
  const [copied, setCopied] = useState(false);
  const choice = choices.find((c) => c.slug === slug) ?? choices[0];
  const snippet = embedSnippet(origin, choice, theme, predict, height);
  // "Visitor's" follows each visitor's setting; the preview shows it in the theme this page is in.
  const page = useTheme().theme;
  const previewTheme: Theme = theme === 'auto' && page !== 'system' ? page : theme;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The snippet stays selectable on the page.
    }
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
      <Card className="gap-3.5 p-3 sm:p-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-title-card font-display">Preview</h2>
          <a href={`/visualisers/${choice.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
            Full page <FiExternalLink aria-hidden />
          </a>
        </div>
        <iframe
          key={`${choice.slug}-${previewTheme}-${predict}`}
          src={embedPath(choice.slug, previewTheme, predict)}
          title={`Preview of the ${choice.name} embed`}
          className="w-full rounded-tile bg-page"
          style={{ height, border: 0 }}
          loading="lazy"
        />
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="gap-4 p-5">
          <h2 className="text-title-card font-display">Options</h2>
          <label className="flex flex-col gap-2 text-[15px] font-semibold">
            Visualiser
            <select
              value={choice.slug}
              onChange={(e) => setSlug(e.target.value)}
              className="h-11 cursor-pointer rounded-full bg-sunken pr-3 pl-4 text-[15px] font-semibold text-ink"
            >
              {GROUPS.map((g) => (
                <optgroup key={g.type} label={g.label}>
                  {choices
                    .filter((c) => c.type === g.type)
                    .map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold">Theme</span>
            <Segmented<Theme>
              label="Theme"
              size="m"
              value={theme}
              onChange={setTheme}
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              options={[
                { value: 'auto', label: "Visitor's" },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold">Opens in</span>
            <Segmented<'watch' | 'predict'>
              label="Opens in"
              size="m"
              value={predict ? 'predict' : 'watch'}
              onChange={(mode) => setPredict(mode === 'predict')}
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              options={[
                { value: 'watch', label: 'Watch' },
                { value: 'predict', label: 'Predict' },
              ]}
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-[15px] font-semibold">
            Height
            <select
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="h-11 cursor-pointer rounded-full bg-sunken pr-3 pl-4 text-[15px] font-semibold text-ink"
            >
              {HEIGHTS.map((h) => (
                <option key={h} value={h}>
                  {h} px
                </option>
              ))}
            </select>
          </label>
        </Card>

        <Card className="gap-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-title-card font-display">Code</h2>
            <Button kind="primary" size="s" icon={copied ? <FiCheck aria-hidden /> : <FiCopy aria-hidden />} onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <CodeBlock lines={[snippet]} numbers={false} label="Embed code" className="[&_code]:break-all [&_code]:whitespace-pre-wrap" />
          <p className="text-[13px] text-ink-muted">
            Paste it into any page that allows iframes: a blog, course notes, a slide deck. Visitors can step, scrub and predict; nothing they do is saved.
          </p>
          <span role="status" className="sr-only">
            {copied ? 'Embed code copied' : ''}
          </span>
        </Card>
      </div>
    </div>
  );
}
