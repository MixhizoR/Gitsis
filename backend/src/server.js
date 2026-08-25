// ============================================================================
//  server.js  —  Express + Prisma REST API. Tum kaynaklar PROJE bazli izole.
//  Taban yol: /api
//    Auth:      POST /api/auth/register, POST /api/auth/login, GET /api/users
//    Projeler:  GET/POST /api/projects, GET/PATCH/DELETE /api/projects/:pid
//    Proje alti (hepsi /api/projects/:pid/...):
//        fields         (GET/POST/DELETE)
//        requirements   (GET/POST/GET:id/PUT:id/DELETE:id)
//        testcases      (GET/POST/GET:id/PUT:id/DELETE:id)
//        glossary       (GET/POST/PUT:id/DELETE:id)
//        links          (GET/POST/DELETE:id)
//        audit          (GET/POST)
//        recompute      (POST)  -> tum durumlari yeniden hesaplar (cascade)
// ============================================================================
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { TYPE_PREFIX, STATUS } from './constants.js';
import { validateLink, recomputeAllStatuses } from './logic.js';
import { requireAuth, requirePM, projectAccessGuard, hashPassword, verifyPassword, signToken } from './auth.js';
import { cleanRichText } from './sanitize.js';
import traceabilityRoutes from './traceability.js';

console.log('Traceability router yüklendi:', Boolean(traceabilityRoutes));

const prisma = new PrismaClient();
const app = express();
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// --- Guvenlik: kimlik dogrulama + proje sinirlama --------------------------
//  Girisin kendisi (login/passcode/register) haric TUM /api yollari gecerli
//  bir JWT ister (bkz. auth.js). Deneme-yanilma saldirilarina karsi auth
//  yollarina ayrica hiz siniri uygulanir.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Cok fazla deneme yapildi. Lutfen birkac dakika sonra tekrar deneyin.' },
});
app.use('/api/auth', authLimiter);
app.use(requireAuth);
// :pid iceren HER route icin otomatik calisir — personel yalnizca kendi
// atandigi projeye erisebilir, PM her projeye erisebilir (IDOR korumasi).
app.param('pid', projectAccessGuard);

// Traceability router — mounted under :pid so app.param('pid', projectAccessGuard)
app.use('/api/projects/:pid/traceability', traceabilityRoutes);

const PORT = process.env.PORT || 4001;
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => fail(res, e));

function fail(res, e) {
  if (e && e.code === 'P2002') return res.status(409).json({ error: 'Benzersizlik ihlali (kod zaten kullanimda).' });
  if (e && e.code === 'P2025') return res.status(404).json({ error: 'Kayit bulunamadi.' });
  console.error('[api] hata:', e?.message || e);
  return res.status(e?.status || 500).json({ error: e?.message || 'Sunucu hatasi.' });
}
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Etki analizinde kullanilan "ilgili dokuman" etiket listesini temizler.
function normalizeDocuments(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((s) => String(s ?? '').trim()).filter(Boolean))];
}

// --- Audit yardimcisi -------------------------------------------------------
async function audit(projectId, entry) {
  try {
    await prisma.auditLog.create({ data: { projectId, ...entry } });
  } catch (e) {
    console.error('[audit] yazilamadi:', e?.message || e);
  }
}

