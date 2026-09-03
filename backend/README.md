# EHSIM - GITSIS / RMT — Backend (PostgreSQL + Express + Prisma)

Kurumsal, kalıcı veri katmanı. Tüm veri **proje bazlı** izole edilir ve
PostgreSQL volume'unda **kalıcı** tutulur (site her açıldığında veri korunur;
seed yalnızca boş veri tabanında **bir kez** yüklenir).

## Çalıştırma (Docker — önerilen)

Proje kök dizininde:

```bash
docker compose up --build
```

Bu komut sırasıyla:
1. PostgreSQL 15'i ayağa kaldırır (`ehsim_pgdata` volume ile kalıcı),
2. `prisma db push` ile tabloları otomatik oluşturur,
3. `seed.js` ile resmi seti (**72 gereksinim + 16 test + 58 bağ**) **tek sefer** yükler,
4. API'yi `http://localhost:4001` üzerinde başlatır.

Durdurma (veri korunur): `docker compose down`
Sıfırdan başlat (veri **silinir**): `docker compose down -v`

## Çalıştırma (Docker'sız, yerel)

```bash
cd backend
cp .env.example .env          # DATABASE_URL'i kendi Postgres'inize göre düzenleyin
pnpm install
pnpm run db:push               # tabloları oluştur
pnpm run seed                  # tek seferlik resmi seed
pnpm start                     # http://localhost:4001
```

## Veri modeli (Prisma)

`Users, Projects, ProjectFields, Requirements, TestCases, TraceabilityLinks,
GlossaryTerms, AuditLogs` — hepsi `prisma/schema.prisma` içinde.

Taksonomi: **User → System → Sub-system (Software / Hardware)** gereksinimleri;
**Acceptance / System / Sub-system** testleri; bağlar `Satisfies` / `Verifies` /
`Assigned To`.

## API özeti (taban: `/api`)

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/health` | Sağlık kontrolü |
| POST | `/auth/register`, `/auth/login` | Kayıt / giriş |
| GET/POST | `/projects` | Proje listesi / oluştur |
| GET/PATCH/DELETE | `/projects/:pid` | Proje oku / güncelle / sil |
| GET/POST/DELETE | `/projects/:pid/fields[/:id]` | Dinamik "Alan" seçenekleri |
| GET/POST/PUT/DELETE | `/projects/:pid/requirements[/:id]` | Gereksinim CRUD |
| GET/POST/PUT/DELETE | `/projects/:pid/testcases[/:id]` | Test CRUD (durum: Passed/Failed/In Review) |
| GET/POST/PUT/DELETE | `/projects/:pid/glossary[/:id]` | Sözlük |
| GET/POST/DELETE | `/projects/:pid/links[/:id]` | İzlenebilirlik bağları (doğrulamalı) |
| GET/POST | `/projects/:pid/audit` | Değişiklik tarihçesi |
| POST | `/projects/:pid/recompute` | Cascade durum yeniden hesabı |

### İş kuralları (sunucu tarafında zorunlu)
- **Kilitli tip:** gereksinim tipi güncellemede değiştirilemez.
- **Kilitli durum:** gereksinim durumu elle set edilemez; yalnızca bağlı testlerden
  otomatik hesaplanır. Test bağlı değilse `In Review`.
- **Strict Verifies:** Acceptance→User, System→System, Sub-system→Software/Hardware.
  Bir test yalnızca **tek** gereksinimi doğrular.
- **Otomatik alan eşleme:** Verifies bağı kurulunca testin `field/priority/dal_level`
  değerleri gereksinimden kopyalanır; seçilen test durumu (`testStatus`) teste yazılır.
- **Cascade:** bağlı testlerden en az biri `Rejected` ise gereksinim `Rejected`;
  hepsi `Approved` ise `Approved`; aksi halde `In Review`.

## Varsayılan giriş
`admin / admin` (seed ile oluşur).

> **Not:** Frontend'in bu backend'e bağlanması **Faz 2**'de yapılacak
> (`src/services/api.js` + proje bağlamı). Şu an frontend hâlâ json-server'a
> bakıyor; migrasyon sıradaki adımdır.
