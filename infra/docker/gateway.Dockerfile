FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY turbo.json tsconfig.base.json ./

# Copy package.json files for all workspace packages needed by gateway
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/
COPY services/gateway/package.json services/gateway/

# Install ALL dependencies (build-time needs tsup, tsx, etc.)
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/sdk/ packages/sdk/
COPY services/gateway/ services/gateway/

# Build shared package first, then gateway
RUN pnpm --filter @osp/shared build
RUN pnpm --filter @osp/gateway build

# Use pnpm deploy to create a self-contained production directory
# with all node_modules properly resolved (no symlink issues)
RUN pnpm --filter @osp/gateway deploy --prod --legacy /deploy

# ─── Production image ───
FROM node:20-alpine
WORKDIR /app

# Copy the self-contained deploy output (flat node_modules, no symlinks)
COPY --from=base /deploy/node_modules ./node_modules
COPY --from=base /app/services/gateway/dist ./dist

# Patch in the built @osp/shared (pnpm deploy copies its package.json but not dist)
COPY --from=base /app/packages/shared/dist ./node_modules/@osp/shared/dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