// --- text_id ureteci --------------------------------------------------------
//  OMUR BOYU BENZERSIZLIK (kara liste): bir text_id bir kez uretildiyse, ilgili
//  kayit SILINSE BILE numarasi asla yeniden kullanilmaz. Bunun icin sadece
//  CANLI kayitlara degil, AuditLog'daki tum textId izlerine de bakariz
//  (silme kayitlari audit'te kalir). Boylece "en yuksek numarali kaydi silip
//  ayni kodu tekrar uretme" acigi kapanir.
async function nextTextId(projectId, type, isTest) {
  const prefix = TYPE_PREFIX[type] || 'REQ-GEN';
  const [rows, auditRows] = await Promise.all([
    isTest
      ? prisma.testCase.findMany({ where: { projectId }, select: { text_id: true } })
      : prisma.requirement.findMany({ where: { projectId }, select: { text_id: true } }),
    // Audit'te textId "REQ-SYS-001 -> TC-SYS-002" gibi birlesik de olabildigi
    // icin bosluk/ok'a gore parcalayip her parcayi degerlendiririz.
    prisma.auditLog.findMany({
      where: { projectId, textId: { startsWith: prefix + '-' } },
      select: { textId: true },
    }),
  ]);
  let max = 0;
  const consider = (raw) => {
    if (!raw) return;
    for (const token of String(raw).split(/[\s>-]*->[\s>-]*|\s+/)) {
      if (token && token.startsWith(prefix + '-')) {
        const n = parseInt(token.split('-').pop(), 10);
        if (!Number.isNaN(n) && n > max) max = n;
      }
    }
  };
  for (const { text_id } of rows) consider(text_id);
  for (const { textId } of auditRows) consider(textId);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

// --- Cascade: bir projedeki tum gereksinim durumlarini yeniden hesapla ------
async function cascade(projectId) {
  const [requirements, testCases, links] = await Promise.all([
    prisma.requirement.findMany({ where: { projectId } }),
    prisma.testCase.findMany({ where: { projectId } }),
    prisma.traceabilityLink.findMany({ where: { projectId } }),
  ]);
  const changes = recomputeAllStatuses(requirements, testCases, links);
  for (const c of changes) {
    await prisma.requirement.update({ where: { id: c.id }, data: { status: c.to } });
    await audit(projectId, {
      action: 'AUTO_STATUS',
      entityType: 'requirement',
      entityId: c.id,
      textId: c.text_id,
      field: 'status',
      oldValue: c.from,
      newValue: c.to,
      message: `Durum otomatik guncellendi: ${c.from} -> ${c.to}.`,
    });
  }
  return changes.length;
}

// --- Toplu silme yardimcisi -------------------------------------------------
//  Secilen id'leri (proje kapsaminda) tek islemde siler: once iliskili tum
//  izlenebilirlik baglarini temizler, sonra kayitlari siler, her biri icin
//  DELETE audit kaydi yazar (silinen text_id kara listede kalir).
async function batchDelete(pid, model, ids, entityType) {
  if (!Array.isArray(ids) || ids.length === 0) throw bad('En az bir id zorunlu.');
  const allRows = await prisma[model].findMany({ where: { id: { in: ids }, projectId: pid } });
  if (allRows.length === 0) throw bad('Silinecek kayit bulunamadi.', 404);
  // Onaylanip kilitlenmis kayitlar toplu silmeden muaf tutulur.
  const rows = allRows.filter((r) => !r.locked);
  if (rows.length === 0) throw bad('Secilen kayitlar onaylanmis ve kilitli; silinemez.', 403);
  const foundIds = rows.map((r) => r.id);
  await prisma.traceabilityLink.deleteMany({
    where: { projectId: pid, OR: [{ fromId: { in: foundIds } }, { toId: { in: foundIds } }] },
  });
  await prisma[model].deleteMany({ where: { id: { in: foundIds }, projectId: pid } });
  for (const r of rows) {
    await audit(pid, {
      action: 'DELETE',
      entityType,
      entityId: r.id,
      textId: r.text_id,
      message: `Toplu silme: "${r.title || r.term}" (${r.text_id}).`,
    });
  }
  return foundIds.length;
}

// --- Izin bileseni (permission component) eslemesi --------------------------
//  Her gereksinim/test, izin panellerindeki 6 bilesenden birine dusurulur.
//  Anahtarlar frontend REQ_PAGES / TEST_PAGES sayfa anahtarlariyla ayni.
function componentKeyOf(entityType, type) {
  if (entityType === 'requirement') {
    if (type === 'User Requirement') return 'req-user';
    if (type === 'System Requirement') return 'req-system';
    return 'req-subsystem'; // Software / Hardware
  }
  if (type === 'Acceptance Test') return 'test-acceptance';
  if (type === 'System Test') return 'test-system';
  return 'test-subsystem';
}

// --- Benzersiz 5 karakterlik passcode ureteci -------------------------------
//  Karisik gorunumlu harf/rakamlar (0/O, 1/I) haric tutulur.
async function generatePasscode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const existing = await prisma.personnel.findUnique({ where: { passcode: code } });
    if (!existing) return code;
  }
  throw bad('Passcode uretilemedi; lutfen tekrar deneyin.', 500);
}

// --- Bir kaydin onay durumunu (consensus) yeniden hesapla -------------------
//  Gerekli oy verenler = PM + (o bileseni onaylama yetkisi olan tum personel).
//  Hepsi oy verdiyse -> Approved (kilitli). Aksi halde -> Pending.
async function requiredVotersFor(pid, entityType, entity) {
  const compKey = componentKeyOf(entityType, entity.type);
  const personnel = await prisma.personnel.findMany({ where: { projectId: pid }, include: { role: true } });
  const requiredPersonnel = personnel.filter((p) => {
    const perm = (p.role?.permissions || {}).approve;
    return perm && perm.enabled && Array.isArray(perm.components) && perm.components.includes(compKey);
  });
  return { requiredPersonnel, requiredVoterIds: ['PM', ...requiredPersonnel.map((p) => p.id)] };
}

async function recomputeApproval(pid, entityType, entityId) {
  const model = entityType === 'requirement' ? 'requirement' : 'testCase';
  const entity = await prisma[model].findUnique({ where: { id: entityId } });
  if (!entity || entity.projectId !== pid) throw bad('Varlik bulunamadi.', 404);
  const { requiredVoterIds } = await requiredVotersFor(pid, entityType, entity);
  const approvals = await prisma.approval.findMany({ where: { projectId: pid, entityType, entityId } });
  const votedIds = new Set(approvals.map((a) => a.voterId));
  const approved = requiredVoterIds.every((v) => votedIds.has(v));
  await prisma[model].update({
    where: { id: entityId },
    data: { approvalStatus: approved ? 'Approved' : 'Pending', locked: approved },
  });
  return { approvalStatus: approved ? 'Approved' : 'Pending', locked: approved };
}

