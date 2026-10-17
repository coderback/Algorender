import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

// Bar heights for the decorative "array mid-sort" motif, coloured with the
// app's mark tokens: sorted (green) on the right, a pair being compared (blue).
const BARS = [38, 62, 30, 80, 52, 70, 88, 100];
const BAR_COLOURS = ['#9aa5b4', '#9aa5b4', '#0072b2', '#9aa5b4', '#0072b2', '#009e73', '#009e73', '#009e73'];

/** The link-preview card shared by every page: eyebrow, title, one line of detail. */
export function ogCard({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
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
          fontFamily: 'sans-serif',
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
    OG_SIZE,
  );
}
