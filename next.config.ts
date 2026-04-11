/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Allowing everything on the local network for dev
      allowedOrigins: ['192.168.9.217:4001', 'localhost:4001','192.168.8.233:4001'],
    },
  },
  // This bypasses the dev-server host check
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-Requested-With, Content-Type, Authorization' },
        ],
      },
    ]
  },
};

export default nextConfig;