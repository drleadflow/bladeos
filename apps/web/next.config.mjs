/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@blade/conversation', '@blade/core', '@blade/db', '@blade/shared'],
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'dockerode', 'docker-modem', 'ssh2', '@node-rs/argon2', 'bullmq', 'ioredis', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  },
};

export default nextConfig;
