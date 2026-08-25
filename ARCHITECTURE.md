# EHSIM – GITSIS · Mimari ve Çalıştırma Kılavuzu (ARCHITECTURE)

Bu belge, EHSIM – GITSIS gereksinim yönetim aracının (IBM DOORS alternatifi,
DO-178C uyumlu RMT) güncel mimarisini, çalıştırma adımlarını, ortam değişkenlerini
ve demo veri standardını açıklar.

---

## 1. Mimari akış

```
 Tarayıcı                        Backend                          Veritabanı
┌──────────────────┐   HTTP/JSON  ┌────────────────────┐  Prisma  ┌─────────────┐
│ React + Vite     │ ───────────► │ Express REST API   │ ───────► │ PostgreSQL15│
│ (frontend :5173) │  JWT Bearer  │ (backend :4001)    │          │ (db, volume)│
│  src/services/   │ ◄─────────── │  requireAuth +     │ ◄─────── │             │
│  apiClient.js    │   JSON       │  projectAccessGuard│  tek DB  └─────────────┘
└───────┬──────────┘              └────────────────────┘
        │                                   ▲
        │ (opsiyonel AI analizi)            │ docker compose ile otomatik:
        ▼                                   │ prisma db push + seed.js + start
┌──────────────────────┐    HTTP    ┌──────────────────────┐
│ aiEngineService.js   │ ─────────► │ FastAPI köprüsü      │ ───────► LM Studio
│ (frontend)           │            │ ai-bridge/api_server │          Gemma (:1234)
│ Online motor seçiliyken           │ .py (:8008)          │          (yerel LLM)
└──────────────────────┘            └──────────────────────┘
```

Katmanlar:

| Katman | Teknoloji | Sorumluluk |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind | UI; tüm veri erişimi `src/services/apiClient.js` üzerinden |
| Backend | Node.js + Express + Prisma | Proje-bazlı izole REST API; JWT kimlik doğrulama; **IDOR koruması** (`projectAccessGuard` — personel yalnız atandığı projeye erişir); audit log |
| Veritabanı | PostgreSQL 15 (Docker volume) | Kalıcı depo; `docker compose down -v` ile silinir |
| AI köprüsü *(opsiyonel)* | Python FastAPI (`ai-bridge/`) | PDF/metin → gereksinim taslağı; yalnız LM Studio'ya HTTP atar, DB'ye bağlanmaz |

Ayrıntılı AI köprüsü kurulumu: `AI_KOPRU_ENTEGRASYON.md`

---

## 2. Docker Compose ile çalıştırma

```bash
docker compose up --build
```

Tek komutla üç servis ayağa kalkar:

