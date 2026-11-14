import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard has no backend (docs/PRD.md NFR-6), so the site ships as static files.
  output: "export",
  images: { unoptimized: true },
  experimental: {
    // Low-RAM machines: NEXT_BUILD_CPUS=1 npm run build prerenders with one worker
    // instead of one per core. Unset, Next.js picks the default.
    cpus: Number(process.env.NEXT_BUILD_CPUS) || undefined,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
