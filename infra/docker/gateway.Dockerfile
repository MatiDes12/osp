FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY turbo.json tsconfig.base.json ./

# Copy package.json files for all workspace packages
COPY packages/shared/package.json packages/shared/
COPY services/gateway/package.json services/gateway/

# Install dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source
COPY packages/shared/ packages/shared/
COPY services/gateway/ services/gateway/

# Build shared package first, then gateway
RUN pnpm --filter @osp/shared build
RUN pnpm --filter @osp/gateway build

# Production image
FROM node:20-alpine
WORKDIR /app

COPY --from=base /app/services/gateway/dist ./dist
COPY --from=base /app/services/gateway/package.json ./
COPY --from=base /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
