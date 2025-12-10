/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['localhost'],
    unoptimized: true
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
