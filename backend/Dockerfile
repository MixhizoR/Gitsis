FROM node:24-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm config set strict-ssl false

FROM base AS deps
COPY package*.json ./
RUN npm install

FROM deps AS builder
COPY . .
# Node.js'in Prisma binary'lerini indirirken SSL hatasi vermesini engelliyoruz
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma generate

FROM base AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY src/ ./src/
COPY healthcheck.js ./

RUN chown -R node:node /app
USER node

EXPOSE 4001
HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=5 CMD node healthcheck.js

CMD ["node", "src/server.js"]