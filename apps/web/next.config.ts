import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@osp/shared", "@osp/ui"],
  experimental: {},
};

export default withSentryConfig(nextConfig, {
  org: "avrio-05",
  project: "osp",

  // Auth token for source map uploads (build-time only)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress source map upload logs in CI
  silent: !process.env.CI,

  // Upload source maps so stack traces show original TypeScript
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger statements
  disableLogger: true,

  // Tunnel requests through Next.js to avoid ad-blocker issues
  tunnelRoute: "/monitoring",

  // Automatically annotate React components for better error context
  reactComponentAnnotation: {
    enabled: true,
  },
});
