FROM node:24-slim AS base
WORKDIR /app
RUN corepack enable pnpm
# Corepack pnpm'yi ilk kullanimda indirir. Docker daemon'i TLS-intercepting
# bir proxy'den gecebilecegi icin indirmeyi sertifika dogrulamasi olmadan yap,
# sonra pnpm'in kendi strict-ssl ayarini kapat (sadece build zamani).
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 corepack prepare pnpm@9.15.9 --activate
RUN pnpm config set strict-ssl false

# Build context MUST be the repo root so the pnpm workspace can resolve.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY frontend/package.json ./frontend/

# Install only this workspace package and its deps.
RUN pnpm install --frozen-lockfile --filter ehsim-rmt...

FROM base AS builder
COPY . .
RUN pnpm --filter ehsim-rmt run build

FROM nginxinc/nginx-unprivileged:stable-alpine AS final
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/nginx-health || exit 1