// ===========================================================================
//  HEALTH
// ===========================================================================
app.get(
  '/api/health',
  wrap(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, ts: new Date().toISOString() });
  }),
);

// ===========================================================================
//  AUTH / USERS
// ===========================================================================
// Kayit varsayilan olarak KAPALIDIR (UI'dan zaten kaldirildi). Acmak icin
// backend'e PM_REGISTRATION_KEY ortam degiskeni tanimlayip istekte ayni
// degeri 'x-registration-key' basligiyla gondermek gerekir.
app.post(
  '/api/auth/register',
  requirePM,
  wrap(async (req, res) => {
    const expected = process.env.PM_REGISTRATION_KEY;
    if (!expected || req.headers['x-registration-key'] !== expected) {
      throw bad('Kayit devre disi birakildi.', 403);
    }
    const { username, password, name, role } = req.body || {};
    if (!username || !password || !name) throw bad('username, password, name zorunlu.');
    const initials = name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        password: await hashPassword(password),
        name: name.trim(),
        initials,
        role: role || 'System Engineer',
      },
    });
    res.status(201).json(safeUser(user));
  }),
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const { username, password } = req.body || {};
    const user = await prisma.user.findUnique({ where: { username: (username || '').trim() } });
    if (!user) throw bad('Kullanici adi veya sifre yanlis.', 401);
    const { ok, migrated } = await verifyPassword(password, user.password);
    if (!ok) throw bad('Kullanici adi veya sifre yanlis.', 401);
    // Eski duz-metin kayit basariyla dogrulandi -> sessizce hash'e tasi.
    if (migrated)
      await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(password) } });
    const token = signToken({ kind: 'pm', isPM: true, userId: user.id });
    res.json({ token, user: safeUser(user) });
  }),
);

app.get(
  '/api/users',
  requirePM,
  wrap(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(users.map(safeUser));
  }),
);

// --- Passcode ile personel girisi (proje-bagimsiz) --------------------------
//  Personel passcode'unu girer -> dogrudan atandigi projeye + rolune duser.
app.post(
  '/api/auth/passcode',
  wrap(async (req, res) => {
    const raw = (req.body?.passcode || '').trim().toUpperCase();
    if (!raw) throw bad('Passcode zorunlu.');
    const p = await prisma.personnel.findUnique({
      where: { passcode: raw },
      include: { role: true, project: true },
    });
    if (!p) throw bad('Gecersiz passcode.', 401);
    const token = signToken({
      kind: 'personnel',
      isPM: false,
      personnelId: p.id,
      projectId: p.projectId,
      roleId: p.roleId,
    });
    res.json({
      token,
      personnel: { id: p.id, firstName: p.firstName, lastName: p.lastName, passcode: p.passcode },
      role: { id: p.role.id, name: p.role.name, permissions: p.role.permissions || {} },
      project: { id: p.project.id, name: p.project.name },
    });
  }),
);

const safeUser = (u) => ({ id: u.id, username: u.username, name: u.name, initials: u.initials, role: u.role });

// ===========================================================================
//  PROJECTS
// ===========================================================================
app.get(
  '/api/projects',
  wrap(async (req, res) => {
    // Personel yalnizca kendi atandigi projeyi gorur; PM tumunu gorur.
    const where = req.auth.isPM ? {} : { id: req.auth.projectId };
    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { requirements: true, testCases: true, links: true, glossary: true } } },
    });
    res.json(projects);
  }),
);

app.post(
  '/api/projects',
  requirePM,
  wrap(async (req, res) => {
    const { name, description } = req.body || {};
    if (!name || !name.trim()) throw bad('Proje adi zorunlu.');
    const project = await prisma.project.create({
      data: { name: name.trim(), description: (description || '').trim() },
    });
    await audit(project.id, {
      action: 'PROJECT_CREATE',
      entityType: 'project',
      entityId: project.id,
      message: `Proje olusturuldu: "${project.name}".`,
    });
    res.status(201).json(project);
  }),
);

app.get(
  '/api/projects/:pid',
  wrap(async (req, res) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.pid } });
    if (!project) throw bad('Proje bulunamadi.', 404);
    res.json(project);
  }),
);

app.patch(
  '/api/projects/:pid',
  requirePM,
  wrap(async (req, res) => {
    const { name, description } = req.body || {};
    const data = {};
    if (name != null) data.name = name.trim();
    if (description != null) data.description = description.trim();
    const project = await prisma.project.update({ where: { id: req.params.pid }, data });
    res.json(project);
  }),
);

