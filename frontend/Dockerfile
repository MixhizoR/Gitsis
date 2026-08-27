# ============================================================================
# Frontend Dockerfile — Multi-stage: dev (vite) → build → nginx production
# ============================================================================
FROM node:22-alpine

# ----- Stage: base (dev + builder dependency base) -----
FROM node:20-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

# ----- Stage: dev (target for compose.dev.yaml live reload) -----
FROM base AS dev
COPY src ./src
COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY public ./public
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "--port", "5173"]

# ----- Stage: builder (production bundle) -----
FROM base AS builder
COPY src ./src
COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY public ./public
RUN npm run build

# ----- Stage: final (nginx-unprivileged production server) -----
FROM nginxinc/nginx-unprivileged:stable-alpine AS final
# Nginx unprivileged runs as nginx user on 8080 by default
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
# Health endpoint exposed via nginx config; no extra process needed
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/nginx-health || exit 1
