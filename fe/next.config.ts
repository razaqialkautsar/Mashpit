import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard has no backend (docs/PRD.md NFR-6), so the site ships as static files.
  output: "export",
  images: { unoptimized: true },
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
