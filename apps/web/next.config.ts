import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@osp/shared", "@osp/ui"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
