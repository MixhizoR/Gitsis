# EHSIM · AI Belge Analizi Köprüsü — Entegrasyon Kılavuzu

Arkadaşının LM Studio + Gemma motorunu, **mevcut sistemin veritabanını ve
hiyerarşisini hiç bozmadan** modern arayüze bağlayan "köprü" mimarisi.

## Mimari (tek bakışta)

```
 [Kullanıcı]  ──►  Modern UI  ──►  aiEngineService.js  ──►  api_server.py (FastAPI)
                (AI Belge Analizi)   (fetch, :8008)          │   └─ LM Studio + Gemma (:1234)
                     │                                        │
                     │  ◄── temiz JSON: [{type,title,description}] ◄──┘
                     ▼
              "Seç + Sisteme Ekle"
                     │
                     ▼
        addRequirement()  ──►  MEVCUT Express/Prisma backend (:4001)  ──►  PostgreSQL
                                (senin hazır Create API'n — DEĞİŞMEDİ)
```

**Ayrım net:** AI motoru yalnızca *okur ve gereksinim üretir*. Veritabanına yazma
ve test eşleştirme (Verify/Satisfy) işine **girmez** — o işler her zamanki gibi
senin mevcut API'nle ve elle yapılır.

---

## Ne eklendi / ne değişti

**Yeni (arkadaşının klasörü `ai-bridge/`):**
- `api_server.py` — PDF/HTML/tkinter üretmeyen, sadece JSON dönen hafif FastAPI.
  Arkadaşının `config.py`'sini (LM Studio adresi + model) aynen kullanır.

**Yeni (frontend):**
- `src/services/aiEngineService.js` — motora bağlanan köprü servisi (`analyze`,
  `regenerate`, `ping`).

**Değişen (frontend, geriye uyumlu):**
- `src/pages/DocumentAnalysis.jsx` — motor seçici (Online Gemma / Offline),
  adet girişleri, satır başına **Sil** + **Yeniden Üret**. Eski offline motor
  ve "Seçilenleri İçe Aktar" akışı **aynen** duruyor.
- `src/i18n/translations.js` — yeni arayüz metinleri (TR + EN).

**Hiç dokunulmayan:** backend (Express/Prisma), veritabanı şeması, `addRequirement`,
gereksinim/hiyerarşi/link mantığı. Yani çalışan düzen korunuyor.

---

## Kurulum — adım adım

### 1) AI köprü servisini kur (arkadaşının PC'sinde / motorun olduğu makinede)

`ai-bridge/` klasöründe, mevcut sanal ortamı kullanarak:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 2) LM Studio'yu hazırla
- LM Studio açık olmalı ve **Local Server** çalışıyor olmalı (varsayılan `:1234`).
- `config.py` içindeki `MODEL_NAME` ile **aynı isimli** model yüklü olmalı
  (varsayılan `google_gemma-3-4b-it`).

### 3) Köprüyü başlat

```powershell
.\.venv\Scripts\python.exe -m uvicorn api_server:app --host 0.0.0.0 --port 8008
```

Test et: tarayıcıda `http://localhost:8008/health` →
`{ "lmstudio_reachable": true, "model": "..." }` görmelisin.

### 4) Frontend'i motora yönlendir
Motor **aynı makinedeyse** hiçbir şey yapmana gerek yok (varsayılan
`http://localhost:8008`).

Motor **başka makinedeyse**, proje kökünde `.env` dosyasına ekle:

```
VITE_AI_URL=http://<motorun-ip-adresi>:8008
```

Sonra Vite'ı yeniden başlat (`pnpm run dev`).

---

## Kullanım akışı

1. Sol menü → **AI Belge Analizi**.
2. Üstte motoru seç: **Yapay Zeka (Gemma)**. Yeşil "Motor bağlı" yazısını gör.
3. Kaç adet **Kullanıcı / Sistem / Alt Sistem** gereksinimi istediğini gir.
4. PDF yükle **veya** metni yapıştır → **Yapay Zeka ile Üret**.
5. Kartlar/tabloda gelen gereksinimler listelenir:
   - Beğenmediğini **Sil**.
   - Zayıf olanı **Yeniden Üret** (aynı belgeden, tekrar etmeden yenisini üretir).
   - Tip/Alan'ı satırdan değiştir (örn. Alt Sistem → Donanım).
6. Beğendiklerini işaretle → **Seçilenleri İçe Aktar**. Bunlar mevcut
   `addRequirement` ile **gerçek veritabanına Taslak** olarak eklenir.
7. Test eşleştirmelerini (Verify/Satisfy) her zamanki gibi sistemin kendi
   ekranlarından elle yaparsın.

> **Offline motor** hâlâ duruyor: internet/LM Studio yokken "Yerel Motor"a geçip
> aynı akışı DO-178C kalite puanıyla kullanabilirsin.

---

## API uçları (özet)

| Uç | Girdi | Çıktı |
|----|-------|-------|
| `GET /health` | — | `{ ok, model, lmstudio_reachable, pymupdf }` |
| `POST /analyze` | multipart: `file` (PDF) **veya** `text`; `n_user`, `n_system`, `n_subsystem` | `{ summary, requirements:[{id,level,type,title,description}] }` |
| `POST /regenerate` | json: `{ level, source_text, avoid:[...] }` | `{ requirement:{...} }` |

`type` alanı doğrudan sistemin değerleriyle döner: `User/System/Software Requirement`.

---

## Güvenlik / bozulmazlık notları
- Köprü servisi veritabanına **hiç** bağlanmaz; yalnızca LM Studio'ya HTTP atar.
- Frontend'in içe aktarma yolu değişmedi; aynı `addRequirement` → aynı backend.
- Motor kapalıyken sayfa hata verip durur; mevcut veriler etkilenmez.
- İstersen tamamen **Offline** motora dönebilirsin; köprü olmadan da site çalışır.
