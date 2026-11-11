/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // In hosted deployments where frontend and backend are on different hosts,
    // proxy /api requests to the backend server so the browser talks to a single origin.
    // This ensures cookies are treated as first-party and works across all modern browsers.
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:4000/api';

    const destination = backendUrl.endsWith('/api')
      ? `${backendUrl}/:path*`
      : `${backendUrl.replace(/\/$/, '')}/api/:path*`;

    return [
      {
        source: '/api/:path*',
        destination,
      },
    ];
  },
};

export default nextConfig;
