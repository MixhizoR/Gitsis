# Issue #103 Spec — Proje Üyeliği Yönetimi (PM adds members; multi-project)

> **Kısa ad:** `project-membership`
> **Epic:** #84 (auth infrastructure) · **Issue:** #103 · **Öncül:** #97 tamamlandı (tek kimlik dünyası: User + SystemRole)
> **Durum:** Spec — kod YOK. Tüm kararlar kullanıcı ile 4 tur röportajda netleştirildi.

---

## 1. Problem & Hedef

#97 sonrası üyelik tek kolonla modelleniyor (`User.projectId`) ve **hiçbir UI yolu yok**: PM projeye kimse ekleyemiyor, atama yalnızca API ile yapılabiliyor. Ayrıca tek-proje kısıtı yapay: gerçek dünyada bir sistem mühendisi birden çok projede çalışır.

**Hedef model (Polarion benzeri):**

```
Admin (konsol, systemRole='ADMIN')          PM (proje içi)
├─ Kullanıcı yaratır/siler/kilitler         ├─ Projesine üye EKLER / ÇIKARIR
├─ roleKey atar (SystemRole)                │   (POST/DELETE /members)
├─ SystemRole izinlerini düzenler           ├─ Üye listesini görür (PM'e özel)
└─ Projelere ÜYE ATAMAZ ❌                  └─ Konsola girmez (#90 korunur)

Üye (normal User)
├─ Yalnızca ÜYE OLDUĞU projeleri görür (ProjectSelect'te liste)
├─ Üye olmadığı projenin VARLIĞINI bile görmez (liste filtresi + 403)
└─ Yetkisi: kendi roleKey'inin SystemRole izinleriyle sınırlı
   ("adminin belirlediği rol ve rol erişim sınırları çerçevesinde değişim")
```

---

## 2. Netleştirilmiş Kararlar (röportaj çıktısı)

