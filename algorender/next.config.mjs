/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root: a stray lockfile in the home directory otherwise
  // makes Turbopack infer the wrong root.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