app.delete(
  '/api/projects/:pid',
  requirePM,
  wrap(async (req, res) => {
    await prisma.project.delete({ where: { id: req.params.pid } });
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  DINAMIK ALANLAR (fields)
// ===========================================================================
app.get(
  '/api/projects/:pid/fields',
  wrap(async (req, res) => {
    const fields = await prisma.projectField.findMany({
      where: { projectId: req.params.pid },
      orderBy: { name: 'asc' },
    });
    res.json(fields);
  }),
);

app.post(
  '/api/projects/:pid/fields',
  wrap(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !name.trim()) throw bad('Alan adi zorunlu.');
    const field = await prisma.projectField.create({ data: { projectId: req.params.pid, name: name.trim() } });
    res.status(201).json(field);
  }),
);

app.delete(
  '/api/projects/:pid/fields/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.projectField.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Alan bulunamadi.', 404);
    await prisma.projectField.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  REQUIREMENTS
// ===========================================================================
app.get(
  '/api/projects/:pid/requirements',
  wrap(async (req, res) => {
    const where = { projectId: req.params.pid };
    if (req.query.type) where.type = req.query.type;
    const rows = await prisma.requirement.findMany({ where, orderBy: { text_id: 'asc' } });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/requirements',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    if (!b.type) throw bad('Gereksinim tipi zorunlu.');
    const text_id = (b.text_id && b.text_id.trim()) || (await nextTextId(pid, b.type, false));
    // Yeni gereksinim: durum daima 'In Review' (henuz bagli test yok, kilitli).
    const row = await prisma.requirement.create({
      data: {
        projectId: pid,
        text_id,
        title: (b.title || 'Adsiz gereksinim').trim(),
        description: cleanRichText((b.description || '').trim()),
        type: b.type,
        field: b.field || null,
        priority: b.priority || 'Medium',
        status: STATUS.IN_REVIEW,
        dal_level: b.dal_level || 'DAL D',
        author: b.author || 'ehsim.user',
        relatedDocuments: normalizeDocuments(b.relatedDocuments),
      },
    });
    await audit(pid, {
      action: 'CREATE',
      entityType: 'requirement',
      entityId: row.id,
      textId: row.text_id,
      message: `Yeni gereksinim: "${row.title}" (${row.type}).`,
    });
    res.status(201).json(row);
  }),
);

app.get(
  '/api/projects/:pid/requirements/:id',
  wrap(async (req, res) => {
    const row = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!row) throw bad('Gereksinim bulunamadi.', 404);
    res.json(row);
  }),
);

app.put(
  '/api/projects/:pid/requirements/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    const before = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Gereksinim bulunamadi.', 404);
    if (before.locked) throw bad('Bu gereksinim onaylandi ve kilitli. Duzenlemek icin once PM kilidi acmalidir.', 403);
    const data = {};
    for (const k of ['text_id', 'title', 'description', 'field', 'priority', 'dal_level']) {
      if (b[k] != null) data[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
    }
    if (data.description != null) data.description = cleanRichText(data.description);
    if (b.relatedDocuments != null) data.relatedDocuments = normalizeDocuments(b.relatedDocuments);
    // Tip degistirilemez (kilitli) ve status ELLE degistirilemez (otomatik).
    const row = await prisma.requirement.update({ where: { id: req.params.id }, data });
    await audit(pid, {
      action: 'UPDATE',
      entityType: 'requirement',
      entityId: row.id,
      textId: row.text_id,
      message: `Gereksinim guncellendi: "${row.title}".`,
    });
    res.json(row);
  }),
);

app.delete(
  '/api/projects/:pid/requirements/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Gereksinim bulunamadi.', 404);
    if (before.locked) throw bad('Bu gereksinim onaylandi ve kilitli; silinemez.', 403);
    // Iliskili baglari temizle
    await prisma.traceabilityLink.deleteMany({
      where: { projectId: pid, OR: [{ fromId: req.params.id }, { toId: req.params.id }] },
    });
    await prisma.requirement.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'DELETE',
      entityType: 'requirement',
      entityId: req.params.id,
      textId: before.text_id,
      message: `Gereksinim silindi: "${before.title}".`,
    });
    await cascade(pid);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/projects/:pid/requirements/batch-delete',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const n = await batchDelete(pid, 'requirement', req.body?.ids, 'requirement');
    await cascade(pid);
    res.json({ ok: true, deleted: n });
  }),
);

