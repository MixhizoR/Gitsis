// ============================================================================
//  seed.js  —  TEK SEFERLIK resmi seed. Yalnizca veri tabani BOSSA (hic proje
//  yoksa) calisir; doludur ise hicbir sey yapmaz. Boylece PostgreSQL volume'u
//  sayesinde her acilista veri KALICI kalir, tekrar tekrar yuklenmez.
//
//  Resmi set:  72 gereksinim + 16 test senaryosu + 58 izlenebilirlik bagi.
//    Gereksinimler: 12 User + 20 System + 24 Software + 16 Hardware
//    Testler:        5 Acceptance + 6 System + 5 Sub-system
//    Baglar:         20 (User<-System) + 22 (System<-Sub) + 16 (Verifies)
//
//  Issue #13: createdAt/updatedAt alanlari Prisma'nin @default(now()) /
//  @updatedAt sema direktiflerine birakildi (gelecek tarih hardcode'u yok).
//  author / createdBy alanlari "system.seed" sistem imzasi ile isaretlenir
//  (admin manuel kayitlarindan denetim amaciyla ayrilir).
// ============================================================================
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import {
  REQ_TYPE,
  TEST_TYPE,
  PRIORITY,
  STATUS,
  LINK_TYPE,
  TYPE_SUFFIX,
  DEFAULT_CODE_PREFIX,
  prefixFor,
} from './constants.js';
import { recomputeAllStatuses } from './logic.js';
import { hashPassword } from './auth.js';
import { seedDefaultAttributeDefinitions } from './attributes.js';

const prisma = new PrismaClient();
const SEED_AUTHOR = 'system.seed';

const FIELDS = [
  'Arayuz / HMI',
  'Yazilim / Kontrol',
  'Donanim',
  'Veritabani',
  'Sunucu / Altyapi',
  'Haberlesme',
  'Guvenlik / Emniyet',
  'Performans',
  'Genel',
];
const P = [PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW];

const pad = (n) => String(n).padStart(3, '0');

// --- Gereksinim basliklari ---------------------------------------------------
const USER_TITLES = [
  'Ucus guvenligi ve emniyet',
  'Otonom ucus kabiliyeti',
  'Pilot kullanim kolayligi',
  'Ucus verisi kayit ve raporlama',
  'Yer istasyonu ile haberlesme',
  'Sistem bakim ve teshis',
  'Yetkilendirme ve erisim guvenligi',
  'Cevresel dayaniklilik',
  'Guc yonetimi ve sureklilik',
  'Standartlara uygunluk (DO-178C)',
  'Gorev planlama ve yeniden planlama',
  'Sistem genisletilebilirligi',
];
const SYSTEM_TITLES = [
  'Otopilot tepki suresi',
  'Irtifa koruma dogrulugu',
  'Ariza durumunda guvenli mod',
  'Kritik uyari gosterimi',
  'IMU sensor yedekliligi',
  'Ucus verisi kaydi ve saklama',
  'Telemetri sunucu servisi',
  'Haberlesme veri butunlugu',
  'Erisim yetkilendirmesi',
  'Kesintisiz guc ve yeniden baslatma',
  'Rota takip dogrulugu',
  'Otomatik inis destegi',
  'Hava durumu verisi entegrasyonu',
  'Gorev yukleme ve dogrulama',
  'Sistem oz-teshis (BIT)',
  'Zaman senkronizasyonu (GPS)',
  'Cift kanal aktif-yedek mimari',
  'Ivme ve titresim toleransi',
  'Konfigurasyon surum yonetimi',
  'Kayit disi olay gunlugu',
];
const SW_TITLES = [
  'PID kontrol dongusu',
  'Sensor fuzyon algoritmasi',
  'Irtifa kestirim filtresi',
  'Guvenli mod gecis mantigi',
  'Uyari onceliklendirme motoru',
  'HMI ekran yenileme yonetimi',
  'Telemetri paketleme servisi',
  'CRC dogrulama modulu',
  'Rol tabanli yetki denetimi',
  'Guc yonetim durum makinesi',
  'Rota takip denetleyicisi',
  'Otomatik inis profili',
  'Hava durumu ayristirici',
  'Gorev dosyasi dogrulayici',
  'BIT test yuruttucu',
  'GPS zaman senkron servisi',
  'Aktif-yedek gecis yoneticisi',
  'Veri kayit tampon yoneticisi',
  'Konfigurasyon yukleyici',
  'Olay gunlugu yazici',
  'Komut dogrulama katmani',
  'Watchdog denetleyici',
  'Parametre sinir denetimi',
  'Hata kurtarma yordami',
];
const HW_TITLES = [
  'Birincil IMU karti',
  'Yedek IMU karti',
  'Guc dagitim karti',
  'Yedek batarya modulu',
  'Ana islemci karti (FCC)',
  'Haberlesme arayuz karti',
  'GPS alici modulu',
  'Analog giris karti',
  'Aktuator surucu karti',
  'Kalici bellek (flash) modulu',
  'Sicaklik sensoru dizisi',
  'Titresim sonumleyici montaj',
  'Pilot gosterge paneli',
  'Sesli alarm birimi',
  'Harici veri portu (ARINC)',
  'Yalitim / EMI koruma modulu',
];

