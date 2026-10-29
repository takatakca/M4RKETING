/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // The legal pages read docs/legal/*.md at request time.
  outputFileTracingIncludes: { '/legal/[doc]': ['./docs/legal/**'], '/': ['./docs/legal/**'] },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Clover may show the app inside its dashboard; nobody else may frame it.
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://*.clover.com" },
      ],
    }];
  },
};
export default nextConfig;