// ===========================================================================
//  TEST CASES
// ===========================================================================
app.get(
  '/api/projects/:pid/testcases',
  wrap(async (req, res) => {
    const where = { projectId: req.params.pid };
    if (req.query.type) where.type = req.query.type;
    const rows = await prisma.testCase.findMany({ where, orderBy: { text_id: 'asc' } });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/testcases',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    if (!b.type) throw bad('Test tipi zorunlu.');
    const text_id = (b.text_id && b.text_id.trim()) || (await nextTextId(pid, b.type, true));
    // Alan/oncelik/dal ve test sonucu (durum) artik ELLE girilir; bir gereksinime
    // baglanmak bu degerleri OTOMATIK doldurmaz (bir test coklu gereksinim dogrular).
    const status = b.status || STATUS.IN_REVIEW;
    if (![STATUS.APPROVED, STATUS.REJECTED, STATUS.IN_REVIEW].includes(status)) throw bad('Gecersiz test sonucu.');
    const row = await prisma.testCase.create({
      data: {
        projectId: pid,
        text_id,
        title: (b.title || 'Adsiz test').trim(),
        description: cleanRichText((b.description || '').trim()),
        type: b.type,
        field: b.field || null,
        priority: b.priority || null,
        dal_level: b.dal_level || null,
        status,
        author: b.author || 'ehsim.user',
      },
    });
    await audit(pid, {
      action: 'CREATE',
      entityType: 'testcase',
      entityId: row.id,
      textId: row.text_id,
      message: `Yeni test senaryosu: "${row.title}" (${row.type}).`,
    });
    res.status(201).json(row);
  }),
);

app.put(
  '/api/projects/:pid/testcases/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    const before = await prisma.testCase.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Test bulunamadi.', 404);
    if (before.locked) throw bad('Bu test onaylandi ve kilitli. Duzenlemek icin once PM kilidi acmalidir.', 403);
    const data = {};
    for (const k of ['text_id', 'title', 'description']) if (b[k] != null) data[k] = b[k].trim();
    if (data.description != null) data.description = cleanRichText(data.description);
    // Alan / Oncelik / DAL elle duzenlenebilir (bagdan bagimsiz).
    for (const k of ['field', 'priority', 'dal_level']) {
      if (b[k] !== undefined) data[k] = b[k] === null ? null : String(b[k]).trim() || null;
    }
    // Durum elle degistirilebilir (test sonucu: Passed/Failed/In Review)
    if (b.status != null) {
      if (![STATUS.APPROVED, STATUS.REJECTED, STATUS.IN_REVIEW].includes(b.status)) throw bad('Gecersiz test durumu.');
      data.status = b.status;
    }
    const row = await prisma.testCase.update({ where: { id: req.params.id }, data });
    await audit(pid, {
      action: 'UPDATE',
      entityType: 'testcase',
      entityId: row.id,
      textId: row.text_id,
      message: `Test guncellendi: "${row.title}" (durum: ${row.status}).`,
    });
    // Test durumu degistiyse cascade
    await cascade(pid);
    res.json(row);
  }),
);

app.delete(
  '/api/projects/:pid/testcases/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.testCase.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Test bulunamadi.', 404);
    if (before.locked) throw bad('Bu test onaylandi ve kilitli; silinemez.', 403);
    await prisma.traceabilityLink.deleteMany({
      where: { projectId: pid, OR: [{ fromId: req.params.id }, { toId: req.params.id }] },
    });
    await prisma.testCase.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'DELETE',
      entityType: 'testcase',
      entityId: req.params.id,
      textId: before.text_id,
      message: `Test silindi: "${before.title}".`,
    });
    await cascade(pid);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/projects/:pid/testcases/batch-delete',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const n = await batchDelete(pid, 'testCase', req.body?.ids, 'testcase');
    await cascade(pid);
    res.json({ ok: true, deleted: n });
  }),
);

// ===========================================================================
//  GLOSSARY
// ===========================================================================
app.get(
  '/api/projects/:pid/glossary',
  wrap(async (req, res) => {
    const rows = await prisma.glossaryTerm.findMany({ where: { projectId: req.params.pid }, orderBy: { term: 'asc' } });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/glossary',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    if (!b.term || !b.term.trim()) throw bad('Terim zorunlu.');
    const count = await prisma.glossaryTerm.count({ where: { projectId: pid } });
    const text_id = (b.text_id && b.text_id.trim()) || `GLO-${String(count + 1).padStart(3, '0')}`;
    const row = await prisma.glossaryTerm.create({
      data: {
        projectId: pid,
        text_id,
        term: b.term.trim(),
        definition: (b.definition || '').trim(),
        author: b.author || 'ehsim.user',
      },
    });
    await audit(pid, {
      action: 'CREATE',
      entityType: 'glossary',
      entityId: row.id,
      textId: row.text_id,
      message: `Sozluk terimi eklendi: "${row.term}".`,
    });
    res.status(201).json(row);
  }),
);

app.put(
  '/api/projects/:pid/glossary/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.glossaryTerm.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Terim bulunamadi.', 404);
    const b = req.body || {};
    const data = {};
    for (const k of ['term', 'definition', 'text_id']) if (b[k] != null) data[k] = b[k].trim();
    const row = await prisma.glossaryTerm.update({ where: { id: req.params.id }, data });
    res.json(row);
  }),
);

