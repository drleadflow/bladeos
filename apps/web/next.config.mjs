/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@blade/core', '@blade/db', '@blade/shared'],
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'dockerode', 'docker-modem', 'ssh2'],
  },
};

export default nextConfig;
