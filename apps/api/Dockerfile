FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm -r run build
RUN pnpm --filter @copilot-occident/api deploy --prod /prod

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup -g 1001 -S copilot && adduser -S copilot -u 1001
COPY --from=builder --chown=copilot:copilot /prod .
USER copilot
EXPOSE 4025
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
