import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Type errors fail the build rather than shipping. (Next 16 dropped the
  // `eslint` config key; linting runs as its own step.)
  typescript: { ignoreBuildErrors: false },
  images: {
    // AVIF first, WebP fallback. Both are well under the JPEG weight for the
    // same perceptual quality, which is what keeps LCP inside 2.5s on mobile.
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1920],
    imageSizes: [96, 160, 256, 384],
  },
  // The 3D chunk must never be pulled into the initial graph; it is loaded
  // through a dynamic import in HeroCanvasLoader. Nothing else should import
  // three, and this keeps the dependency out of the server bundle too.
  serverExternalPackages: ['three'],
};

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
})(nextConfig);
