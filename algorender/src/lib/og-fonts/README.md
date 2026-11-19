# Fonts for the link-preview cards

`src/lib/og.tsx` reads these from disk when the cards are prerendered, so the build needs no network
(fetching them from Google Fonts timed out on Vercel's build machines).

- `Geist-Regular.ttf`: Geist by Vercel, copied from `next/dist/compiled/@vercel/og/`, the font the
  card renderer uses when given none, so the cards look as they did.
- `NotoSans-Scripts.ttf`: Noto Sans by Google, subset by Google Fonts to the super- and subscripts
  Geist lacks (listed in `og.tsx`, e.g. the ⁻ in P⁻¹ and the ⁿ in 2ⁿ). To add characters, download
  `https://fonts.googleapis.com/css2?family=Noto+Sans&text=<characters>` with an old Safari user agent
  (so it answers with TTF), fetch the `src` URL and replace the file.

Both are licensed under the SIL Open Font License 1.1: https://openfontlicense.org
