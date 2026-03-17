FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY turbo.json tsconfig.base.json ./

# Copy package.json files for workspace deps
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/ui/ packages/ui/
COPY apps/web/ apps/web/

# Build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @osp/shared build
RUN pnpm --filter @osp/web build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=base /app/apps/web/public ./public
COPY --from=base --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