app.delete(
  '/api/projects/:pid/glossary/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.glossaryTerm.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Terim bulunamadi.', 404);
    await prisma.traceabilityLink.deleteMany({
      where: { projectId: pid, OR: [{ fromId: req.params.id }, { toId: req.params.id }] },
    });
    await prisma.glossaryTerm.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

app.post(
  '/api/projects/:pid/glossary/batch-delete',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const n = await batchDelete(pid, 'glossaryTerm', req.body?.ids, 'glossary');
    res.json({ ok: true, deleted: n });
  }),
);

// ===========================================================================
//  LINKS (traceability)
// ===========================================================================
app.get(
  '/api/projects/:pid/links',
  wrap(async (req, res) => {
    const rows = await prisma.traceabilityLink.findMany({ where: { projectId: req.params.pid } });
    res.json(rows);
  }),
);

// Yardimci: proje icindeki bir id'yi req/test/glossary olarak coz.
async function resolveNode(pid, id) {
  const req = await prisma.requirement.findUnique({ where: { id } });
  if (req && req.projectId === pid) return { kind: 'requirement', node: req };
  const test = await prisma.testCase.findUnique({ where: { id } });
  if (test && test.projectId === pid) return { kind: 'test', node: test };
  const glo = await prisma.glossaryTerm.findUnique({ where: { id } });
  if (glo && glo.projectId === pid) return { kind: 'glossary', node: { ...glo, type: 'Glossary' } };
  return null;
}

// Tek bir bagi kurar (dogrulama + create + Verifies alan/durum senkron + audit).
// Cascade CAGRILMAZ; cagiran taraf toplu islem sonunda bir kez cascade eder.
// idempotent: ayni bag zaten varsa yeniden olusturmaz, mevcut olani doner.
async function createOneLink(pid, { fromId, toId, type, testStatus: _testStatus }) {
  if (!fromId || !toId || !type) throw bad('fromId, toId, type zorunlu.');

  const fromR = await resolveNode(pid, fromId);
  const toR = await resolveNode(pid, toId);
  if (!fromR || !toR) throw bad('Bag icin gecersiz dugum(ler).');

  const check = validateLink(fromR.node, toR.node, type, toR.kind);
  if (!check.ok) throw bad(check.error);

  // NOT: Bir test artik BIRDEN FAZLA gereksinimi dogrulayabilir (coklu Verifies).
  // Tek-gereksinim kisiti kaldirildi. Ayrica Verifies baginda testin alan/
  // oncelik/dal/sonuc degerleri ARTIK OTOMATIK doldurulmaz; bunlar teste elle
  // girilir (bir test farkli tipte/alanda gereksinimlere baglanabildiginden
  // otomatik kopyalama anlamsizdir).

  // Ayni bag zaten varsa tekrar olusturma (toplu islemde guvenli).
  const dup = await prisma.traceabilityLink.findFirst({ where: { projectId: pid, fromId, toId, type } });
  const link =
    dup ||
    (await prisma.traceabilityLink.create({
      data: { projectId: pid, fromId, toId, type, createdBy: 'ehsim.user' },
    }));
  if (!dup) {
    await audit(pid, {
      action: 'LINK',
      entityType: 'link',
      entityId: link.id,
      textId: `${fromR.node.text_id} -> ${toR.node.text_id}`,
      message: `Bag kuruldu: ${fromR.node.text_id} «${type}» ${toR.node.text_id}.`,
    });
  }
  return link;
}

app.post(
  '/api/projects/:pid/links',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { fromId, toId, type, testStatus: _testStatus } = req.body || {};
    const link = await createOneLink(pid, { fromId, toId, type, testStatus: _testStatus });
    await cascade(pid);
    res.status(201).json(link);
  }),
);

// --- TOPLU BAG: bir HEDEF'e (target) secilen tum kaynaklari zincirle ---------
//  Body: { type, targetId, sourceIds: [...], testStatus? }
//  DEPOLAMA YONU her tipte AYNI: fromId = targetId (ust/gereksinim),
//  toId = her sourceId (alt/test/terim). Boylece Satisfies/Verifies/Assigned To
//  icin tek, tutarli bir cagri yeterlidir.
app.post(
  '/api/projects/:pid/links/batch',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { type, targetId, sourceIds, testStatus } = req.body || {};
    if (!type || !targetId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      throw bad('type, targetId ve en az bir sourceId zorunlu.');
    }
    const results = { linked: 0, skipped: [] };
    for (const sourceId of sourceIds) {
      if (sourceId === targetId) {
        results.skipped.push({ id: sourceId, reason: 'self' });
        continue;
      }
      try {
        await createOneLink(pid, { fromId: targetId, toId: sourceId, type, testStatus });
        results.linked += 1;
      } catch (e) {
        // Bir kaynak baglanamazsa (orn. test zaten bagli) atla, digerlerine devam et.
        results.skipped.push({ id: sourceId, reason: e?.message || 'hata' });
      }
    }
    await cascade(pid);
    res.status(201).json(results);
  }),
);