// --- Test senaryosu basliklari ----------------------------------------------
const ACC_TITLES = [
  'Ucus guvenligi kabul testi',
  'Otonom ucus kabul testi',
  'Pilot arayuz kullanilabilirlik testi',
  'Veri kayit kabul testi',
  'Yer haberlesmesi kabul testi',
];
const SYS_TEST_TITLES = [
  'Otopilot tepki suresi testi',
  'Irtifa koruma testi',
  'Guvenli mod gecis testi',
  'Kritik uyari gosterim testi',
  'IMU yedeklilik testi',
  'Kesintisiz guc testi',
];
const SUB_TEST_TITLES = [
  'PID kontrol birim testi',
  'Sensor fuzyon birim testi',
  'CRC dogrulama birim testi',
  'Birincil IMU donanim testi',
  'Guc dagitim donanim testi',
];

// --- Yardimci: gereksinim nesnesi ------------------------------------------
function makeReq(projectId, type, prefix, i, title) {
  return {
    projectId,
    text_id: `${prefix}-${pad(i)}`,
    title,
    description: `${title} — gereksinimi. (Resmi seed veri seti, ${type}.)`,
    type,
    field: FIELDS[(i - 1) % FIELDS.length],
    status: STATUS.IN_REVIEW,
    attributes: { priority: P[(i - 1) % P.length] },
    author: SEED_AUTHOR,
  };
}

