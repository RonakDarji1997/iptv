/** @type {import('next').NextConfig} */

// Check if building for mobile app bundling
const isMobile = process.env.BUILD_TARGET === 'mobile';

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Static export for mobile app bundling
  output: isMobile ? 'export' : undefined,
  assetPrefix: isMobile ? '' : undefined,
  trailingSlash: isMobile ? true : undefined,
  
  images: {
    domains: ['localhost'],
    unoptimized: isMobile || true, // Unoptimized for mobile
  },
  
  // Remove rewrites - using Next.js API routes instead
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  
  // Increase header size limit to fix 431 errors
  serverRuntimeConfig: {
    maxHeaderSize: 16384, // 16KB
  },
}

module.exports = nextConfig
