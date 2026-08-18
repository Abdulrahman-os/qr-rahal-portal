/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Captcha-Token' },
        ],
      },
    ]
  },
  // Maps conventional well-known paths (no /api prefix expected by
  // spec/convention) to the actual API routes that implement them.
  // Next.js's Pages Router only treats files under pages/api/ as API
  // routes — a literal pages/.well-known/jwks.json.js file would be
  // treated as a page component, not JSON output — so a rewrite is
  // the correct mechanism here, not a literal file at that path.
  async rewrites() {
    return [
      { source: '/.well-known/jwks.json', destination: '/api/jwks' },
      { source: '/health', destination: '/api/health' },
    ]
  },
}

module.exports = nextConfig
