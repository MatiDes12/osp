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

# Install dependencies (use --no-frozen-lockfile for dev flexibility)
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/sdk/ packages/sdk/
COPY services/gateway/ services/gateway/

# Build shared package first, then gateway
RUN pnpm --filter @osp/shared build
RUN pnpm --filter @osp/gateway build

# ─── Production image ───
FROM node:20-alpine
WORKDIR /app

COPY --from=base /app/services/gateway/dist ./dist
COPY --from=base /app/services/gateway/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./node_modules/@osp/shared/dist
COPY --from=base /app/packages/shared/package.json ./node_modules/@osp/shared/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
