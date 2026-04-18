import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@blade/conversation', '@blade/core', '@blade/db', '@blade/shared'],
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'dockerode', 'docker-modem', 'ssh2', '@node-rs/argon2', 'bullmq', 'ioredis', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
    ]
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: true,
  autoInstrumentAppDirectory: true,
  disableLogger: true,
  widenClientFileUpload: true,
});
