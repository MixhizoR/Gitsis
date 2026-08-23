# ---- EHSIM RMT backend image ----
# Not: Alpine (musl) + Prisma, ARM Mac'te libssl/OpenSSL tespit sorunu yasiyor
# ("Could not parse schema engine response"). Debian tabanli 'slim' imaji
# dogru OpenSSL surumuyle gelir ve Prisma sorunsuz calisir.
FROM node:20-slim

WORKDIR /app

# Prisma calisma zamani icin OpenSSL gerekli.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Bagimliliklari once kur (katman onbellegi icin)
COPY package*.json ./
RUN npm install

# Kaynak + Prisma semasi
COPY . .

# Prisma istemcisini uret (schema.prisma mevcut olmali)
RUN npx prisma generate

EXPOSE 4001

# Not: docker-compose 'command' alani bunu override eder (db push + seed + start).
CMD ["node", "src/server.js"]
