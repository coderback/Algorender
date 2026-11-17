import { explainError } from './errors';
import type { Language, RunError } from './protocol';
import { InlineText } from './InlineText';

/**
 * What an error means and where to look, from the error catalogue
 * (errors.ts), under the error itself. Nothing when the catalogue doesn't
 * know it. On the dark code panel (`code`) or a light card.
 */
export function ErrorHelp({ language, error, tone = 'card' }: { language: Language; error: Pick<RunError, 'message'>; tone?: 'card' | 'code' }) {
  const help = explainError(language, error);
  if (!help) return null;
  const code = tone === 'code';
  return (
    <div data-error-help className={code ? 'mt-2 border-t border-code-highlight pt-2 font-sans text-[13px] text-code-ink' : 'rounded-well bg-sunken p-4 text-sm text-ink-soft'}>
      <p className={code ? 'font-semibold' : 'font-semibold text-ink'}>{help.title}</p>
      <dl className="mt-1 flex flex-col gap-1">
        <div>
          <dt className="sr-only">What it means</dt>
          <dd>
            <InlineText text={help.meaning} />
          </dd>
        </div>
        <div>
          <dt className={code ? 'inline font-semibold text-code-muted' : 'inline font-semibold text-ink'}>Where to look: </dt>
          <dd className="inline">
            <InlineText text={help.look} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
