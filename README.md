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
- `compose.yaml` → Prod-benzeri base; `compose.dev.yaml` → Dev katmani (canli reload)
- `README.md` → (bu dosya)
- `ARCHITECTURE.md` → Mimari akış, Docker Compose, ortam değişkenleri ve demo veri standardı
- `AI_KOPRU_ENTEGRASYON.md` → Yapay zeka köprüsünün ayrıntıları

---

## 2. Gerekli programlar

- **Docker Desktop** (açık olmalı) — backend + PostgreSQL bunun üstünde çalışır.
- **Node.js 18+** — frontend için.
- (Yapay zeka özelliği istersen) **Python 3.12** + **LM Studio**.

---

## 3. Çalıştırma — 3 terminal

### Terminal 1 — Backend + Veritabanı
Prod-benzeri (tek komut):
```
cp .env.example .env    # sadece ilk sefer; icindeki sifreleri KENDI degerlerinle degistir
docker compose up --build
```
Dev + canli reload (bind-mount, vite dev server):
```
docker compose -f compose.yaml -f compose.dev.yaml up --build
```
Bu komut PostgreSQL'i acar, `migrate` servisi ile semayi uygular ve seed'i yukler; API nginx reverse proxy (`5173/api/`) arkasinda calisir. Backend dogrudan `localhost:4001` uzerinden acilmaz.

### Terminal 2 — Frontend (site)
Proje kökünde:
```
cd frontend && pnpm install        # sadece ilk sefer
pnpm run dev
```
Çıkan http://localhost:5173/ linkini tarayıcıda aç.

### Terminal 3 — Yapay Zeka Köprüsü (opsiyonel)
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

**Minimum çalıştırma:** Terminal 1 (docker compose up --build) + Terminal 2 (pnpm run dev) → localhost:5173.

---

## Windows kullanıcıları için

Tüm `scripts/*.sh` dosyalarının Windows `.bat` karşılıkları vardır. **PowerShell / cmd** içinde:

```
# Pre-push kontrolu (format, lint, test)
scripts\pre-push-check.bat

# Dev stack (hot reload)
scripts\run-dev.bat [--force]

# Prod-benzeri stack
scripts\run-prod.bat [--force]
```

Alternatif: **Git Bash** veya **WSL** kullanıyorsanız mevcut `.sh` dosyaları doğrudan çalışır.

Frontend/Backend bağımsız çalıştırma (Docker'sız):
```
# Backend
cd backend && pnpm install && pnpm run dev

# Frontend
cd frontend && pnpm install && pnpm run dev
```

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
```
node scripts/seed-coffee-project.mjs
```

---

## 7. Özet akış

1. `docker compose up --build` → backend + DB (4001)
2. `pnpm install` + `pnpm run dev` → site (5173)
3. (opsiyonel) `ai-bridge`'da uvicorn → AI köprüsü (8008) + LM Studio
4. Tarayıcı: http://localhost:5173

Kolay gelsin! Teknik ayrıntılar için ARCHITECTURE.md ve AI_KOPRU_ENTEGRASYON.md dosyalarına bak.
