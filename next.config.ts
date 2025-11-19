import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Optional: Disable image optimization if your NAS has limited resources
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
