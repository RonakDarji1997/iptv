import type { NextConfig } from "next";

// Production config: serve static exported Expo web build from /public
// No dev rewrites; Next.js handles /api/*, middleware will rewrite other paths to /index.html
const nextConfig: NextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
};

export default nextConfig;
