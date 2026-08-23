# EHSIM · RMT — Requirements Management & Traceability Tool

> IBM DOORS esinli, **web tabanli**, modern ve kullanici dostu bir **Gereksinim Yonetim ve Izlenebilirlik Takip Araci** (MVP).
> Savunma sanayi / havacilik projeleri icin DO-178C izlenebilirlik mantigini simule eder.

![tech](https://img.shields.io/badge/Vite-5-646CFF) ![tech](https://img.shields.io/badge/React-18-61DAFB) ![tech](https://img.shields.io/badge/TailwindCSS-3-38BDF8) ![data](https://img.shields.io/badge/Veri-json--server%20(db.json)-22C55E)

---

## 1. Projenin Amaci

Bu uygulama; sistem, yazilim ve donanim gereksinimlerinin tek bir yerden yonetildigi,
aralarinda **cift yonlu izlenebilirlik** (traceability) baglari kurulabildigi ve
**DO-178C** standardina gore test kapsami analizinin yapilabildigi bir arac sunar.

Tasarim hedefi **"sifir kurulum / tak-calistir"**: Sunum yapilacak bilgisayarda
**Docker, SQL veya harici bir veritabani sunucusu kurulu olmasina gerek yoktur.** Veri,
proje kokundeki **`db.json`** dosyasinda KALICI olarak tutulur ve **json-server** uzerinden
yerel bir **REST API** (Axios) ile okunup yazilir. Boylece sayfa yenilense veya tarayici
kapanip acilsa bile veri kaybolmaz. `db.json` bos/eksikse ilk acilista anlamli bir demo
veri seti (10 sistem + 46 alt + 16 test + kullanici hesaplari) otomatik tohumlanir.

### Ana Yetenekler

- **Gelismis Gereksinim Semasi** — `id`, `text_id` (REQ-SYS-001 ...), baslik, tanim, tip,
  **alan/disiplin (category)**, oncelik, durum ve **DAL** (DO-178C Tasarim Guvence Seviyesi).
- **V-Model veri seti** — 10 sistem gereksinimi, bunlardan turetilen ~46 yazilim/donanim
  alt gereksinimi ve 16 test senaryosu; **Arayuz/HMI, Yazilim, Donanim, Veritabani,
  Sunucu/Altyapi, Haberlesme, Guvenlik, Performans** disiplinlerine dagitilmistir.
- **Filtrelenebilir gereksinim tablosu** — arama + tip/**alan**/durum/oncelik/DAL filtreleri.
- **Cift Yonlu Izlenebilirlik** — `Satisfies` (Software → System) ve `Verifies`
  (Test Case → Requirement) bag tipleri; Link / Unlink islemleri.
- **Izlenebilirlik Matrisi** — tum iliskileri kus bakisi gosteren iki matris tablosu.
- **DO-178C Kapsam Raporu** — hicbir test senaryosuna baglanmamis ("ucu acik")
  gereksinimleri tespit eden **Kritik Guvenlik Acigi Raporu** + **Traceability % Score**.
- **AI Belge Analizi (offline)** — yuklenen bir belgeyi (`.txt .md .csv .json .pdf` veya
  yapistirilan metin) **internet olmadan** okur; gereksinim cumlelerini bulur, **tip ve
  alan** tahmini yapar, her birini DO-178C kalite kurallarina gore puanlar ve secilenleri
  tek tikla uygulamaya (Taslak olarak) aktarir.
- **Rol bazli yetki** — Sistem Muhendisi (tum yetkiler) ve Geliştirici (kisitli) rolleri;
  giris ekrani + oturum yonetimi.
- **Audit Log (Degisiklik Tarihcesi)** — her mutasyon (olusturma, guncelleme, silme,
  bag kurma/koparma) kim/ne zaman/eski→yeni deger bilgisiyle kaydedilir.
- **Yerel AI Asistan** — sayfalar arasi niyet (intent) tabanli yonlendirme; tamamen offline.
- **Koyu / Acik tema** ve havacilik ciddiyetine uygun, sade endustriyel arayuz.

---

## 2. Esnek Mimari (Data Abstraction) — Teknik Aciklama

Projenin en kritik tasarim ilkesi, **arayuzun (UI) verinin nereden geldigini bilmemesidir.**
Veri akisi tek yonlu ve katmanlidir:

```
  UI (pages / components)
        │   sadece context action'larini cagirir
        ▼
  AppContext  (src/context/AppContext.jsx)   →  merkezi durum (state)
        │   sadece servisleri cagirir
        ▼
  services/   (requirementsService, linksService, auditService)
        │   sadece db adaptorunu cagirir
        ▼
  db.js       (src/services/db.js)   →  TEK fiziksel veri erisim noktasi
        │   koleksiyon-seviyesi read/write  →  api.js (Axios) diff-senkronu
        ▼
  api.js  →  json-server REST  →  [ db.json ]   ⇄   ileride →   [ PostgreSQL / SQLite ]
```

### Neden bu yapi?

Yarin yetkili muhendisler **"bunu gercek bir SQL/PostgreSQL veritabanina baglayalim"**
dediginde, **arayuze hic dokunmadan** yalnizca `src/services/db.js` icindeki `adapter`
nesnesinin govdesini degistirmeniz yeterlidir. Ust katmanlar (`services`, `context`, tum
ekranlar) ayni fonksiyon imzalarini (`read`, `write`, ...) cagirmaya devam eder.

`db.js` artik **`restAdapter`** (json-server + Axios) ile calisir; `src/services/api.js`
tum HTTP cikis noktasidir. json-server koleksiyon-seviyesi PUT desteklemedigi icin
`api.js` icindeki `replaceCollection` bir **diff senkronu** yapar: sunucudaki mevcut durumu
istenen durumla karsilastirip yalnizca gereken POST/PUT/DELETE cagrilarini gonderir.
Boylece ust katman hala "tum koleksiyonu yaz" mantigiyla calisir. Baska bir backend'e
gecmek icin yalnizca `db.js` icindeki `const adapter = restAdapter` satirini degistirmeniz
yeterlidir; servis fonksiyonlari bilerek `async/await` ile yazilmistir.

---

## 3. Klasor Yapisi

```
ehsim_proje/
├── index.html                 # Vite giris HTML'i
├── db.json                     # KALICI veri (json-server kaynagi: requirements/links/audit/retired/users)
├── package.json               # Bagimliliklar ve script'ler (dev = vite + json-server)
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── README.md
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx               # React giris noktasi (AppProvider ile sarmalar)
    ├── App.jsx                # Uygulama kabugu + sayfa yonlendirme
    ├── index.css              # Tailwind + global stiller / bilesen siniflari
    │
    ├── context/
    │   └── AppContext.jsx     # Merkezi state + action'lar + tema yonetimi
    │
    ├── services/              # ── VERI KATMANI (UI'dan bagimsiz) ──
    │   ├── db.js              #   Soyut storage adaptoru (DEGISTIRME NOKTASI)
    │   ├── api.js             #   Axios REST istemcisi (json-server) + diff-senkronu
    │   ├── requirementsService.js  # Gereksinim CRUD + otomatik durum + omur boyu benzersiz kod
    │   ├── linksService.js    #   Izlenebilirlik bag islemleri (DO-178C dogrulama)
    │   ├── authService.js     #   Kullanici (users) kimlik dogrulama veri servisi
    │   ├── auditService.js    #   Audit Log kayitlari
    │   ├── aiService.js       #   Yerel DO-178C gereksinim kalite analizi (offline)
    │   ├── documentService.js #   Offline belge analiz motoru (gereksinim cikarimi)
    │   ├── assistantService.js#   Akilli AI asistan niyet (intent) motoru (filtre + aksiyon)
    │   ├── bootstrap.js       #   Ilk acilista demo veri yukleme (seed)
    │   └── seedData.js        #   V-model aviyonik veri seti (10 sistem → 46 alt → 16 test)
    │
    ├── utils/
    │   ├── constants.js       # Enum'lar, bag kurallari, stil eslemeleri
    │   ├── coverage.js        # DO-178C kapsam analizi (saf fonksiyonlar)
    │   └── format.js          # Tarih / metin bicimlendirme
    │
    ├── components/
    │   ├── common/            # Badge, Modal, StatCard, Icons (genel UI)
    │   ├── layout/            # Sidebar, Topbar
    │   ├── requirements/      # RequirementForm, Filters, Table
    │   └── traceability/      # LinkManager, TraceabilityMatrix
    │
    └── pages/
        ├── Dashboard.jsx
        ├── Requirements.jsx
        ├── Traceability.jsx
        ├── CoverageReport.jsx
        ├── DocumentAnalysis.jsx   # AI Belge Analizi (offline gereksinim cikarimi)
        ├── Login.jsx
        └── AuditLog.jsx
```

---

## 4. Kurulum ve Calistirma (VS Code Terminali)

> Gereksinim: **Node.js 18+** (kontrol: `node -v`). Baska hicbir sey gerekmez.

Bu proje klasoru zaten hazirdir. VS Code'da klasoru acin, terminali baslatin ve sirayla:

```bash
# 1) Proje klasorune girin (zaten icindeyseniz atlayin)
cd ehsim_proje

# 2) Bagimliliklari yukleyin (bir kerelik)
npm install

# 3) Gelistirme ortamini baslatin (TEK KOMUT)
npm run dev
```

`npm run dev`, **concurrently** ile iki sureci ayni anda baslatir:

| Surec | Komut | Adres | Gorev |
|-------|-------|-------|-------|
| **WEB** | `vite`                              | `http://localhost:5173` | React arayuzu |
| **API** | `json-server --watch db.json --port 4001` | `http://localhost:4001` | Kalici REST veri katmani (`db.json`) |

Tarayici otomatik `http://localhost:5173` adresinde acilir. Arayuz, veriyi `4001`
portundaki json-server'dan Axios ile okur/yazar. Istersen iki sureci ayri ayri da
calistirabilirsin:

```bash
npm run server   # yalnizca json-server (port 4001)
npm run web      # yalnizca Vite (port 5173)
```

> **Onemli:** Arayuzun veriye erisebilmesi icin json-server'in (`4001`) calisiyor olmasi
> gerekir. `npm run dev` ikisini birden baslattigi icin normalde elle bir sey yapmana
> gerek yoktur. API adresini degistirmek istersen `.env` icine `VITE_API_URL=...` ekle.

> **Kalicilik:** Tum degisiklikler dogrudan proje kokundeki `db.json` dosyasina yazilir.
> "Demo Sifirla" islemi gereksinim/bag/audit/retired koleksiyonlarini resmi seed'e dondurur;
> **kullanici hesaplari (`users`) korunur.**

### Sifirdan yeni bir projeden olusturmak isterseniz (alternatif)

```bash
npm create vite@latest ehsim_proje -- --template react
cd ehsim_proje
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
# ardindan src/ icerigini bu repodaki dosyalarla degistirin
npm install
npm run dev
```

### Uretim derlemesi

```bash
npm run build      # dist/ klasorune statik ciktilar uretir
npm run preview    # uretim ciktisini yerelde onizler
```

---

## 5. Kullanim Ipuclari

- **Gereksinimler** sayfasinda sag ustteki **"Yeni Gereksinim"** ile kayit ekleyin.
  `text_id` kodu, secilen tipe gore otomatik onerilir (REQ-SYS-00X gibi).
- Tablodaki **zincir (🔗) ikonu** ile bir gereksinimin baglarini kurun/koparin.
  Bag her zaman **ALT bilesenden UST'e** baslatilir (DO-178C): Yazilim/Donanim → Sistem
  (`Satisfies`), Test Senaryosu → Sistem/Yazilim/Donanim (`Verifies`). Sistem gereksinimi
  tepe seviyedir, yukari bag baslatamaz. Kurallar otomatik dogrulanir.
- **Durum (Status) artik elle girilmez.** Sistem/Yazilim/Donanim gereksinimlerinin durumu
  bagli test senaryolarindan **otomatik** hesaplanir: bagli TC yoksa `In Review`; tum bagli
  TC'ler gectiyse `Approved`; en az biri gecmediyse `Rejected`. Yalnizca **Test Case**
  durumu (test sonucu) elle secilebilir.
- **Akilli AI Asistan** (sag alt, mor buton): dogal dille filtreleme ve duzenleme yapar.
  Ornek: *"DAL A olanlari listele"*, *"Onceligi High olan yazilim gereksinimlerini getir"*,
  *"Testi eksik sistem gereksinimlerini getir"*, *"REQ-SW-001 onceligini Low yap"*,
  *"REQ-SYS-002 durumunu incele"*.
- **Izlenebilirlik Matrisi** sayfasinda tum iliskileri kus bakisi gorun.
- **Kapsam Raporu** sayfasinda test edilmemis (kapsam disi) kritik gereksinimleri ve
  **Traceability % Score** degerini takip edin. DAL A/B seviyesindeki acikar
  "YUKSEK" risk olarak vurgulanir.
- **AI Belge Analizi** sayfasinda bir gereksinim belgesi yukleyin ya da metni yapistirin;
  motor offline calisir, aday gereksinimleri cikarir, kalite puanlar ve **"Secilenleri Ice
  Aktar"** ile uygulamaya Taslak olarak ekler. "Ornek belgeyle dene" ile hizlica deneyin.
- **Degisiklik Tarihcesi** sayfasinda yapilan tum islemleri denetleyin.
- Ust bardaki **"Demo Sifirla"** butonu tum veriyi silip ornek seti yeniden yukler.
  Tema anahtariyla koyu/acik gorunum arasinda gecis yapabilirsiniz.

### Giris bilgileri (demo)

| Rol | Kullanici adi | Sifre |
|-----|---------------|-------|
| Sistem Muhendisi | `sistem_muh` | `muh2024` |
| Geliştirici | `gelistirici` | `dev2024` |

> Kullanici hesaplari da `db.json` icindeki `users` koleksiyonunda kalici tutulur; yeni
> kayitlar ("Kayit Ol") oraya yazilir ve "Demo Sifirla" ile silinmez. Yalnizca oturum
> (kimin giris yaptigi) tarayicida saklanir.

---

## 6. Veri Modeli Ozeti

**Requirement**
| Alan | Aciklama |
|------|----------|
| `id` | Benzersiz sistem ID'si |
| `text_id` | Havacilik formatinda kod (REQ-SYS-001) |
| `title` | Kisa baslik |
| `description` | Gereksinim tanimi |
| `type` | System / Software / Hardware Requirement, Test Case |
| `category` | Alan/disiplin: Arayuz/HMI, Yazilim, Donanim, Veritabani, Sunucu, Haberlesme, Guvenlik, Performans, Genel |
| `priority` | High / Medium / Low |
| `status` | In Review / Approved / Rejected — **otomatik** (Test Case haric, onun durumu manueldir) |
| `dal_level` | DAL A … DAL E (DO-178C) |

> `text_id` **omur boyu benzersizdir**: mevcut ya da daha once silinmis (retired) bir kodla
> cakisma reddedilir. Silinen kod kalici olarak kara listeye (`retired` koleksiyonu) eklenir.

**Link (bag)** — `{ id, fromId, toId, type }` (depolama yonu: `fromId` = ust, `toId` = alt)
`type`: `Satisfies` (System ← Software/Hardware) · `Verifies` (System/Software/Hardware ← Test Case)

**Kullanici** — `{ id, username, password, name, initials, role }` (db.json `users`)

**Audit kaydi** — `{ id, timestamp, user, action, textId, field, oldValue, newValue, message }`

---

## 7. Yol Haritasi (Sonraki Adimlar)

- [ ] `db.js` icindeki REST adaptoru ile gercek PostgreSQL backend baglantisi
- [ ] Cok kullanicili kimlik dogrulama (auth) ve rol bazli yetki
- [ ] Baseline / surum dondurma (snapshot) ozelligi
- [ ] CSV / ReqIF disa-ice aktarma
- [ ] Etki analizi (impact analysis) — bir gereksinim degisince etkilenen test/alt gereksinimler

---

*EHSIM RMT · Sistem Muhendisligi MVP · Vite + React + Tailwind CSS · Sifir kurulum.*