app.delete(
  '/api/projects/:pid/links/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.traceabilityLink.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Bag bulunamadi.', 404);
    await prisma.traceabilityLink.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'UNLINK',
      entityType: 'link',
      entityId: req.params.id,
      message: `Bag koparildi (${before.type}).`,
    });
    await cascade(pid);
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  AUDIT
// ===========================================================================
app.get(
  '/api/projects/:pid/audit',
  wrap(async (req, res) => {
    const rows = await prisma.auditLog.findMany({
      where: { projectId: req.params.pid },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    res.json(rows);
  }),
);

// ===========================================================================
//  RECOMPUTE (cascade) — manuel tetik
// ===========================================================================
app.post(
  '/api/projects/:pid/recompute',
  wrap(async (req, res) => {
    const n = await cascade(req.params.pid);
    res.json({ updated: n });
  }),
);

// ===========================================================================
//  ROLES (proje bazli, dinamik roller + 12 kademeli izin)
// ===========================================================================
app.get(
  '/api/projects/:pid/roles',
  wrap(async (req, res) => {
    const rows = await prisma.role.findMany({ where: { projectId: req.params.pid }, orderBy: { createdAt: 'asc' } });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/roles',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { name, permissions } = req.body || {};
    if (!name || !name.trim()) throw bad('Rol adi zorunlu.');
    const row = await prisma.role.create({
      data: { projectId: pid, name: name.trim(), permissions: permissions || {} },
    });
    await audit(pid, {
      action: 'ROLE_CREATE',
      entityType: 'role',
      entityId: row.id,
      message: `Rol olusturuldu: "${row.name}".`,
    });
    res.status(201).json(row);
  }),
);

app.put(
  '/api/projects/:pid/roles/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Rol bulunamadi.', 404);
    const { name, permissions } = req.body || {};
    const data = {};
    if (name != null) data.name = name.trim();
    if (permissions != null) data.permissions = permissions;
    const row = await prisma.role.update({ where: { id: req.params.id }, data });
    await audit(pid, {
      action: 'ROLE_UPDATE',
      entityType: 'role',
      entityId: row.id,
      message: `Rol guncellendi: "${row.name}".`,
    });
    // Izinler degistiginde onay durumlari etkilenebilir; yeniden hesapla.
    await recomputeAllApprovals(pid);
    res.json(row);
  }),
);

app.delete(
  '/api/projects/:pid/roles/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Rol bulunamadi.', 404);
    await prisma.role.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'ROLE_DELETE',
      entityType: 'role',
      entityId: req.params.id,
      message: `Rol silindi: "${before?.name || ''}".`,
    });
    await recomputeAllApprovals(pid);
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  PERSONNEL (passcode ile giren atanmis kisiler)
// ===========================================================================
app.get(
  '/api/projects/:pid/personnel',
  wrap(async (req, res) => {
    const rows = await prisma.personnel.findMany({
      where: { projectId: req.params.pid },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/personnel',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { firstName, lastName, roleId } = req.body || {};
    if (!firstName || !firstName.trim()) throw bad('Ad zorunlu.');
    if (!lastName || !lastName.trim()) throw bad('Soyad zorunlu.');
    if (!roleId) throw bad('Rol zorunlu.');
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role || role.projectId !== pid) throw bad('Gecersiz rol.', 400);
    const passcode = await generatePasscode();
    const row = await prisma.personnel.create({
      data: { projectId: pid, roleId, firstName: firstName.trim(), lastName: lastName.trim(), passcode },
      include: { role: true },
    });
    await audit(pid, {
      action: 'PERSONNEL_CREATE',
      entityType: 'personnel',
      entityId: row.id,
      message: `Personel eklendi: "${row.firstName} ${row.lastName}" (${role.name}), passcode: ${passcode}.`,
    });
    await recomputeAllApprovals(pid);
    res.status(201).json(row);
  }),
);

app.delete(
  '/api/projects/:pid/personnel/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.personnel.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Personel bulunamadi.', 404);
    await prisma.personnel.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'PERSONNEL_DELETE',
      entityType: 'personnel',
      entityId: req.params.id,
      message: `Personel silindi: "${before?.firstName || ''} ${before?.lastName || ''}".`,
    });
    await recomputeAllApprovals(pid);
    res.json({ ok: true });
  }),
);

// ===========================================================================
//  APPROVALS (consensus onay + kilitleme)
// ===========================================================================
// Bir projedeki TUM gereksinim ve testlerin onay durumunu yeniden hesapla.
async function recomputeAllApprovals(pid) {
  const [reqs, tests] = await Promise.all([
    prisma.requirement.findMany({ where: { projectId: pid }, select: { id: true } }),
    prisma.testCase.findMany({ where: { projectId: pid }, select: { id: true } }),
  ]);
  for (const r of reqs) await recomputeApproval(pid, 'requirement', r.id);
  for (const t of tests) await recomputeApproval(pid, 'testcase', t.id);
}

