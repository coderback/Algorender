import createMDX from '@next/mdx';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root: a stray lockfile in the home directory otherwise
  // makes Turbopack infer the wrong root.
  turbopack: { root: import.meta.dirname },
  // PGlite (the development database) loads its WebAssembly from its own
  // package folder, so it stays out of the bundle; the API routes need the
  // migrations at run time.
  serverExternalPackages: ['@electric-sql/pglite'],
  outputFileTracingIncludes: { '/api/**/*': ['./drizzle/**/*'] },
};

// Lessons are MDX (src/content/lessons). Plugins are named as strings so
// Turbopack can load them: math via KaTeX, and ids on headings for links.
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-math'],
    rehypePlugins: ['rehype-katex', 'rehype-slug'],
  },
});

export default withMDX(nextConfig);
