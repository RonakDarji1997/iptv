import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Optional: Disable image optimization if your NAS has limited resources
  images: {
    unoptimized: true,
  },
  // Rewrite rules to proxy Expo web app
  async rewrites() {
    return [
      // API routes go to Next.js
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
      // All other routes proxy to Expo on port 3005
      {
        source: '/:path*',
        destination: 'http://localhost:3005/:path*',
      },
    ];
  },
};

export default nextConfig;
