import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents is intentionally off: it is untested with the OpenNext Cloudflare adapter (D43).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: '/api/story/:code.png', destination: '/api/story/:code' }];
  },
};

export default nextConfig;