export async function runSeed() {
  const existing = await prisma.project.count();
  if (existing > 0) {
    console.log(`[seed] Veri tabani zaten dolu (${existing} proje). Seed atlandi — veri kalici.`);
    return;
  }
  console.log('[seed] Bos veri tabani — resmi seed yukleniyor...');

  // 1) Varsayilan yonetici kullanici (yoksa)
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    await prisma.user.create({
      data: {
        username: 'admin',
        password: await hashPassword('admin'),
        name: 'Eren Mutaf',
        initials: 'EM',
        role: 'System Engineer',
      },
    });
    console.log("[seed] Varsayilan kullanici olusturuldu: admin / admin (parola hash'lenerek saklandi)");
  }

  // 2) Varsayilan proje
  const project = await prisma.project.create({
    data: {
      name: 'Otopilot / Ucus Kontrol Sistemi',
      description: 'Aviyonik ucus kontrol ve otopilot sistemi — resmi referans projesi (DO-178C).',
    },
  });
  const pid = project.id;

  // 2b) Modular oznitelik tanimlari (Priority — varsayilan olarak gelir, silinebilir)
  await seedDefaultAttributeDefinitions(prisma, pid);

  // 3) Dinamik Alan secenekleri
  await prisma.projectField.createMany({
    data: FIELDS.map((name) => ({ projectId: pid, name })),
    skipDuplicates: true,
  });

  // 4) Gereksinimler (72)
  const reqData = [];
  // text_id onegi proje bazlidir; seed varsayilan oneki kullanir
  // (orn. EH-KAHVE-TİD-USR-001).
  // NOT: modul seviyesindeki `P` oncelik dizisidir; onek uretici PFX olarak
  // adlandirildi ki golgelenme olmasin.
  const PFX = (type) => prefixFor(DEFAULT_CODE_PREFIX, type);
  // Kisa kod (USR-001) -> tam text_id (EH-KAHVE-TİD-USR-001) donusturucu:
  // asagidaki bag haritalari kisa kodla yazilir, okunakli kalsin diye.
  const code = (type, i) => `${PFX(type)}-${pad(i)}`;
  USER_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.USER, PFX(REQ_TYPE.USER), k + 1, t)));
  SYSTEM_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.SYSTEM, PFX(REQ_TYPE.SYSTEM), k + 1, t)));
  SW_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.SOFTWARE, PFX(REQ_TYPE.SOFTWARE), k + 1, t)));
  HW_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.HARDWARE, PFX(REQ_TYPE.HARDWARE), k + 1, t)));
  await prisma.requirement.createMany({ data: reqData });

  // 5) Test senaryolari (16) — durumlar cascade'i cesitlendirmek icin secildi
  const TEST_STATUS = {
    'TC-ACC-001': STATUS.APPROVED,
    'TC-ACC-002': STATUS.APPROVED,
    'TC-ACC-003': STATUS.IN_REVIEW,
    'TC-ACC-004': STATUS.REJECTED,
    'TC-ACC-005': STATUS.APPROVED,
    'TC-SYS-001': STATUS.APPROVED,
    'TC-SYS-002': STATUS.APPROVED,
    'TC-SYS-003': STATUS.APPROVED,
    'TC-SYS-004': STATUS.IN_REVIEW,
    'TC-SYS-005': STATUS.REJECTED,
    'TC-SYS-006': STATUS.APPROVED,
    'TC-SUB-001': STATUS.APPROVED,
    'TC-SUB-002': STATUS.APPROVED,
    'TC-SUB-003': STATUS.IN_REVIEW,
    'TC-SUB-004': STATUS.APPROVED,
    'TC-SUB-005': STATUS.REJECTED,
  };
  const testData = [];
  // TEST_STATUS anahtarlari KISA kod ile tutulur (TC-ACC-001); tam text_id
  // proje onegiyle uretilir (EH-KAHVE-TİD-TC-ACC-001).
  const pushTest = (type, i, title) => {
    const shortKey = `${TYPE_SUFFIX[type]}-${pad(i)}`;
    const text_id = `${PFX(type)}-${pad(i)}`;
    testData.push({
      projectId: pid,
      text_id,
      title,
      description: `${title} — dogrulama senaryosu.`,
      type,
      field: null,
      // Modular oznitelikler (main): sabit priority/dal_level kolonlari yok.
      attributes: {},
      // shortKey: text_id artik proje onegi tasiyor (EH-KAHVE-TİD-TC-ACC-001),
      // TEST_STATUS haritasi ise KISA kod ile yazili (TC-ACC-001).
      status: TEST_STATUS[shortKey] || STATUS.IN_REVIEW,
      author: SEED_AUTHOR,
    });
  };
  ACC_TITLES.forEach((t, k) => pushTest(TEST_TYPE.ACCEPTANCE, k + 1, t));
  SYS_TEST_TITLES.forEach((t, k) => pushTest(TEST_TYPE.SYSTEM, k + 1, t));
  SUB_TEST_TITLES.forEach((t, k) => pushTest(TEST_TYPE.SUBSYSTEM, k + 1, t));
  await prisma.testCase.createMany({ data: testData });

  // ID haritalari (text_id -> id)
  const reqs = await prisma.requirement.findMany({ where: { projectId: pid } });
  const tests = await prisma.testCase.findMany({ where: { projectId: pid } });
  const reqIdOf = new Map(reqs.map((r) => [r.text_id, r.id]));
  const testIdOf = new Map(tests.map((t) => [t.text_id, t.id]));

  // 6) Baglar (58)
  const links = [];
  // PBS agaci (Issue #9): Satisfies bagi kurulurken ayni anda alt gereksinimin
  // parentId'si de belirlenir; boylece demo veri ayrica backfill istemez.
  // ust gereksinim id -> alt gereksinim id listesi
  const treeChildren = new Map();
  const addLink = (fromTid, toTid, type, kind) => {
    const fromId = reqIdOf.get(fromTid);
    const toId = kind === 'test' ? testIdOf.get(toTid) : reqIdOf.get(toTid);
    if (!fromId || !toId) return;
    links.push({ projectId: pid, fromId, toId, type, createdBy: SEED_AUTHOR });
    if (type === LINK_TYPE.SATISFIES && kind === 'req') {
      if (!treeChildren.has(fromId)) treeChildren.set(fromId, []);
      treeChildren.get(fromId).push(toId);
    }
  };

  // 6a) Satisfies: User <- System (20)
  for (let i = 1; i <= 20; i++) {
    const userIdx = ((i - 1) % 12) + 1;
    addLink(code(REQ_TYPE.USER, userIdx), code(REQ_TYPE.SYSTEM, i), LINK_TYPE.SATISFIES, 'req');
  }
  // 6b) Satisfies: System <- Sub-system (22) — 14 SW + 8 HW
  let sysCursor = 1;
  const nextSys = () => {
    const s = code(REQ_TYPE.SYSTEM, ((sysCursor - 1) % 20) + 1);
    sysCursor++;
    return s;
  };
  for (let i = 1; i <= 14; i++) addLink(nextSys(), code(REQ_TYPE.SOFTWARE, i), LINK_TYPE.SATISFIES, 'req');
  for (let i = 1; i <= 8; i++) addLink(nextSys(), code(REQ_TYPE.HARDWARE, i), LINK_TYPE.SATISFIES, 'req');

  // 6c) Verifies: gereksinim <- test (16)
  // [gereksinim tipi, no, test tipi, no]
  const verifyMap = [
    [REQ_TYPE.USER, 1, TEST_TYPE.ACCEPTANCE, 1],
    [REQ_TYPE.USER, 2, TEST_TYPE.ACCEPTANCE, 2],
    [REQ_TYPE.USER, 3, TEST_TYPE.ACCEPTANCE, 3],
    [REQ_TYPE.USER, 4, TEST_TYPE.ACCEPTANCE, 4],
    [REQ_TYPE.USER, 5, TEST_TYPE.ACCEPTANCE, 5],
    [REQ_TYPE.SYSTEM, 1, TEST_TYPE.SYSTEM, 1],
    [REQ_TYPE.SYSTEM, 2, TEST_TYPE.SYSTEM, 2],
    [REQ_TYPE.SYSTEM, 3, TEST_TYPE.SYSTEM, 3],
    [REQ_TYPE.SYSTEM, 4, TEST_TYPE.SYSTEM, 4],
    [REQ_TYPE.SYSTEM, 5, TEST_TYPE.SYSTEM, 5],
    [REQ_TYPE.SYSTEM, 6, TEST_TYPE.SYSTEM, 6],
    [REQ_TYPE.SOFTWARE, 1, TEST_TYPE.SUBSYSTEM, 1],
    [REQ_TYPE.SOFTWARE, 2, TEST_TYPE.SUBSYSTEM, 2],
    [REQ_TYPE.SOFTWARE, 3, TEST_TYPE.SUBSYSTEM, 3],
    [REQ_TYPE.HARDWARE, 1, TEST_TYPE.SUBSYSTEM, 4],
    [REQ_TYPE.HARDWARE, 2, TEST_TYPE.SUBSYSTEM, 5],
  ];
  verifyMap.forEach(([rt, ri, tt, ti]) => addLink(code(rt, ri), code(tt, ti), LINK_TYPE.VERIFIES, 'test'));

  await prisma.traceabilityLink.createMany({ data: links, skipDuplicates: true });

  // 6d) PBS agaci: Satisfies baglarindan turetilen parentId'ler (Issue #9).
  // Seed'de her alt gereksinimin tek ebeveyni vardir; cakisma olusmaz.
  await prisma.$transaction(
    [...treeChildren].map(([parentId, childIds]) =>
      prisma.requirement.updateMany({ where: { id: { in: childIds } }, data: { parentId } }),
    ),
  );

  // 7) Otomatik durum (cascade) hesapla ve gereksinimlere isle
  const changes = recomputeAllStatuses(reqs, tests, links);
  for (const c of changes) {
    await prisma.requirement.update({ where: { id: c.id }, data: { status: c.to } });
  }

  // 8) Ozet
  console.log(
    `[seed] Tamamlandi -> Proje: "${project.name}" | Gereksinim: ${reqData.length} | ` +
      `Test: ${testData.length} | Bag: ${links.length} | Durum guncellemesi: ${changes.length}`,
  );
  if (reqData.length !== 72 || testData.length !== 16 || links.length !== 58) {
    console.warn(`[seed] UYARI: beklenen 72/16/58 ile uyumsuz -> ${reqData.length}/${testData.length}/${links.length}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed()
    .catch((e) => {
      console.error('[seed] HATA:', e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