| # | Konu | Karar |
|---|------|-------|
| 1 | PM üyeliği | PM'lere **ProjectMember kaydı YAZILMAZ** — zaten tüm projelere erişirler; members listesinde görünmezler |
| 2 | Admin'in üyelik rolü | **Yok.** Üyelik tamamen PM'in işi. Admin konsolu yalnızca kullanıcı + rol yönetimi yapar. Backend'deki `PATCH /admin/users/:id { projectId }` davranışı **kaldırılır** (tek doğru kaynağın bozulmaması için) |
| 3 | Çıkarılma anında oturum | **Zorla oturum kapatma YOK.** Erişim API seviyesinde **anında** kesilir (guard her istekte DB'den üyelik okur); eski access token maks 15 dk yaşar ama proje uçlarında işe yaramaz |
| 4 | Proje limiti | **Limitsiz** — bir kullanıcı istediği kadar projede üye olabilir |
| 5 | Boş durum | Hiçbir projeye üye olmayan kullanıcı **ProjectSelect'i boş listeyle** görür; sayfada i18n bilgilendirme metni ("Henüz bir projeye atanmadınız…") + çıkış butonu |
| 6 | Members sayfası görünürlüğü | **Yalnızca PM** — üyeler bile kimin projede olduğunu göremez (liste + yönetim tamamen PM'e özel) |
| 7 | PM'i üye olarak ekleme | **400 reddi** — "PM kullanıcılar üye olarak eklenmez; zaten tüm projelere erişir" |
| 8 | Self-leave | **Yok** — kullanıcı kendi üyeliğini sonlandıramaz; ayrılma yalnızca PM kararıdır |
| 9 | Ayrılan üyenin oyları | **Geçmiş korunur.** Approval kayıtları silinmez; onay matrisinde adı görünür ama yanında **"(ayrıldı)"** rozeti olur ve konsensüs hesabına **katılmaz** (oy havuzu aktif üyelerden kurulur). Kimin onaylayıp onaylamadığı **herkes tarafından görülebilmeli** (matrix erişimi üyelere açık kalır) |
| 10 | Admin rol değiştirince onaylar | **Lazy recompute** — bir sonraki oy/unlock/recompute çağrısında zaten yeniden hesaplanıyor; ek tetikleme yapılmaz |
| 11 | Üye ekleme listesi | **Tam liste + arama** — tüm PM-olmayan kullanıcılar listelenir; arama kutusu + "bu projede zaten üye" rozeti |
| 12 | Liste içeriği | **Temel + clearance** — ad soyad, initials, rol (SystemRole adı), `clearanceLevel`, üyelik tarihi (`joinedAt`) |
| 13 | Veri geçişi | **Force-reset** — #97'deki gibi `db push --force-reset`; eski `User.projectId` verisi göç etmez, seed yeniden kurulur |
| 14 | 403 UX | Erişimi kalkan üye açık proje ekranındayken 403 alınca **aktif proje kapatılır, ProjectSelect'e dönülür** + "bu projeye erişiminiz kalktı" bildirimi |
| 15 | Sayfa konumu | **Sidebar sayfası** — "Üyeler" girişi (yalnızca PM'de görünür), eski Roles sayfası deseninde ayrı sayfa |
| 16 | Git lojistiği | **Önce #97 commit'lenir** (yeşil, doğrulanmış), ardından `feat/103-project-members` branch'i açılır |

---

## 3. Veri Modeli

### 3.1 Yeni model

```prisma
/// Proje uyeligi (coktan-coga). PM'ler uye DEGILDİR (kayit tutulmaz);
/// PM erisimi auth.js isPM yolu ile devam eder.
model ProjectMember {
  id        String   @id @default(uuid())
  projectId String
  userId    String
  joinedAt  DateTime @default(now())
  // İleride proje-bazlı rol override'ı gelirse buraya kolon eklenir (şimdilik YOK —
  // yetki kaynağı hep User.roleKey -> SystemRole).
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([projectId])
  @@index([userId])
}
```

### 3.2 User modeli değişimi

- `projectId` + `project` relation **KALDIRILIR** (`UserProject` relation da).
- `RefreshToken` vb. diğer relation'lar aynen kalır.

### 3.3 Project modeli

- `users User[] @relation("UserProject")` **KALDIRILIR**, yerine `members ProjectMember[]`.

---

## 4. Backend API

### 4.1 Yeni uçlar (hepsi `requireAuth` + `projectAccessGuard` arkasında, üye ekleme/çıkarma ayrıca `requirePM`)

| Metot | Yol | Gövde/Dönüş | Kurallar |
|---|---|---|---|
| `GET` | `/api/projects/:pid/members` | `[{ userId, name, initials, roleKey, roleName, clearanceLevel, joinedAt }]` | **Yalnızca PM** (403 aksi halde). PM'ler listede YOK |
| `POST` | `/api/projects/:pid/members` | `{ userId }` → `{ member }` | **Yalnızca PM.** Hedef kullanıcı `roleKey='pm'` (veya PM_ROLE fallback) ise **400**. Zaten üye ise idempotent 200 (veya 409 — implementasyonda tek seçim, test buna göre). Audit: `MEMBER_ADD` |
| `DELETE` | `/api/projects/:pid/members/:userId` | `{ ok: true }` | **Yalnızca PM.** Üye yoksa 404. Approval kayıtlarına DOKUNULMAZ. Audit: `MEMBER_REMOVE` |
| `GET` | `/api/users/directory` | `[{ id, username, name, initials, roleKey, roleName, clearanceLevel, isActive }]` | **requirePM.** Ekleme listesi için: yalnızca `isActive=true` ve PM-olmayan kullanıcılar. Arama client-side (liste küçük); büyük veride `?q=` query param opsiyonu |

> Not: `POST /members` gövdesi `{ userId }` alır; directory endpoint'i PM'in id→kullanıcı eşlemesi yapmasını sağlar. Coffee seed de bu iki ucu PM kimliğiyle kullanacak şekilde güncellenir (admin API'siyle proje ataması yolu kapanıyor).
>
> Temizlik: `frontend/src/services/authService.js#getUsers()` (`GET /users`) ölü koddur — backend'de böyle bir uç #97 öncesi de yoktu. #103'te silinir (api.test.js'teki 401 testi requireAuth kapısını test eder, ucu değil — etkilenmez).

### 4.2 Erişim/guard değişiklikleri (`backend/src/auth.js`, `server.js`)

1. **JWT'den `projectId` ÇIKARILIR** (login + refresh token payload'ı). Kimlik stateless kalır; **üyelik her istekte DB'den** doğrulanır.
2. `projectAccessGuard` yeniden yazılır:
   ```js
   // PM -> geç. Değilse: ProjectMember { projectId: pid, userId: auth.userId }
   // kaydı var mı? (User.isActive de kontrol edilir.) Yoksa 403.
   ```
   Performans: proje-kapsamlı her istekte +1 indexed sorgu (kabul edilebilir, mevcut ölçek).
3. `GET /api/projects` (liste): PM → tümü; normal kullanıcı →
   `where: { members: { some: { userId: auth.userId } } }`. Üye olmadığı projeler listede **hiç görünmez**.
4. `GET /api/auth/me` benzeri bir uç **yok**; frontend proje listesini `GET /projects`'ten çeker (üyelik zaten filtreli).

### 4.3 Onay (consensus) etkileşimi — `backend/src/cascade.js`

- `getRequiredVoters(prisma, pid, componentKey)` güncellenir:
  - Havuz = PM'ler (`roleKey='pm'` / PM_ROLE fallback) **+ aktif üyeler**:
    `prisma.projectMember.findMany({ where: { projectId: pid }, include: { user: true } })`
    → `user.isActive` olanların `roleKey`'i SystemRole üzerinden approve izni sorgusu.
  - **Ayrılan üye havuzdan otomatik düşer** → konsensüs yalnızca aktif üyelerle hesaplanır (Karar #9).
- `recomputeApproval` / `recomputeApprovalsBulk` mantığı değişmez; sadece havuz kaynağı değişir.

### 4.4 Onay matrisi — ayrılan üye rozeti

`GET /approvals/matrix` güncellenir:

- Şu anki gerekli oy verenler (aktif havuz) mevcut formatta döner.
- **Ek olarak**: o entity için oy vermiş AMA artık havuzda olmayan kullanıcılar
  `{ voterId, name, role: '—', voted: true/false, departed: true }` olarak listeye eklenir.
- Frontend `ApprovalMatrixModal`: `departed===true` satırlarında adın yanında **"(ayrıldı)"** rozeti; bu satırlar "gerekli oy" sayacına katılmaz.
- Liste satırlarındaki oy rozetleri (Hierarchy/PbsTree/TestCases `voted` hesabı) aynen kalır — `voterId` User UUID zaten.

### 4.5 Admin API daraltması

- `POST /admin/users` ve `PATCH /admin/users/:id` içindeki `projectId` kabul etme/kaydetme kodu **kaldırılır** (Karar #2). `adminUser` serializer'ından `projectId` düşer.
- `backend/scripts/seed-admin.mjs`: proje atama mantığı yoktu, dokunulmaz; yalnızca `systemRole`/`roleKey` güvenceleri kalır.

---

## 5. Frontend

### 5.1 Servisler (`services/dataService.js`)

```js
export const listMembers   = (pid) => api.get(`/projects/${pid}/members`)
export const addMember     = (pid, userId) => api.post(`/projects/${pid}/members`, { userId })
export const removeMember  = (pid, userId) => api.del(`/projects/${pid}/members/${userId}`)
export const listUserDirectory = () => api.get('/users/directory')
```

### 5.2 Üyeler sayfası (`pages/Members.jsx` — yeni, PM'e özel)

- Sidebar girişi: `canSeeMembers = isPM` (yalnızca PM). `nav.members` i18n anahtarı.
- **Üye tablosu** (Karar #12): Ad Soyad + initials avatarı, rol (SystemRole adı), clearance (1–5), üyelik tarihi (`joinedAt`, `formatDateTime`), satır sonu "Çıkar" butonu (`useUndoableDelete` deseni opsiyonel; basit confirm de kabul).
- **"Üye ekle" modalı** (Karar #11):
  - `listUserDirectory()` ile tam liste; üstte arama kutusu (isim/kullanıcı adı, client-side filtre).
  - Bu projede zaten üye olanlar listede **"zaten üye"** rozetiyle işaretli, seçilemez.
  - PM-role kullanıcılar listede görünmez (backend de 400 ile savunur — çifte güvence).
- Toplu ekleme ** kapsam dışı (tek tek ekleme; gerekirse sonraki iterasyon).

### 5.3 Proje seçimi (`pages/ProjectSelect.jsx`, `App.jsx`)

- **`forcedProjectId` mekanizması KALDIRILIR** (`App.jsx` içindeki useEffect + `User.projectId` okuması). Üye kullanıcı artık kendi proje listesinde **seçim yapar**.
- Boş durum (Karar #5): liste boşsa ProjectSelect içinde i18n mesajı + "Çıkış yap" butonu; hata gibi görünmesin.
- `ProjectContext` dokunulmaz (liste zaten `GET /projects`'ten geliyor, filtre backend'de).

### 5.4 Erişim kaybı UX (Karar #14)

- `apiClient.js` 403 interceptor'ı (veya AppContext `refresh` catch'i): aktif projede 403 alındığında
  → `closeProject()` + ProjectSelect'e dönüş + toast/banner: "Bu projeye erişiminiz kalktı."
- Yalnızca **proje-kapsamlı** 403'ler bu akışı tetikler; diğer 403'ler mevcut hata gösteriminde kalır (yanlışlıkla geniş kapsamlı logout davranışı olmasın).

### 5.5 Onay matrisi (Karar #9)

- `components/common/ApprovalMatrixModal.jsx`: `departed` satırları gri + "(ayrıldı)" rozeti; açıklama tooltip'i: "Bu üye projeden çıktı; oyu geçmiş kaydı olarak görünür, konsensüse katılmaz."

---

## 6. i18n (TR + EN)

Yeni anahtarlar (isimler yaklaşık; implementasyonda mevcut desene uyulur):

```
nav.members                         'Üyeler' / 'Members'
members.title / members.subtitle
members.th.name / .role / .clearance / .joinedAt
members.add / members.addTitle      'Üye ekle'
members.searchPlaceholder
members.alreadyMember               'Zaten üye'
members.empty                       'Henüz üye yok.'
members.removed                     'Üye çıkarıldı.'
members.added                       'Üye eklendi.'
members.departedBadge               '(ayrıldı)' / '(departed)'
members.departedHint                '... oyu geçmiş kaydı, konsensüse katılmaz.'
projectSelect.noProjects            'Henüz bir projeye atanmadınız. Proje yöneticinizle iletişime geçin.'
projectSelect.accessRevoked         'Bu projeye erişiminiz kaldırıldı.'
members.errors.pmUser               'PM kullanıcılar üye olarak eklenmez.'
```

---

## 7. Seed / Script Güncellemeleri

- **`scripts/seed-coffee-project.mjs`**: üye atama kısmı admin API yerine PM kimliğiyle
  `GET /users/directory` + `POST /projects/:pid/members` kullanır. Demo PM yine admin tarafından yaratılır (rol ataması admin işi — Karar #2 ile tutarlı).
- **`backend/src/seed.js`**: drone projesi demo üyeleri varsa ProjectMember ile kurulur; `User.projectId` kullanımı tamamen kalkar.

---

## 8. Migration & Geçiş (Karar #13)

1. `schema.prisma`: `ProjectMember` ekler, `User.projectId`/`UserProject` kaldırır.
2. `pnpm exec prisma db push --force-reset` (dev verisi göç etmez — **kullanıcı kararı**).
3. `ensureSystemRoles` dokunulmaz; startup akışı aynı.
4. README/AGENTS.md'deki "members only access assigned projects" anlatımı ProjectMember diline güncellenir.

---

## 9. Test Planı

### Backend (`node --test`, dosya: `tests/issue103-members.test.js`)
1. PM üye ekler → `GET /members` listeler (isim, rol, clearance, joinedAt).
2. PM-olmayan kullanıcı `/members` → 403 (okuma dahil — Karar #6).
3. PM, PM-role kullanıcı eklemeye çalışır → 400 (Karar #7).
4. Aynı kullanıcıyı ikinci kez ekleme → idempotent/409 (implementasyon seçimi testle sabitlenir).
5. Üye olmayan kullanıcının projeye `GET /requirements` → 403; `GET /projects` listesinde proje görünmez (Karar: "eklenmemişler projeleri göremesin").
6. Üye çıkarılır → anında 403 (aynı token ile); `GET /projects` listesinden proje düşer.
7. Üye çıkarıldığında Approval kayıtları durur; matrix `departed:true` döner; konsensüs havuzundan düşer (eksik oy → Pending).
8. IDOR: PM A, projeden çıkarılan üyenin token'ıyla B projesine erişemez.
9. `requirePM` olmayan DELETE/POST → 403; admin bile üye ekleyemez (Karar #2 — admin uçtan 403 alır).

### Frontend (Vitest)
1. `Members.jsx` smoke: tablo render, ekleme modalı açılır, arama filtreler, "zaten üye" rozeti.
2. `ProjectSelect` boş durum: mesaj + çıkış butonu.
3. 403 → proje seçime dönüş akışı (mock apiClient).
4. `ApprovalMatrixModal` departed rozeti render testi.

### Doğrulama
- `pre-push-check.sh` full yeşil.
- Coffee seed: create + repair modları canlı Docker'da (üyeler PM kimliğiyle ekleniyor).

---

## 10. Bilinçli Olarak Kapsam Dışı

- **#101 Faz 2** (systemRole kolonunun kaldırılması, roleKey='admin' konsol kapısı, PM bypass refactor) — bu spec'ten AYRI, sonraki iş.
- **#102** clearance etiketleri — yalnızca members sayfasında ham `clearanceLevel` gösterilir.
- Proje-bazlı rol override (ProjectMember üzerinde permissions) — yapılmıyor; yetki kaynağı hep `User.roleKey`.
- Üye davet e-postası / passcode — kavramsal olarak #97 ile öldü.
- Toplu üye ekleme (bulk add).

---

## 11. API JSON Örnekleri

### `GET /api/projects/:pid/members` (PM) — 200
```json
[
  {
    "userId": "3f1c...",
    "username": "ahmet.yilmaz.demo",
    "name": "Ahmet Yilmaz",
    "initials": "AY",
    "roleKey": "system_engineer",
    "roleName": "System Engineer",
    "clearanceLevel": 3,
    "joinedAt": "2026-09-10T08:30:00.000Z"
  }
]
```

### `POST /api/projects/:pid/members` (PM) — body / 201 / hata
```json
// body
{ "userId": "3f1c..." }
// 201
{ "member": { "projectId": "e3fe...", "userId": "3f1c...", "joinedAt": "2026-09-10T08:30:00.000Z" } }
// 400 — PM-role kullanıcı eklenemez (Karar #7)
{ "error": "PM kullanıcılar üye olarak eklenmez; zaten tüm projelere erişir." }
```

### `GET /api/users/directory` (PM) — 200
```json
[
  {
    "id": "3f1c...",
    "username": "elif.demir.demo",
    "name": "Elif Demir",
    "initials": "ED",
    "roleKey": "system_engineer",
    "roleName": "System Engineer",
    "clearanceLevel": 2,
    "isActive": true,
    "memberProjectIds": ["e3fe..."]
  }
]
```
> `memberProjectIds` yerine alternate: her kayıt için `isMemberOfActive` hesaplanamayacağından (directory proje-bağımsız), "zaten üye" kontrolü client-side `members` listesiyle kesişim yapılır — backend ekstra alan döndürmek zorunda değil. Implementasyon sade tutulur.

### `GET /approvals/matrix` — departed üye (Karar #9)
```json
{
  "approvalStatus": "Pending",
  "locked": false,
  "textId": "EH-SYS-001",
  "title": "Ana gereksinim",
  "voters": [
    { "voterId": "3f1c...", "name": "Ahmet Yilmaz", "role": "System Engineer", "voted": true },
    { "voterId": "9d2a...", "name": "Can Aydin", "role": "—", "voted": true, "departed": true }
  ]
}
```
> `departed:true` satırı konsensüs sayacına katılmaz; UI'da gri + "(ayrıldı)" rozeti.

### Hata akışı — üyeliği kaldırılmış token
```json
// GET /api/projects/:pid/requirements  (eski access token, üyelik yok)
403 { "error": "Bu projeye erisim yetkiniz yok." }
```

## 12. Uygulama Sırası (önerilen)

1. **#97 commit** (mevcut yeşil working tree) → `feat/103-project-members` branch.
2. Schema: `ProjectMember` + `User.projectId` kaldırma + `db push --force-reset`.
3. Backend: guard + listProjects + members endpoints + directory + cascade havuzu + matrix departed + admin projectId daraltması.
4. Backend testleri (`tests/issue103-members.test.js`).
5. Frontend: services → Members sayfası + sidebar → ProjectSelect boş durum + forcedProjectId kaldırma → 403 UX → matrix rozeti → i18n.
6. Seed güncellemeleri (coffee).
7. `pre-push-check.sh` + canlı Docker smoke (create/repair seed + üye akışı).
8. Issue #103 GitHub güncellemesi + commit.
