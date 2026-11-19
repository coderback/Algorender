import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

// Bar heights for the decorative "array mid-sort" motif, coloured with the
// app's mark tokens: sorted (green) on the right, a pair being compared (blue).
const BARS = [38, 62, 30, 80, 52, 70, 88, 100];
const BAR_COLOURS = ['#9aa5b4', '#9aa5b4', '#0072b2', '#9aa5b4', '#0072b2', '#009e73', '#009e73', '#009e73'];

// The renderer's own font, Geist, has no ⁻ or ⁿ (P⁻¹, 2ⁿ), and its fallback asks Google Fonts
// for them from fonts that don't have them either, so they were drawn as empty boxes. The card
// loads Geist itself with a Noto Sans subset of the super- and subscripts, which does have them.
// Passing fonts replaces the renderer's defaults, so without Google Fonts it keeps those.
const SCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₙᵀ';
// An old Safari, so Google Fonts answers with TTF, which the renderer reads (it can't read WOFF2).
const TTF_AGENT = 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';

type Fonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>['fonts'];

async function googleFont(family: string, text?: string): Promise<ArrayBuffer> {
  const query = `family=${encodeURIComponent(family)}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
  const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}`, { headers: { 'User-Agent': TTF_AGENT }, cache: 'force-cache' })).text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!src) throw new Error(`Google Fonts has no TTF for ${family}`);
  const res = await fetch(src, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Google Fonts answered ${res.status} for ${family}`);
  return res.arrayBuffer();
}

let cardFonts: Promise<Fonts> | undefined;
function loadCardFonts(): Promise<Fonts> {
  cardFonts ??= Promise.all([googleFont('Geist'), googleFont('Noto Sans', SCRIPTS)]).then(
    ([geist, scripts]): Fonts => [
      { name: 'Geist', data: geist, weight: 400, style: 'normal' },
      { name: 'Noto Sans', data: scripts, weight: 400, style: 'normal' },
    ],
    (error) => {
      console.warn('Link-preview fonts not loaded, so super- and subscripts may show as boxes:', error);
      return undefined;
    },
  );
  return cardFonts;
}

/** The link-preview card shared by every page: eyebrow, title, one line of detail. */
export async function ogCard({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  const fonts = await loadCardFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)',
          fontFamily: fonts ? 'Geist, "Noto Sans"' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 700, color: '#111827' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#2563eb', display: 'flex' }} />
          Algorender
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 2 }}>{eyebrow}</div>
            <div style={{ fontSize: title.length > 40 ? 56 : 68, fontWeight: 800, color: '#111827', lineHeight: 1.1, marginTop: 12 }}>
              {title}
            </div>
            <div style={{ fontSize: 28, color: '#4b5563', marginTop: 20, lineHeight: 1.35 }}>{detail}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 220 }}>
            {BARS.map((h, i) => (
              <div key={i} style={{ width: 30, height: `${h}%`, borderRadius: '8px 8px 0 0', background: BAR_COLOURS[i] }} />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
