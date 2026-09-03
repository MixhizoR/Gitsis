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
import { REQ_TYPE, TEST_TYPE, PRIORITY, STATUS, DAL, LINK_TYPE } from './constants.js';
import { recomputeAllStatuses } from './logic.js';
import { hashPassword } from './auth.js';

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
const D = [DAL.A, DAL.B, DAL.C, DAL.D, DAL.E];

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
    priority: P[(i - 1) % P.length],
    status: STATUS.IN_REVIEW,
    dal_level: D[(i - 1) % D.length],
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

  // 3) Dinamik Alan secenekleri
  await prisma.projectField.createMany({
    data: FIELDS.map((name) => ({ projectId: pid, name })),
    skipDuplicates: true,
  });

  // 4) Gereksinimler (72)
  const reqData = [];
  USER_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.USER, 'REQ-USR', k + 1, t)));
  SYSTEM_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.SYSTEM, 'REQ-SYS', k + 1, t)));
  SW_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.SOFTWARE, 'REQ-SW', k + 1, t)));
  HW_TITLES.forEach((t, k) => reqData.push(makeReq(pid, REQ_TYPE.HARDWARE, 'REQ-HW', k + 1, t)));
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
  const pushTest = (type, prefix, i, title) => {
    const text_id = `${prefix}-${pad(i)}`;
    testData.push({
      projectId: pid,
      text_id,
      title,
      description: `${title} — dogrulama senaryosu.`,
      type,
      field: null,
      priority: null,
      dal_level: null,
      status: TEST_STATUS[text_id] || STATUS.IN_REVIEW,
      author: SEED_AUTHOR,
    });
  };
  ACC_TITLES.forEach((t, k) => pushTest(TEST_TYPE.ACCEPTANCE, 'TC-ACC', k + 1, t));
  SYS_TEST_TITLES.forEach((t, k) => pushTest(TEST_TYPE.SYSTEM, 'TC-SYS', k + 1, t));
  SUB_TEST_TITLES.forEach((t, k) => pushTest(TEST_TYPE.SUBSYSTEM, 'TC-SUB', k + 1, t));
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
    addLink(`REQ-USR-${pad(userIdx)}`, `REQ-SYS-${pad(i)}`, LINK_TYPE.SATISFIES, 'req');
  }
  // 6b) Satisfies: System <- Sub-system (22) — 14 SW + 8 HW
  let sysCursor = 1;
  const nextSys = () => {
    const s = `REQ-SYS-${pad(((sysCursor - 1) % 20) + 1)}`;
    sysCursor++;
    return s;
  };
  for (let i = 1; i <= 14; i++) addLink(nextSys(), `REQ-SW-${pad(i)}`, LINK_TYPE.SATISFIES, 'req');
  for (let i = 1; i <= 8; i++) addLink(nextSys(), `REQ-HW-${pad(i)}`, LINK_TYPE.SATISFIES, 'req');

  // 6c) Verifies: gereksinim <- test (16)
  const verifyMap = [
    ['REQ-USR-001', 'TC-ACC-001'],
    ['REQ-USR-002', 'TC-ACC-002'],
    ['REQ-USR-003', 'TC-ACC-003'],
    ['REQ-USR-004', 'TC-ACC-004'],
    ['REQ-USR-005', 'TC-ACC-005'],
    ['REQ-SYS-001', 'TC-SYS-001'],
    ['REQ-SYS-002', 'TC-SYS-002'],
    ['REQ-SYS-003', 'TC-SYS-003'],
    ['REQ-SYS-004', 'TC-SYS-004'],
    ['REQ-SYS-005', 'TC-SYS-005'],
    ['REQ-SYS-006', 'TC-SYS-006'],
    ['REQ-SW-001', 'TC-SUB-001'],
    ['REQ-SW-002', 'TC-SUB-002'],
    ['REQ-SW-003', 'TC-SUB-003'],
    ['REQ-HW-001', 'TC-SUB-004'],
    ['REQ-HW-002', 'TC-SUB-005'],
  ];
  verifyMap.forEach(([r, t]) => addLink(r, t, LINK_TYPE.VERIFIES, 'test'));

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