app.get(
  '/api/projects/:pid/approvals',
  wrap(async (req, res) => {
    const rows = await prisma.approval.findMany({ where: { projectId: req.params.pid } });
    res.json(rows);
  }),
);

// Oy ver / geri cek (toggle). Kilitliyken yalnizca PM degistirebilir.
app.post(
  '/api/projects/:pid/approvals/vote',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { entityType, entityId, voterId, voterName, personnelId } = req.body || {};
    if (!entityType || !entityId || !voterId) throw bad('entityType, entityId, voterId zorunlu.');
    if (!['requirement', 'testcase'].includes(entityType)) throw bad('Gecersiz entityType.');
    const model = entityType === 'requirement' ? 'requirement' : 'testCase';
    const entity = await prisma[model].findUnique({ where: { id: entityId } });
    if (!entity || entity.projectId !== pid) throw bad('Varlik bulunamadi.', 404);
    if (entity.locked && voterId !== 'PM') {
      throw bad('Bu kayit onaylandi ve kilitli. Yalnizca Proje Yoneticisi kilidi acabilir.', 403);
    }
    const existing = await prisma.approval.findFirst({ where: { projectId: pid, entityType, entityId, voterId } });
    if (existing) {
      await prisma.approval.delete({ where: { id: existing.id } });
      await audit(pid, {
        action: 'APPROVAL_WITHDRAW',
        entityType,
        entityId,
        textId: entity.text_id,
        actor: voterName || voterId,
        message: `Onay geri cekildi: ${voterName || voterId}.`,
      });
    } else {
      await prisma.approval.create({
        data: {
          projectId: pid,
          entityType,
          entityId,
          voterId,
          voterName: voterName || voterId,
          personnelId: personnelId || null,
        },
      });
      await audit(pid, {
        action: 'APPROVAL_VOTE',
        entityType,
        entityId,
        textId: entity.text_id,
        actor: voterName || voterId,
        message: `Onaylandi: ${voterName || voterId}.`,
      });
    }
    const state = await recomputeApproval(pid, entityType, entityId);
    res.json(state);
  }),
);

// PM kilit acar: PM'in onayini geri ceker -> durum Beklemede'ye doner.
app.post(
  '/api/projects/:pid/approvals/unlock',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { entityType, entityId } = req.body || {};
    if (!entityType || !entityId) throw bad('entityType, entityId zorunlu.');
    await prisma.approval.deleteMany({ where: { projectId: pid, entityType, entityId, voterId: 'PM' } });
    const model = entityType === 'requirement' ? 'requirement' : 'testCase';
    const entity = await prisma[model].findUnique({ where: { id: entityId } });
    await audit(pid, {
      action: 'UNLOCK',
      entityType,
      entityId,
      textId: entity?.text_id,
      actor: 'Proje Yoneticisi',
      message: 'Kilit acildi; PM onayi geri cekildi, durum Beklemede.',
    });
    const state = await recomputeApproval(pid, entityType, entityId);
    res.json(state);
  }),
);

// Onay detay matrisi (PM'e ozel): her gerekli oy verenin oy durumu.
app.get(
  '/api/projects/:pid/approvals/matrix',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { entityType, entityId } = req.query;
    if (!entityType || !entityId) throw bad('entityType, entityId zorunlu.');
    const model = entityType === 'requirement' ? 'requirement' : 'testCase';
    const entity = await prisma[model].findUnique({ where: { id: String(entityId) } });
    if (!entity || entity.projectId !== pid) throw bad('Varlik bulunamadi.', 404);
    const { requiredPersonnel } = await requiredVotersFor(pid, entityType, entity);
    const approvals = await prisma.approval.findMany({
      where: { projectId: pid, entityType, entityId: String(entityId) },
    });
    const votedIds = new Set(approvals.map((a) => a.voterId));
    const voters = [
      { voterId: 'PM', name: 'Proje Yoneticisi', role: 'Proje Yoneticisi', voted: votedIds.has('PM') },
      ...requiredPersonnel.map((p) => ({
        voterId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        role: p.role?.name || '-',
        voted: votedIds.has(p.id),
      })),
    ];
    res.json({
      approvalStatus: entity.approvalStatus,
      locked: entity.locked,
      textId: entity.text_id,
      title: entity.title,
      voters,
    });
  }),
);

// --- 404 ---
app.use((req, res) => res.status(404).json({ error: `Bulunamadi: ${req.method} ${req.path}` }));

// Test ortaminda (node:test + supertest) dinlemeye kapilmayalim; app disa
// aktarilir, supertest kendi portunu yonetir.
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[api] EHSIM RMT backend calisiyor -> http://localhost:${PORT}/api`);
  });
}

export default app;
