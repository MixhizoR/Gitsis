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

- `src/` → Frontend (React + Vite) — site arayüzü
- `backend/` → API sunucusu (Express + Prisma) + veritabanı şeması
- `scripts/` → Örnek proje yükleyici (espresso kahve otomatı)
- `ai-bridge/` → Yapay Zeka motoru + köprü (Python, LM Studio/Gemma)
- `docker-compose.yml` → Backend + PostgreSQL'i tek komutla ayağa kaldırır
- `README.md` → (bu dosya)
- `README_TEKNIK.md` → Ayrıntılı teknik doküman
- `AI_KOPRU_ENTEGRASYON.md` → Yapay zeka köprüsünün ayrıntıları

---

## 2. Gerekli programlar

- **Docker Desktop** (açık olmalı) — backend + PostgreSQL bunun üstünde çalışır.
- **Node.js 18+** — frontend için.
- (Yapay zeka özelliği istersen) **Python 3.12** + **LM Studio**.

---

## 3. Çalıştırma — 3 terminal

### Terminal 1 — Backend + Veritabanı
Proje kökünde:
```
docker compose up --build
```
Bu komut PostgreSQL'i açar, tabloları OTOMATİK oluşturur, tek seferlik örnek
veriyi yükler ve API'yi http://localhost:4001 üzerinde çalıştırır.

### Terminal 2 — Frontend (site)
Proje kökünde:
```
npm install        # sadece ilk sefer
npm run dev
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

**Minimum çalıştırma:** Terminal 1 (docker compose up --build) + Terminal 2 (npm run dev) → localhost:5173.

---

## 4. Kendi bilgilerini nereye gireceksin (ÖNEMLİ)

Bu kopya varsayılan/nötr değerlerle geliyor. İstersen aşağıdakileri kendine göre değiştir:

- **Kullanıcı adı** (işlemlerde "yazan" olarak görünür): `src/utils/constants.js` → `CURRENT_USER` (varsayılan `ehsim.user`). Kendi adınla değiştir.
- **Veritabanı kullanıcı/şifre/isim**: `docker-compose.yml` içindeki `environment` blokları (varsayılan `ehsim / ehsim_pass / ehsim_rmt`). Değiştirirsen `DATABASE_URL`'i de aynı yap.
- **Backend bağlantısı (Docker'sız çalıştırma)**: `backend/.env.example` dosyasını kopyalayıp `backend/.env` yap. Sadece Docker kullanmıyorsan gerekli.
- **LM Studio model adı**: `ai-bridge/config.py` → `MODEL_NAME` (varsayılan `google/gemma-3-4b`). LM Studio'daki "API Model Identifier" ile birebir aynı olmalı.
- **Frontend adresleri (opsiyonel)**: Proje kökünde `.env` oluştur → `VITE_API_URL=http://localhost:4001` ve `VITE_AI_URL=http://localhost:8008`.

> **Güvenlik notu:** `docker-compose.yml` içindeki `ehsim_pass` sadece yerel
> geliştirme şifresidir. Gerçek/paylaşılan bir ortama kuracaksan mutlaka değiştir
> (hem `POSTGRES_PASSWORD` hem de `DATABASE_URL` içindeki şifreyi birlikte güncelle).

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
2. `npm install` + `npm run dev` → site (5173)
3. (opsiyonel) `ai-bridge`'da uvicorn → AI köprüsü (8008) + LM Studio
4. Tarayıcı: http://localhost:5173

Kolay gelsin! Teknik ayrıntılar için README_TEKNIK.md ve AI_KOPRU_ENTEGRASYON.md dosyalarına bak.
