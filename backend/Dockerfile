FROM node:24-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable pnpm
RUN pnpm config set strict-ssl false

# Build context MUST be the repo root so the pnpm workspace can resolve.
# Copy only manifests first for a cache-friendly layer.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY backend/package.json ./backend/

# Install dev + prod for the builder (Prisma needs devDeps).
FROM base AS builder
RUN pnpm install --frozen-lockfile --filter ehsim-rmt-backend...
COPY . .
# Node.js'in Prisma binary'lerini indirirken SSL hatasi vermesini engelliyoruz
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm --filter ehsim-rmt-backend exec prisma generate

# Runtime: prod-only install of this workspace package.
FROM base AS runtime
RUN pnpm install --frozen-lockfile --filter ehsim-rmt-backend... --prod && pnpm store prune
COPY --from=builder /app/backend/node_modules/.prisma /app/backend/node_modules/.prisma
COPY --from=builder /app/backend/node_modules/@prisma /app/backend/node_modules/@prisma
COPY --from=builder /app/backend/src /app/backend/src
COPY --from=builder /app/backend/healthcheck.js /app/backend/healthcheck.js
WORKDIR /app/backend

RUN chown -R node:node /app
USER node

EXPOSE 4001
HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=5 CMD node healthcheck.js

CMD ["node", "src/server.js"]
