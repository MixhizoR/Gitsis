# ---- EHSIM RMT backend image — Multi-stage: base → deps → builder → runtime ----
# Debian slim + OpenSSL (ARM Mac / Prisma engine uyumlulugu icin zorunlu)

# ----- Stage: base -----
FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ----- Stage: deps (full dependencies for builder / init service) -----
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ----- Stage: builder (full source + generate client) -----
FROM deps AS builder
COPY . .
RUN npx prisma generate

# ----- Stage: runtime (production image, no devDeps, no CLI) -----
FROM base AS runtime
WORKDIR /app

# Non-root user: official node:20-slim ships with 'node' user (uid 1000)
RUN chown -R node:node /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy generated Prisma client artifacts from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Also copy any engine binaries that .prisma references; copying the full .prisma dir covers it.

# Source files needed at runtime (exclude tests/docs)
COPY src/ ./src/
COPY healthcheck.js ./

# Set ownership for non-root user
RUN chown -R node:node /app
USER node

EXPOSE 4001
HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=5 \
  CMD node healthcheck.js

CMD ["node", "src/server.js"]
