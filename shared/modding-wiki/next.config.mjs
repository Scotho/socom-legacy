import { createMDX } from 'fumadocs-mdx/next';

// A folder of static files (MW.R2): `next build` writes out/, any static host serves it.
// trailingSlash: /x/ -> out/x/index.html, which Cloudflare Pages serves without a rewrite.
/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  // `next dev` writes a Next.js AGENTS.md into the project when it detects an agent; the repository has one rule
  // file (the root AGENTS.md), so that is off.
  agentRules: false,
};

const withMDX = createMDX();

export default withMDX(config);
