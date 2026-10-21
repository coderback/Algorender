import createMDX from '@next/mdx';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root: a stray lockfile in the home directory otherwise
  // makes Turbopack infer the wrong root.
  turbopack: { root: import.meta.dirname },
  // PGlite (the development database) loads its WebAssembly from its own
  // package folder, so it stays out of the bundle; the API routes need the
  // migrations at run time. Explain-it-back scoring reads the lesson prompts
  // and common mistakes from the MDX at run time.
  serverExternalPackages: ['@electric-sql/pglite'],
  outputFileTracingIncludes: { '/api/**/*': ['./drizzle/**/*'], '/api/explain': ['./src/content/lessons/*.mdx'] },
  // The catalogue moved from / to /explore; old ?tab= links land on its kind.
  async redirects() {
    return [
      {
        source: '/',
        has: [{ type: 'query', key: 'tab', value: '(?<kind>data-structures|algorithms|math|systems)' }],
        destination: '/explore?kind=:kind',
        permanent: true,
      },
      { source: '/', has: [{ type: 'query', key: 'tab' }], destination: '/explore', permanent: true },
    ];
  },
};

// Lessons are MDX (src/content/lessons). Plugins are named as strings so
// Turbopack can load them: math via KaTeX, and ids on headings for links.
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-math'],
    rehypePlugins: ['rehype-katex', 'rehype-slug'],
  },
});

// Development-only pages are named page.dev.tsx (the /dev/ui sheet of the
// design system), so production builds leave them out.
const config = (phase) =>
  withMDX({
    ...nextConfig,
    pageExtensions: phase === PHASE_DEVELOPMENT_SERVER ? ['dev.tsx', 'tsx', 'ts', 'jsx', 'js'] : ['tsx', 'ts', 'jsx', 'js'],
  });

export default config;
