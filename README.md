# EHSIM – GITSIS · Devralma (Handoff) Kılavuzu

Merhaba! Bu, **EHSIM – GITSIS** adlı Gereksinim Yönetimi ve İzlenebilirlik (RMT)
aracının devralınabilir, temizlenmiş bir kopyasıdır. DO-178C uyumlu; IBM DOORS'a
modern, web tabanlı bir alternatif. Bu dosya sana **nasıl çalıştıracağını** ve
**kendi bilgilerini nereye gireceğini** anlatır.

> Bu kopyadan çıkarılanlar (temizlik): `.git` geçmişi, `node_modules`,
> Python `.venv` klasörleri, `HuggingFaceEmbeddings` modeli ve önceki
> geliştiricinin kişisel kullanıcı adı. Hepsi aşağıda anlatıldığı gibi
> yeniden oluşturulabilir/ayarlanabilir.

---

## 1. Klasör yapısı

- `frontend/` → Frontend (React + Vite) — site arayüzü
- `backend/` → API sunucusu (Express + Prisma) + veritabanı şeması
- `scripts/` → Örnek proje yükleyici (espresso kahve otomatı)
- `ai-bridge/` → Yapay Zeka motoru + köprü (Python, LM Studio/Gemma)
- `compose.yaml` → Prod-benzeri base (hazır imajlar, yalnızca port 80); `compose.override.yaml` → Dev katmanı (build tanımları + ek portlar; `docker compose` tarafından **otomatik** uygulanır)
- `README.md` → (bu dosya)
- `ARCHITECTURE.md` → Mimari akış, Docker Compose, ortam değişkenleri ve demo veri standardı
- `AI_KOPRU_ENTEGRASYON.md` → Yapay zeka köprüsünün ayrıntıları

---

## 2. Gerekli programlar

