# ============================================================================
# Frontend Dockerfile — React/Vite (EHSIM - GITSIS)
# ============================================================================
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY public ./public

# Vite production build yap
RUN npm run build

EXPOSE 5173

# Preview server'ı 5173 portunda başlat (--host: dış ağdan erişim izni)
CMD ["npm", "run", "preview", "--", "--port", "5173", "--host"]