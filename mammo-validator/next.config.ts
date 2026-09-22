import type { NextConfig } from 'next';

/**
 * Cornerstone3D ships pre-bundled ESM only. Transpiling the packages keeps
 * webpack/Turbopack happy and lets us import from their `exports` map.
 *
 * The DICOM loader also statically imports optional JPEG2000/JPEG-LS codecs
 * that reference Node built-ins (`fs`, `path`, …) which only run in a Node
 * worker context. Our demo files are uncompressed, so those decoders are
 * never invoked in the browser — stub the built-ins to keep the client bundle
 * buildable.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@cornerstonejs/core',
    '@cornerstonejs/tools',
    '@cornerstonejs/dicom-image-loader',
    '@cornerstonejs/metadata',
    'dicom-parser',
  ],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
