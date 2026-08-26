# AGENTS.md — OpenCode için kısa kurulum / kurallar

Bu dosya, OpenCode oturumlarının bu repo üzerinde hatalı varsayımlardan kaçınması için.

## Repo yapısı

- **Kök**: package.json yoktur. İki ayrı paket vardır:
  - `backend/` — Express + Prisma + PostgreSQL API (ESM, Node 20 Docker / 24 CI)
  - `frontend/` — React + Vite + Tailwind SPA (ESM, vitest)
  - `ai-bridge/` — isteğe bağlı Python/LM Studio köprüsü
  - `scripts/` — örnek proje seed'ı (sadece backend ayaktayken çalıştırılır)
- **CI**: `.github/workflows/ci.yml` — `detect-changes` (paths-filter) → `frontend` ve `backend` paralel kanallar → `ci-status` aggregate. Bir bölümün değişmemişse o kanalı atlar.
- **Branch protection (main)**: zorunlu PR + zorunlu `CI Pipeline Status` (strict). main'e doğrudan push engelli. Commit mesajları Türkçe ASCII, `type: açıklama` şeklinde.

## Gerekli ortam / secrets

- `JWT_SECRET` **zorunludur**; eksikse `backend/src/auth.js` başlangıçta `throw new Error('JWT_SECRET is required')` → process çöker.
- `backend/.env` ve `frontend/.env` **Git takibinde değil** (`.gitignore` `.env*` / `!.env.example`). Şablonlar: `.env.example`, `backend/.env.example`, `frontend/.env.example`.
- `compose.yaml` içindeki `POSTGRES_PASSWORD`, `JWT_SECRET`, `DATABASE_URL` kok dizindeki `.env`'den `${VAR}` interpolasyonuyla gelir. Yerelde `cp .env.example .env` yap ve değerleri düzelt.
- Eski commit'lerde şifre/fallback değerleri **hâlâ geçmişte** (rotate edin, gerekirse history temizleyin).
- CI'da `JWT_SECRET=${{ secrets.CI_JWT_SECRET || 'ci-test-secret' }}` fallback'i vardır.

## Komutlar — nerede çalıştırılır?

**Çoğu komut backend/ veya frontend/ içinde çalışır.** `cwd`'i doğru klasöre alın (CI `working-directory` ile bunu yapar).

### Backend (`backend/`)
- `npm ci` → ilk setup (CI bunu kullanır)
- `npm run dev` → `node src/server.js` (JWT_SECRET zorunlu)
- `npx prisma generate` → Prisma client üret; test/build'den önce gerekir
- `npx prisma db push` → şemayı DB'ye uygula (dev reset `--force-reset`)
- `npm test` → `node --test` (tüm `tests/*.test.js`; DB servisi gerekir)
- `npm run lint` → eslint 10 (`eslint .`)
- `npm run format:check` → prettier kontrol
- `npm run format` → prettier fix
- **test sırası CI**: `format:check → lint → test`. Yerelde aynı sıra takip edin.
- `node --test` testleri çalıştırırken auth.js JWT_SECRET throw'ı tetiklenir → testler `process.env.JWT_SECRET` set edince dinamik import yapar (static import'dan önce env ayarlanmalı).

### Frontend (`frontend/`)
- `npm ci` → setup
- `npm run dev` → vite
- `npm run build` → prod build
- `npm test` → `vitest run` (JSdom ortamı)
- `npm run lint` → eslint 10
- `npm run format:check` / `format`

### Docker / dev stack (kok)
- Prod-benzeri: `docker compose up --build` → db (5433→5432 localhost) + migrate init + backend (nginx reverse proxy 5173) + frontend nginx serve (8080)
- Dev + hot reload: `docker compose -f compose.yaml -f compose.dev.yaml up --build` → frontend bind-mount dev server (5173)
- Tek giriş noktası: `localhost:5173`; `/api/` nginx proxy → `http://backend:4001`; backend portu host'ta kapalı (dev'de `127.0.0.1:4001` açılır)
- `migrate` init-servisi (`builder` target): `prisma db push --skip-generate && node src/seed.js`; backend `depends_on: service_completed_successfully` bekler

### Tek bir test / kısa doğrulama
- Backend tek test: `node --test tests/api.test.js`
- Tek node dosya: `node -e "..."`

## Geliştirme sırasında sık yapılan hatalar

- **CI sadece değişen paketi test eder**: frontend kodunda değişiklik yaptıysanız `backend` CI'si atlanabilir — fakat backend `src/auth.js` gibi paylaşıksız kodda değişiklik yapınca CI mutlaka backend'i koşar.
- **docker-compose'ta `:?`** interpolasyonu fail-fast ama bazı compose uygulamaları (podman-compose) uyarı verir; Docker Compose v2 hata verir. Backend JWT_SECRET olmadan da çöker — iki katmanda korunur.
- **`npm ci`** lockfile (`package-lock.json`) gerektirir; `npm install` değil.
- Prisma generate yapmadan `import @prisma/client` hata verir — `npm run prisma:generate` veya `npm ci && npx prisma generate` önce.

## PR / branch

- Branch: `git checkout -b fix/kisa-aciklama`
- PR aç: `gh pr create --title "..." --body "..."` (CI pipeline otomatik başlar)
- Takip: `gh pr checks <N> --watch`, sonra `gh pr merge <N> --merge --delete-branch` (squash yerine merge commit ile 2 commit korunur; istersen `--squash`).
- main protection için zorunlu: PR approve (0 onay yeterli, tek geliştirici) + `CI Pipeline Status` pass → merge butonu aktif.

## Pre-push kontrol (her push oncesi zorunlu)

`git push` oncesi `scripts/pre-push-check.sh` calistirilir. Script:
- `npm run format` (otomatik duzeltir)
- `npm run lint` (hata varsa durdurur)
- `npm run format:check`
- `npm test` (backend + frontend)
Basarisiz olursa push durdurulur, hata duzeltilip tekrar calistirilir.

## OpenCode notları

- Plan mode (read-only) default; build mode'u `build` komutuyla (ör. `npm test`) veya doğrulamaya geçince.
- `node -e` eval'lerken ESM `backend/` için `import(...)` dinamik kullan; statik `import` module graph'te env-set satırından önce çalışır (auth.js JWT_SECRET throw'unu tetikler).
- `.env`, `node_modules`, `dist` gitmez; `--pure` flag'i varsayılanları bypass eder.