- **Docker Desktop** (açık olmalı) — tüm stack (PostgreSQL + backend + frontend/nginx) bunun üstünde çalışır.
- **Node.js 18+** — yalnızca yerel geliştirme (Docker'sız) ve `seed-coffee-project.mjs` için.
- (Yapay zeka özelliği istersen) **Python 3.12** + **LM Studio**.

---

## 3. Çalıştırma

### Terminal 1 — Tüm stack (Docker, tek komut)
```
cp .env.example .env    # sadece ilk sefer; icindeki sifreleri KENDI degerlerinle degistir
docker compose up --build
```
`docker compose`, `compose.override.yaml` dosyasını **otomatik** uygular (ayrı `-f` bayrağı gerekmez). Bu komut:
- PostgreSQL'i açar; GUI araçları (DBeaver, DataGrip) için `localhost:5433`
- `migrate` servisi ile şemayı uygular ve seed'i yükler
- Frontend'i nginx üzerinden servis eder: http://localhost:5173 (ek olarak http://localhost:80)
- API'yi nginx reverse proxy (`/api/`) arkasında çalıştırır; backend host'a **hiç açılmaz** (`localhost:4001` dışarıdan erişilebilir değildir)

Prod-benzeri mod (override'suz, hazır imajlarla, yalnızca port 80):
```
docker compose -f compose.yaml up
```
Bu mod, dev modunda üretilen `ehsim-migrate/backend/frontend:latest` imajlarını kullanır; imajlar yoksa önce `docker compose build` çalıştır.

> **Not:** Docker'da frontend artık nginx ile servis edilen **derlenmiş** uygulamadır; canli reload (hot reload) yoktur. Frontend/backend üzerinde geliştirme yapacaksan aşağıdaki "Yerel geliştirme" akışını kullan.

### Yerel geliştirme — Docker'sız (opsiyonel, hot reload)
```
# 1) Veritabanı: Docker'da sadece db (override 5433 portunu açar)
docker compose up -d db

# 2) Backend: backend/.env.example -> backend/.env (DATABASE_URL localhost:5433'e baksın)
cd backend && pnpm install && pnpm run dev

# 3) Frontend: Vite, /api isteklerini localhost:4001'e proxy'ler
cd frontend && pnpm install && pnpm run dev
```

### Terminal 2 — Yapay Zeka Köprüsü (opsiyonel)
LM Studio'yu aç (Local Server + bir Gemma modeli yüklü olsun). Sonra:
```
cd ai-bridge
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn api_server:app --port 8008 --reload
```
Kontrol: http://localhost:8008/health → "lmstudio_reachable": true görürsen hazır.
Yapay zekayı kullanmayacaksan bu adımı atla; site yine tam çalışır ("Offline" motor mevcut).

**Minimum çalıştırma:** Terminal 1 (`docker compose up --build`) → http://localhost:5173. Başka terminal gerekmez.

---

## Windows kullanıcıları için

`run-dev` ve `run-prod` betikleri `.bat` (cmd) ve `.ps1` (PowerShell) olarak mevcuttur. **PowerShell / cmd** içinde:

```
# Pre-push kontrolu (format, lint, test)
scripts\pre-push-check.bat      # Git Bash/WSL: scripts/pre-push-check.sh

# Dev stack (build + tum portlar: 5173, 5433, 80)
scripts\run-dev.bat [--force]   # PowerShell: scripts\run-dev.ps1 -Force

# Prod-benzeri stack
scripts\run-prod.bat [--force]  # PowerShell: scripts\run-prod.ps1 -Force
```

> `--force` / `-Force` önce `docker compose down -v` çalıştırır ve **tüm veriyi siler**.

> Not: `seed-coffee-project.mjs` Node.js scriptidir, `node scripts/seed-coffee-project.mjs` ile her platformda çalışır.

---

## 4. Kendi bilgilerini nereye gireceksin (ÖNEMLİ)

Bu kopya varsayılan/nötr değerlerle geliyor. İstersen aşağıdakileri kendine göre değiştir:

- **Kullanıcı adı** (işlemlerde "yazan" olarak görünür): `frontend/src/utils/constants.js` → `CURRENT_USER` (varsayılan `ehsim.user`). Kendi adınla değiştir.
- **Veritabanı kullanıcı/şifre/isim**: Şifre kök `.env`'den (`POSTGRES_PASSWORD`); `compose.yaml` bunu DB'ye ve backend `DATABASE_URL`'ine enjekte eder. Kullanıcı (`ehsim`) ve veritabanı adı (`ehsim_rmt`) compose içindedir.
- **JWT imzalama anahtarı**: Kök `.env` içindeki `JWT_SECRET`. Tanımsızsa backend `JWT_SECRET is required` hatasıyla açılmaz. Üretmek için: `openssl rand -base64 48`.
- **Backend bağlantısı (Docker'sız çalıştırma)**: `backend/.env.example` dosyasını kopyalayıp `backend/.env` yap. Sadece Docker kullanmıyorsan gerekli.
- **LM Studio model adı**: `ai-bridge/config.py` → `MODEL_NAME` (varsayılan `google/gemma-3-4b`). LM Studio'daki "API Model Identifier" ile birebir aynı olmalı.
- **Frontend adresleri (opsiyonel)**: `frontend/.env.example` dosyasını kopyalayıp `frontend/.env` yap → `VITE_API_URL=http://localhost:4001`, `VITE_AI_URL=http://localhost:8008`.

> **Güvenlik notu:** Tüm hassas değerler (DB şifresi, JWT anahtarı, PM kayıt
> anahtarı) Git'e girmeyen `.env` dosyalarında tutulur; repoda yalnızca
> `.env.example` şablonları vardır. Gerçek bir ortama kurarken placeholder
> değerleri mutlaka uzun ve rastgele değerlerle değiştir.

> **Geçmiş uyarısı:** Eski commit'lerde eski yerel şifre (`ehsim_pass`) ve dev
> JWT fallback değeri hâlâ görünür durumdadır. Bu depoyu paylaşılan/açık bir
> ortama taşımadan önce bu değerleri rotate et; gerekirse geçmişi temizle
> (`git filter-repo`) veya depoyu sıfır geçmişle yeniden oluştur.

---

## 5. Veri kalıcılığı ve sıfırlama

- Tüm veriler PostgreSQL'in Docker volume'ünde kalıcıdır; PC kapansa da durur.
- Tamamen sıfırlamak (tüm veriyi silmek) istersen: `docker compose down -v`
- Sadece `docker compose down` dersen veriler korunur.

---

## 6. Örnek proje (isteğe bağlı)

Backend ayaktayken, örnek "Espresso Kahve Otomatı" projesini (58 gereksinim,
32 test, %100 izlenebilirlik) yüklemek/onarmak için:

> **Not:** Backend artık host'a açık değil; script'in nginx reverse proxy'si
> üzerinden gitmesi için `API_BASE` belirtilmelidir.

```bash
# Docker stack ayaktayken (nginx /api proxy'si üzerinden):
API_BASE=http://localhost:5173/api node scripts/seed-coffee-project.mjs

# PowerShell:
$env:API_BASE = "http://localhost:5173/api"; node scripts/seed-coffee-project.mjs
```

---

## 7. Özet akış

1. `cp .env.example .env` (ilk sefer) + `docker compose up --build` → DB + migrate/seed + backend + frontend (nginx)
2. Tarayıcı: http://localhost:5173 (override ile; prod-benzeri modda http://localhost)
3. (opsiyonel) `ai-bridge`'da uvicorn → AI köprüsü (8008) + LM Studio
4. (opsiyonel) Yerel geliştirme (hot reload): "Yerel geliştirme — Docker'sız" akışı

Kolay gelsin! Teknik ayrıntılar için ARCHITECTURE.md ve AI_KOPRU_ENTEGRASYON.md dosyalarına bak.
