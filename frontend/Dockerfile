FROM node:24-slim AS base
WORKDIR /app
RUN npm config set strict-ssl false
COPY package*.json ./
RUN npm install && npm cache clean --force

FROM base AS builder
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine AS final
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/nginx-health || exit 1