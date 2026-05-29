/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    '*.cloudworkstations.dev',
    'cloudworkstations.dev',
    '*.cluster-nzwlpk54dvagsxetkvxzbvslyi.cloudworkstations.dev',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;