| Servis | Container | Port | Not |
|---|---|---|---|
| `db` | `ehsim_pg` | 127.0.0.1:**5433** → 5432 | Postgres yalnız localhost'a açık; host içinden bağlanacaksan 5433 kullan |
| `backend` | `ehsim_api` | **4001** | Sırasıyla: `prisma db push` (tabloları oluşturur) → `seed.js` (**yalnız boş DB'de**) → sunucu |
| `frontend` | `ehsim_web` | **5173** | Üretilmiş build'i servis eder |

Ardından tarayıcıda `http://localhost:5173` açılır.

- **Veri kalıcılığı:** Tüm veriler `ehsim_pgdata` volume'ünde durur; PC kapansa da kalır.
  - Yalnızca durdurma: `docker compose down` (veri korunur)
  - Tam sıfırlama: `docker compose down -v` (bir sonraki açılışta seed yeniden yüklenir)

Geliştirme modunda çalıştırmak istersen (hot-reload):

```bash
# Terminal 1 — backend + db
docker compose up db backend
cd backend && npm install && npm run dev        # :4001

# Terminal 2 — frontend
cd frontend && npm install && npm run dev       # :5173
```

Docker'sız backend çalıştırması için `backend/.env` gerekir (bkz. §4).

---

## 3. Varsayılan yönetici hesabı

| Alan | Değer | Koşul |
|---|---|---|
| Kullanıcı adı | `admin` | `seed.js`, **yalnızca Users tablosu tamamen boşken** oluşturur |
| Parola | `admin` | Parola hash'lenerek saklanır (bcrypt) |
| Rol | Proje Yöneticisi (PM) | Tüm projelere erişir; yeni PM kaydı açabilir |

> Paylaşılan/bulut bir ortama kuruyorsan: ilk girişten sonra parolayı değiştir ve
> `JWT_SECRET`'i rastgele, uzun bir değerle değiştir (bkz. §4).

Yeni bir PM hesabı açmanın ikinci yolu: `PM_REGISTRATION_KEY` ortam değişkenine
gizli bir değer yazıp `POST /api/auth/register` çağrısında aynı değeri
`x-registration-key` başlığıyla göndermek. Anahtar boşsa kayıt uç noktası kapalıdır
(varsayılan, güvenli).

Personel (proje çalışanı) girişi parola yerine **passcode** ile yapılır:
`POST /api/auth/passcode` → personel doğrudan atandığı projeye düşer.

---

## 4. Ortam değişkenleri

### backend

| Değişken | Zorunlu? | Varsayılan / Örnek | Açıklama |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://ehsim:<POSTGRES_PASSWORD>@db:5432/ehsim_rmt?schema=public` — compose, şifreyi kök `.env`'den enjekte eder | Prisma bağlantısı; Docker dışında host portu **5433**'tür |
| `PORT` | — | `4001` | API portu |
| `JWT_SECRET` | ✅ (her ortamda) | yok — tanımsızsa process `JWT_SECRET is required` ile durur. Örn: `openssl rand -base64 48` | Token imzalama anahtarı |
| `PM_REGISTRATION_KEY` | — | `""` (boş = register **kapalı**) | Yeni PM kaydını açmak için gizli anahtar |

> Hassas değerler repoda tutulmaz: kök dizindeki `.env` (compose interpolasyonu)
> ve servis-yerel `.env` dosyaları Git dışıdır; yalnızca `.env.example`
> şablonları takiptedir.

### frontend

| Değişken | Zorunlu? | Varsayılan | Açıklama |
|---|---|---|---|
| `VITE_API_URL` | — | `http://localhost:4001` | Backend adresi (Vite build-time okur) |
| `VITE_AI_URL` | — | `http://localhost:8008` | AI köprüsü adresi (Online motor kullanılıyorsa) |

### ai-bridge (opsiyonel)

| Değişken | Zorunlu? | Varsayılan | Açıklama |
|---|---|---|---|
| `LMSTUDIO_URL` | — | `http://localhost:1234/v1` | LM Studio yerel sunucu adresi (`ai-bridge/config.py`) |

Model kimliği `ai-bridge/config.py` → `MODEL_NAME` içinde tutulur (varsayılan
`google/gemma-3-4b`); LM Studio'daki "API Model Identifier" ile birebir aynı olmalıdır.

---

## 5. Demo veri standardı (resmi karar)

Projede iki demo seti vardır ve rolleri nettir:

### ✅ Resmi demo — Drone/İHA projesi

- **Kaynak:** `backend/src/seed.js`
- **Kapsam:** 72 gereksinim (12 User + 20 System + 24 Software + 16 Hardware),
  16 test senaryosu (5 Acceptance + 6 System + 5 Sub-system), 58 izlenebilirlik bağı
- **Çalıştırma:** `docker compose up` sırasında **otomatik**; yalnızca veritabanı
  tamamen boşsa yükler (idempotent). Manuel için: `cd backend && npm run seed`
- **Amaç:** Yeni kurulumda kutudan çıkan standart referans proje

### 🔧 Opsiyonel ikinci demo — Espresso Bazlı Kahve Otomatı

- **Kaynak:** `scripts/seed-coffee-project.mjs`
- **Kapsam:** 58 gereksinim + 32 test + 119 bağ (Satisfies/Verifies/Assigned To),
  sözlük, roller, personel — **API üzerinden** yüklenir
- **Çalıştırma:** backend ayaktayken `node scripts/seed-coffee-project.mjs`
  (script önce `admin/admin` ile giriş yapar; `SEED_USERNAME`/`SEED_PASSWORD` ile
  geçilebilir)
- **Davranış:** İdempotent "onarım modu" — aynı adlı proje varsa mevcut nesnelere
  dokunmadan eksik bağları tamamlar
- **Amaç:** Çok projeli kullanım, rol/personel matrisleri ve onarım akışını göstermek

> **Kural:** Yeni kurulumlarda yalnız Drone projesi otomatik gelir. Espresso projesi
> asla otomatik yüklenmez; isteyen manuel ekler. İki demo farklı `projectId`
> alanlarında yaşadığı için veri çakışması söz konusu değildir.

---

## 6. AI motorları — Offline vs Online (Belge Analizi sayfası)

`DocumentAnalysis` sayfasındaki motor seçicinin arkasındaki iki farklı mimari:

| | 🟢 Offline motor | 🔵 Online motor (Gemma) |
|---|---|---|
| Kod yolu | `src/services/aiService.js` | `src/services/aiEngineService.js` → `POST /analyze`, `POST /regenerate` |
| Altyapı | Tarayıcı içinde, saf kural/regex tabanlı | `ai-bridge/api_server.py` (FastAPI :8008) → LM Studio/Gemma (:1234) |
| Bağlantı | **Hiç yok** — internet/LM Studio gerekmez | Köprü servisi + yüklenmiş model şart; `/health` ping'iyle durum kontrolü |
| Yöntem | Belirsizlik (vagueness) desen taraması, zorunluluk ifadesi/ölçülebilirlik sezgiselleri, tip & disiplin tahmini; DO-178C test edilebilirlik skorlaması | LLM'in PDF/metinden gereksinim taslağı üretmesi; özet + seviye bazlı adet kontrolü |
| Satır bazlı "Yeniden Üret" | ❌ | ✅ (aynı kaynaktan, daha önce üretilenlerden kaçınarak) |
| Ne zaman? | Demo, eğitim, offline saha kullanımı, hızlı tutarlılık denetimi | Gerçek belgelerden yüksek kaliteli taslak üretimi |

İki motor da **yalnızca okur/üretir**: sonuçlar "Seç + Sisteme Ekle" ile mevcut
`addRequirement` akışına girer; veritabanına doğrudan yazmaz.

---

## 7. Test ve CI

| Paket | Çalıştırıcı | Komut | Kapsam |
|---|---|---|---|
| frontend | Vitest + Testing Library | `npm test` | Saf fonksiyon regresyonları (`coverage`, `impact`, `splitSegments`) + RTL smoke (22 test) |
| backend | node:test + supertest | `npm test` | `/auth/login`, passcode, IDOR koruması (7 test; lokalde `docker compose up -d db` gerekir) |
| her ikisi | ESLint 9 + Prettier | `npm run lint`, `npm run format:check` | Kullanılmayan import/değişken = hata; format sapması = hata |

CI: `.github/workflows/ci.yml` — push/PR'da her iki paket için format → lint →
test → (frontend) build koşar; backend job'ı postgres service container kullanır.
