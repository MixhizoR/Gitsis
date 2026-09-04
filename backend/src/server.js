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
import { STATUS } from './constants.js';
import { validateLink } from './logic.js';
import { recomputeStatusesBulk, recomputeApprovalsBulk } from './cascade.js';
import { requireAuth, requirePM, projectAccessGuard, hashPassword, verifyPassword, signToken } from './auth.js';
import { cleanRichText } from './sanitize.js';
import traceabilityRoutes from './traceability.js';
import { getImpactTree } from './impact.js';
import { getTreeChildren, getTreeAncestorPath } from './tree.js';
import { nextTextId as nextTextIdShared } from './idGen.js';
import { moveRequirement, splitRequirement, mergeRequirements } from './treeOps.js';
import {
  getNavLayout,
  createGroup as createNavGroup,
  updateGroup as updateNavGroup,
  deleteGroup as deleteNavGroup,
  createItem as createNavItem,
  updateItem as updateNavItem,
  deleteItem as deleteNavItem,
  ensureMaterialized as ensureNavMaterialized,
} from './nav.js';
import { setProjectCodePrefix } from './textIdPrefix.js';
import { parseReqIF } from './reqifParser.js';
import {
  listDefs,
  validateAndMergeAttributes,
  extractAttributeInput,
  seedDefaultAttributeDefinitions,
  normalizeDefinitionInput,
  flatten,
  flattenAll,
} from './attributes.js';
import { contentFieldsChanged, nextHistoryVersion, SUSPECT_LINK_TYPES } from './versioning.js';

const prisma = new PrismaClient();
const app = express();
app.set('trust proxy', 1);
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

// --- text_id ureteci: idGen.js'e tasindi (Issue #9 / Adim 3) — split'in yeni
//  text_id'leri de ayni kara-liste garantisiyle, interaktif transaction
//  icinden uretebilmesi icin paylasilabilir hale getirildi.
const nextTextId = (projectId, type, isTest) => nextTextIdShared(prisma, projectId, type, isTest);

// --- Cascade: bir projedeki tum gereksinim durumlarini yeniden hesapla ------
//  Issue #15: N+1 dongu yerine cascade.js'teki toplu SQL yolu (1 okuma +
//  <=3 updateMany + 1 toplu audit). Sadece degisen gereksinimler yazilir.
async function cascade(projectId) {
  return recomputeStatusesBulk(prisma, projectId);
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

// --- Issue #57: approve izni denetimi ---------------------------------------
//  Clear-suspect islemleri icin: PM her zaman yetkili; personel ise yalnizca
//  rolunde o bilesen icin approve izni varsa yetkilidir (vote handler ile ayni
//  kural, tek kaynak: componentKeyOf + role.permissions.approve).
async function assertApprovePermission(req, pid, entityType, entity) {
  if (req.auth?.isPM) return;
  if (req.auth?.kind !== 'personnel') throw bad('Gecersiz kimlik.', 401);
  const pers = await prisma.personnel.findUnique({
    where: { id: req.auth.personnelId },
    select: { role: { select: { permissions: true } } },
  });
  const perm = (pers?.role?.permissions || {}).approve || {};
  const compKey = componentKeyOf(entityType, entity.type);
  if (!perm.enabled || !Array.isArray(perm.components) || !perm.components.includes(compKey))
    throw bad('Bu bilesen icin onaylama yetkiniz yok.', 403);
}

// --- Aktor (kim degistirdi) -------------------------------------------------
//  PM -> userId; personel -> personnelId; bilinmeyen -> 'unknown'.
function actorOf(req) {
  if (req.auth?.isPM) return req.auth.userId;
  if (req.auth?.kind === 'personnel') return req.auth.personnelId;
  return req.auth?.userId || 'unknown';
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
  return { requiredPersonnel, requiredVoterIds: requiredPersonnel.map((p) => p.id) };
}

async function recomputeApproval(pid, entityType, entityId) {
  const model = entityType === 'requirement' ? 'requirement' : 'testCase';
  const entity = await prisma[model].findUnique({ where: { id: entityId } });
  if (!entity || entity.projectId !== pid) throw bad('Varlik bulunamadi.', 404);
  const { requiredVoterIds } = await requiredVotersFor(pid, entityType, entity);
  const approvals = await prisma.approval.findMany({ where: { projectId: pid, entityType, entityId } });
  const votedIds = new Set(approvals.map((a) => a.voterId));
  const allPersonnelVoted = requiredVoterIds.every((v) => votedIds.has(v));
  const pmUsers = await prisma.user.findMany({
    where: { id: { in: Array.from(votedIds) }, role: 'Proje Yoneticisi' },
    select: { id: true },
  });
  const pmVoted = pmUsers.length > 0;
  const approved = allPersonnelVoted && pmVoted;
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
    const { name, description, codePrefix } = req.body || {};
    if (!name || !name.trim()) throw bad('Proje adi zorunlu.');
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: (description || '').trim(),
        // Bos birakilirsa sema varsayilani (DEFAULT_CODE_PREFIX) gecerli olur.
        ...(codePrefix && codePrefix.trim() ? { codePrefix: codePrefix.trim() } : {}),
      },
    });
    // Her yeni proje, mevcut davranisi koruyan iki gomulu (system) oznitelik
    // tanimiyla baslar: Priority ve DAL Level. Bkz. src/attributes.js.
    await seedDefaultAttributeDefinitions(prisma, project.id);
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
    const { name, description, codePrefix } = req.body || {};
    const data = {};
    if (name != null) data.name = name.trim();
    if (description != null) data.description = description.trim();
    // text_id onegi: sonradan degistirilirse YENI kayitlar yeni oneki alir;
    // mevcut kayitlar icin prisma/migrate-text-id-prefix.js calistirilmalidir.
    if (codePrefix != null && codePrefix.trim()) data.codePrefix = codePrefix.trim();
    const project = await prisma.project.update({ where: { id: req.params.pid }, data });
    res.json(project);
  }),
);

// text_id kod onegini degistirir; istege bagli olarak MEVCUT kayitlari da
// yeni onege tasir (numaralar korunur, eski kodlar audit'te kara listede
// kalir). Yalnizca PM.
app.post(
  '/api/projects/:pid/code-prefix',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { codePrefix, migrateExisting } = req.body || {};
    const before = await prisma.project.findUnique({ where: { id: pid }, select: { codePrefix: true } });
    const result = await setProjectCodePrefix(prisma, pid, codePrefix, {
      migrateExisting: Boolean(migrateExisting),
    });
    await audit(pid, {
      action: 'UPDATE',
      entityType: 'project',
      entityId: pid,
      field: 'codePrefix',
      oldValue: before?.codePrefix || null,
      newValue: result.project.codePrefix,
      message: `Kod onegi degistirildi: "${before?.codePrefix}" -> "${result.project.codePrefix}"${
        result.renamed ? ` (${result.renamed} kayit tasindi)` : ''
      }.`,
    });
    res.json(result);
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
//  SOL MENU DUZENI (nav) — proje bazli gruplar + sayfa yerlesimi (Issue #9/6)
//  Okuma herkese acik; degisiklikler yalnizca PM'e (requirePM). Kullanici
//  YALNIZCA gruplama yapar — sayfa anahtarlari sabittir (navDefaults.js).
// ===========================================================================
app.get(
  '/api/projects/:pid/nav',
  wrap(async (req, res) => {
    res.json(await getNavLayout(prisma, req.params.pid));
  }),
);

// Duzenlemeye baslarken varsayilan duzeni DB'ye yazar (idempotent) — boylece
// varsayilan gruplar da id kazanir ve hedef olarak secilebilir.
app.post(
  '/api/projects/:pid/nav/materialize',
  requirePM,
  wrap(async (req, res) => {
    res.json(await ensureNavMaterialized(prisma, req.params.pid));
  }),
);

app.post(
  '/api/projects/:pid/nav/groups',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const group = await createNavGroup(prisma, pid, req.body?.name);
    await audit(pid, {
      action: 'CREATE',
      entityType: 'nav-group',
      entityId: group.id,
      message: `Menu grubu eklendi: "${group.name}".`,
    });
    res.status(201).json(group);
  }),
);

// ===========================================================================
//  ATTRIBUTE DEFINITIONS (modular oznitelikler — Requirement/TestCase JSONB
//  `attributes` alaninin semasini tanimlar; Priority ve DAL Level dahil her
//  proje icin dinamik olarak eklenip/duzenlenip/silinebilir).
// ===========================================================================
app.get(
  '/api/projects/:pid/attributes',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const where = { projectId: pid };
    if (req.query.entityType) where.entityType = { in: [req.query.entityType, 'both'] };
    const rows = await prisma.attributeDefinition.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(rows);
  }),
);

app.post(
  '/api/projects/:pid/attributes',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const payload = normalizeDefinitionInput(req.body);
    const row = await prisma.attributeDefinition.create({ data: { projectId: pid, ...payload, system: false } });
    await audit(pid, {
      action: 'ATTRIBUTE_CREATE',
      entityType: 'attribute',
      entityId: row.id,
      message: `Yeni oznitelik tanimlandi: "${row.label}" (${row.entityType}).`,
    });
    res.status(201).json(row);
  }),
);

app.patch(
  '/api/projects/:pid/nav/groups/:id',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const group = await updateNavGroup(prisma, pid, req.params.id, req.body || {});
    await audit(pid, {
      action: 'UPDATE',
      entityType: 'nav-group',
      entityId: group.id,
      message: `Menu grubu guncellendi: "${group.name}".`,
    });
    res.json(group);
  }),
);

app.delete(
  '/api/projects/:pid/nav/groups/:id',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const result = await deleteNavGroup(prisma, pid, req.params.id);
    await audit(pid, {
      action: 'DELETE',
      entityType: 'nav-group',
      entityId: req.params.id,
      message: `Menu grubu silindi; ${result.movedToUngrouped} sayfa grupsuz seviyeye tasindi.`,
    });
    res.json(result);
  }),
);

// Sayfa ekleme: gruba yeni bir menu ogesi (sabit temel tip + istege bagli
// ozel ad ve Alan filtresi). Ayni tipten birden fazla sayfa eklenebilir.
app.post(
  '/api/projects/:pid/nav/items',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    const item = await createNavItem(prisma, pid, {
      groupId: b.groupId ?? null,
      pageKey: b.pageKey,
      label: b.label,
      fieldFilter: b.fieldFilter,
    });
    await audit(pid, {
      action: 'CREATE',
      entityType: 'nav-item',
      entityId: item.id,
      message: `Menu sayfasi eklendi: "${item.label || item.pageKey}".`,
    });
    res.status(201).json(item);
  }),
);

app.patch(
  '/api/projects/:pid/nav/items/:id',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const item = await updateNavItem(prisma, pid, req.params.id, req.body || {});
    await audit(pid, {
      action: 'UPDATE',
      entityType: 'nav-item',
      entityId: item.id,
      message: `Menu ogesi guncellendi: "${item.label || item.pageKey}".`,
    });
    res.json(item);
  }),
);

// Menuden kaldirir; gereksinim/test VERILERINE dokunmaz.
app.delete(
  '/api/projects/:pid/nav/items/:id',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const result = await deleteNavItem(prisma, pid, req.params.id);
    await audit(pid, {
      action: 'DELETE',
      entityType: 'nav-item',
      entityId: req.params.id,
      message: `Menu ogesi kaldirildi: "${result.pageKey}" (veriler silinmedi).`,
    });
    res.json(result);
  }),
);

app.patch(
  '/api/projects/:pid/attributes/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.attributeDefinition.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Oznitelik bulunamadi.', 404);
    // key/entityType/dataType degistirilemez — mevcut veriyle tutarliligi bozar.
    // Yalnizca goruntu/kural alanlari duzenlenebilir.
    const b = req.body || {};
    const data = {};
    if (b.label != null) data.label = String(b.label).trim() || before.label;
    if (b.required != null) data.required = Boolean(b.required);
    if (b.order != null && Number.isFinite(Number(b.order))) data.order = Number(b.order);
    if (b.defaultValue !== undefined) data.defaultValue = b.defaultValue === '' ? null : String(b.defaultValue);
    if (before.dataType === 'select' && Array.isArray(b.options)) {
      const options = b.options
        .map((o) => {
          if (typeof o === 'string') return { value: o.trim(), label: o.trim() };
          const value = String(o?.value ?? '').trim();
          const optLabel = String(o?.label ?? value).trim();
          return value ? { value, label: optLabel || value } : null;
        })
        .filter(Boolean);
      if (options.length === 0) throw bad('Secim (select) tipi oznitelik icin en az bir secenek gerekli.');
      data.options = options;
    }
    const row = await prisma.attributeDefinition.update({ where: { id: req.params.id }, data });
    await audit(pid, {
      action: 'ATTRIBUTE_UPDATE',
      entityType: 'attribute',
      entityId: row.id,
      message: `Oznitelik guncellendi: "${row.label}".`,
    });
    res.json(row);
  }),
);

app.delete(
  '/api/projects/:pid/attributes/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.attributeDefinition.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Oznitelik bulunamadi.', 404);
    if (before.system) throw bad('Gomulu oznitelikler (Priority, DAL Level) silinemez.', 403);
    await prisma.attributeDefinition.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'ATTRIBUTE_DELETE',
      entityType: 'attribute',
      entityId: req.params.id,
      message: `Oznitelik silindi: "${before.label}".`,
    });
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
    res.json(flattenAll(rows));
  }),
);

app.post(
  '/api/projects/:pid/requirements',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const b = req.body || {};
    if (!b.type) throw bad('Gereksinim tipi zorunlu.');
    const text_id = (b.text_id && b.text_id.trim()) || (await nextTextId(pid, b.type, false));
    const defs = await listDefs(prisma, pid, 'requirement');
    const attributes = validateAndMergeAttributes(defs, extractAttributeInput(b), {}, { isCreate: true });
    // Yeni gereksinim: durum daima 'In Review' (henuz bagli test yok, kilitli).
    const row = await prisma.requirement.create({
      data: {
        projectId: pid,
        text_id,
        title: (b.title || 'Adsiz gereksinim').trim(),
        description: cleanRichText((b.description || '').trim()),
        type: b.type,
        field: b.field || null,
        status: STATUS.IN_REVIEW,
        attributes,
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
    res.status(201).json(flatten(row));
  }),
);

// PBS agaci (Issue #9 / Adim 2): lazy-load cocuk sorgusu + ust-zincir.
// Sabit path'ler ("/tree") parametreli "/:id" route'undan ONCE tanimlanmali,
// yoksa Express "tree"yi :id olarak yakalar.
app.get(
  '/api/projects/:pid/requirements/tree',
  wrap(async (req, res) => {
    const parentId = req.query.parentId ? String(req.query.parentId).trim() : null;
    const items = await getTreeChildren(req.params.pid, parentId);
    res.json({ items });
  }),
);

app.get(
  '/api/projects/:pid/requirements/:id/ancestors',
  wrap(async (req, res) => {
    const path = await getTreeAncestorPath(req.params.pid, req.params.id);
    if (!path) throw bad('Gereksinim bulunamadi.', 404);
    res.json({ path });
  }),
);

app.get(
  '/api/projects/:pid/requirements/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const row = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!row || row.projectId !== pid) throw bad('Gereksinim bulunamadi.', 404);
    res.json(flatten(row));
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
    for (const k of ['text_id', 'title', 'description', 'field']) {
      if (b[k] != null) data[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
    }
    if (data.description != null) data.description = cleanRichText(data.description);
    if (b.relatedDocuments != null) data.relatedDocuments = normalizeDocuments(b.relatedDocuments);
    const attrInput = extractAttributeInput(b);
    if (Object.keys(attrInput).length > 0) {
      const defs = await listDefs(prisma, pid, 'requirement');
      data.attributes = validateAndMergeAttributes(defs, attrInput, before.attributes || {});
    }
    // Issue #57: yalnizca ICERIK alanlari (title/description/field + attributes
    // icindeki priority/dal_level) degistiginde history + suspect tetiklenir.
    // Status/approvalStatus/locked/updatedAt otomatik cascade tarafindan
    // dogrudan yazilir (PUT'a ugramaz) — bu yuzden burada tetiklenmezler.
    const contentChanged = contentFieldsChanged(before, data);
    const actor = actorOf(req);
    // Kopyalama + UPDATE + AuditLog tek $transaction (issue: kim neyi degistirdi
    // tek yerden; eski versiyon her zaman onceki durumu saklar).
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.requirement.update({ where: { id: req.params.id }, data });
      const auditRow = await tx.auditLog.create({
        data: {
          projectId: pid,
          action: 'UPDATE',
          entityType: 'requirement',
          entityId: updated.id,
          textId: updated.text_id,
          actor,
          message: `Gereksinim guncellendi: "${updated.title}".`,
        },
      });
      if (contentChanged) {
        // SCD Type 4: degisiklik ONCESI durum, versiyon numarasiyla saklanir.
        await tx.requirementHistory.create({
          data: {
            projectId: pid,
            requirementId: updated.id,
            version: await nextHistoryVersion(tx, updated.id),
            text_id: before.text_id,
            title: before.title,
            description: before.description,
            type: before.type,
            field: before.field,
            status: before.status,
            approvalStatus: before.approvalStatus,
            locked: before.locked,
            attributes: before.attributes || {},
            author: before.author,
            relatedDocuments: before.relatedDocuments,
            changedAt: new Date(),
            changedBy: actor,
            auditLogId: auditRow.id,
          },
        });
        // Downstream suspect: degisen gereksinimin Satisfies (alt gereksinimler)
        // ve Verifies (testler) baglarini isaretle. Alt degisimi ust baglarini
        // (toId oldugu baglar) suspect YAPMAZ.
        await tx.traceabilityLink.updateMany({
          where: { projectId: pid, fromId: updated.id, type: { in: SUSPECT_LINK_TYPES } },
          data: { isSuspect: true },
        });
      }
      return updated;
    });
    res.json(flatten(row));
  }),
);

// Issue #57: gereksinimin versiyon gecmisi (SCD Type 4) — salt okunur.
//  GET /api/projects/:pid/requirements/:id/history
app.get(
  '/api/projects/:pid/requirements/:id/history',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const row = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!row || row.projectId !== pid) throw bad('Gereksinim bulunamadi.', 404);
    const history = await prisma.requirementHistory.findMany({
      where: { projectId: pid, requirementId: req.params.id },
      orderBy: { version: 'desc' },
    });
    res.json(flattenAll(history));
  }),
);

// Issue #57: bir gereksinimin TUM supheli baglarini temizle (yalnizca approve
//  izni olanlar; islem AuditLog'a yazilir).
app.post(
  '/api/projects/:pid/requirements/:id/clear-suspect',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const before = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!before || before.projectId !== pid) throw bad('Gereksinim bulunamadi.', 404);
    await assertApprovePermission(req, pid, 'requirement', before);
    const r = await prisma.traceabilityLink.updateMany({
      where: {
        projectId: pid,
        fromId: before.id,
        isSuspect: true,
        type: { in: SUSPECT_LINK_TYPES },
      },
      data: { isSuspect: false },
    });
    await audit(pid, {
      action: 'SUSPECT_CLEAR',
      entityType: 'requirement',
      entityId: before.id,
      textId: before.text_id,
      actor: actorOf(req),
      message: `Supheli baglar temizlendi (${r.count}): "${before.title}".`,
    });
    res.json({ ok: true, cleared: r.count });
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

// --- PBS agaci yapisal islemleri (Issue #9 / Adim 3) -------------------------
//  Tasima/bolme/birlestirme atomik transaction icinde (treeOps.js); dongusel
//  tasima ve tip uyumsuzlugu 400 doner; text_id'ler asla bozulmaz/yeniden
//  kullanilmaz.
app.patch(
  '/api/projects/:pid/requirements/:id/move',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const newParentId = req.body?.parentId ?? null;
    const actor = req.auth?.userId || 'ehsim.user';
    const row = await moveRequirement(prisma, pid, req.params.id, newParentId, actor);
    res.json(row);
  }),
);

app.post(
  '/api/projects/:pid/requirements/:id/split',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const actor = req.auth?.userId || 'ehsim.user';
    const result = await splitRequirement(prisma, pid, req.params.id, req.body?.newTitles, actor);
    res.status(201).json(result);
  }),
);

app.post(
  '/api/projects/:pid/requirements/merge',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const actor = req.auth?.userId || 'ehsim.user';
    const survivor = await mergeRequirements(prisma, pid, req.body?.ids, actor);
    res.json(survivor);
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
    res.json(flattenAll(rows));
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
    const defs = await listDefs(prisma, pid, 'testcase');
    // Test senaryolarinda oznitelikler bos birakilabilir (zorunlu degil); yalnizca
    // gonderilenler dogrulanir, bos birakilanlar null kalir.
    const attrInput = extractAttributeInput(b);
    const attributes = validateAndMergeAttributes(
      defs.map((d) => ({ ...d, required: false })),
      attrInput,
      {},
      { isCreate: false },
    );
    const row = await prisma.testCase.create({
      data: {
        projectId: pid,
        text_id,
        title: (b.title || 'Adsiz test').trim(),
        description: cleanRichText((b.description || '').trim()),
        type: b.type,
        field: b.field || null,
        attributes,
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
    res.status(201).json(flatten(row));
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
    if (b.field !== undefined) data.field = b.field === null ? null : String(b.field).trim() || null;
    // Oznitelikler (Priority, DAL Level, ozel alanlar) elle duzenlenebilir (bagdan bagimsiz).
    const attrInput = extractAttributeInput(b);
    if (Object.keys(attrInput).length > 0) {
      const defs = await listDefs(prisma, pid, 'testcase');
      data.attributes = validateAndMergeAttributes(
        defs.map((d) => ({ ...d, required: false })),
        attrInput,
        before.attributes || {},
      );
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
    res.json(flatten(row));
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
    const text_id = (b.text_id && b.text_id.trim()) || (await nextTextId(pid, 'glossary', false));
    const row = await prisma.glossaryTerm.create({
      data: {
        projectId: pid,
        text_id,
        term: b.term.trim(),
        definition: cleanRichText((b.definition || '').trim()),
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
    if (data.definition != null) data.definition = cleanRichText(data.definition);
    const row = await prisma.glossaryTerm.update({ where: { id: req.params.id }, data });
    await audit(pid, {
      action: 'UPDATE',
      entityType: 'glossary',
      entityId: row.id,
      textId: row.text_id,
      message: `Sozluk terimi guncellendi: "${row.term}".`,
    });
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
    await audit(pid, {
      action: 'DELETE',
      entityType: 'glossary',
      entityId: req.params.id,
      textId: before.text_id,
      message: `Sozluk terimi silindi: "${before.term}".`,
    });
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

// Issue #57: TEK bir supheli bagi temizle (yalnizca approve izni olanlar;
//  izin, bagin fromId'sindeki gereksinimin bilesenine gore denetlenir).
app.post(
  '/api/projects/:pid/links/:id/clear-suspect',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const link = await prisma.traceabilityLink.findUnique({ where: { id: req.params.id } });
    if (!link || link.projectId !== pid) throw bad('Bag bulunamadi.', 404);
    const from = await prisma.requirement.findUnique({ where: { id: link.fromId } });
    if (!from || from.projectId !== pid) throw bad('Bag kaynagi bulunamadi.', 404);
    await assertApprovePermission(req, pid, 'requirement', from);
    const updated = await prisma.traceabilityLink.update({ where: { id: link.id }, data: { isSuspect: false } });
    await audit(pid, {
      action: 'SUSPECT_CLEAR',
      entityType: 'link',
      entityId: link.id,
      textId: `${from.text_id} -> ${updated.toId}`,
      actor: actorOf(req),
      message: `Supheli bag temizlendi: ${from.text_id} (${link.type}).`,
    });
    res.json({ ok: true, cleared: 1 });
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
//  SNAPSHOTS (baseline / sürüm) — proje anlık görüntüleri.
//  Issue #8: Sürüm Yönetimi (Snapshot) Altyapısı.
//  PM: create/delete/list/view. Personel: list/view (read-only).
// ===========================================================================
app.get(
  '/api/projects/:pid/snapshots',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const take = Math.min(Number(req.query.take) || 20, 100);
    const skip = Number(req.query.skip) || 0;
    const [rows, total] = await Promise.all([
      prisma.projectSnapshot.findMany({
        where: { projectId: pid },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { items: false },
      }),
      prisma.projectSnapshot.count({ where: { projectId: pid } }),
    ]);
    res.json({ data: rows, total, take, skip });
  }),
);

app.post(
  '/api/projects/:pid/snapshots',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { name } = req.body || {};
    if (!name || !name.trim()) throw bad('Snapshot adı zorunlu.');

    // Mevcut tüm varlıkları topla.
    const [requirements, testCases, glossary, links] = await Promise.all([
      prisma.requirement.findMany({ where: { projectId: pid } }),
      prisma.testCase.findMany({ where: { projectId: pid } }),
      prisma.glossaryTerm.findMany({ where: { projectId: pid } }),
      prisma.traceabilityLink.findMany({ where: { projectId: pid } }),
    ]);

    // Link'ler için text_id'leri önceden çöz (fromId/toId -> text_id) - zaten çekilen verilerden
    const reqMap = Object.fromEntries(requirements.map((r) => [r.id, r.text_id]));
    const tcMap = Object.fromEntries(testCases.map((t) => [t.id, t.text_id]));
    const gloMap = Object.fromEntries(glossary.map((g) => [g.id, g.text_id]));

    // Snapshot + items tek transaction içinde.
    const snapshot = await prisma.$transaction(async (tx) => {
      const snap = await tx.projectSnapshot.create({
        data: { projectId: pid, name: name.trim(), createdBy: req.auth?.userId || 'pm' },
      });

      const items = [];
      for (const r of requirements) {
        items.push({ snapshotId: snap.id, entityType: 'requirement', entityId: r.id, data: flatten(r) });
      }
      for (const t of testCases) {
        items.push({ snapshotId: snap.id, entityType: 'testcase', entityId: t.id, data: flatten(t) });
      }
      for (const g of glossary) {
        items.push({ snapshotId: snap.id, entityType: 'glossary', entityId: g.id, data: g });
      }
      for (const l of links) {
        // Link verisinde fromTextId ve toTextId ekle (snapshot zamanındaki text_id'ler)
        // Sadece gerekli alanları al (Prisma relation alanlarını exclude et)
        const fromTextId = reqMap[l.fromId] || tcMap[l.fromId] || gloMap[l.fromId] || l.fromId;
        const toTextId = reqMap[l.toId] || tcMap[l.toId] || gloMap[l.toId] || l.toId;
        const linkData = {
          id: l.id,
          projectId: l.projectId,
          fromId: l.fromId,
          toId: l.toId,
          type: l.type,
          createdAt: l.createdAt,
          createdBy: l.createdBy,
          fromTextId,
          toTextId,
        };
        items.push({ snapshotId: snap.id, entityType: 'link', entityId: l.id, data: linkData });
      }

      if (items.length > 0) {
        await tx.snapshotItem.createMany({ data: items });
      }

      return snap;
    });

    await audit(pid, {
      action: 'SNAPSHOT_CREATE',
      entityType: 'snapshot',
      entityId: snapshot.id,
      textId: snapshot.name,
      actor: req.auth?.userId || 'pm',
      message: `Snapshot alındı: "${snapshot.name}".`,
    });

    res.status(201).json(snapshot);
  }),
);

app.get(
  '/api/projects/:pid/snapshots/:snapshotId',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const snapshotId = req.params.snapshotId;

    const snapshot = await prisma.projectSnapshot.findUnique({
      where: { id: snapshotId },
      include: { items: true },
    });

    if (!snapshot || snapshot.projectId !== pid) throw bad('Snapshot bulunamadi.', 404);

    res.json(snapshot);
  }),
);

app.delete(
  '/api/projects/:pid/snapshots/:snapshotId',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const snapshotId = req.params.snapshotId;

    const snapshot = await prisma.projectSnapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot || snapshot.projectId !== pid) throw bad('Snapshot bulunamadi.', 404);

    await prisma.snapshotItem.deleteMany({ where: { snapshotId } });
    await prisma.projectSnapshot.delete({ where: { id: snapshotId } });

    await audit(pid, {
      action: 'SNAPSHOT_DELETE',
      entityType: 'snapshot',
      entityId: snapshotId,
      textId: snapshot.name,
      actor: req.auth?.userId || 'pm',
      message: `Snapshot silindi: "${snapshot.name}".`,
    });

    res.json({ ok: true });
  }),
);

// ===========================================================================
//  IMPACT ANALYSIS — backend tarafinda Recursive CTE ile etki agaci.
//  Issue #46 — frontend'deki buildImpactTree'yi backend'e tasima.
// ===========================================================================
app.get(
  '/api/projects/:pid/impact',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const reqId = req.query.reqId;
    if (!reqId || !reqId.trim()) throw bad('reqId zorunlu.');
    const result = await getImpactTree(pid, reqId.trim());
    if (!result) throw bad('Gereksinim bulunamadı veya etki agaci bos.', 404);
    res.json(result);
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
//  Issue #15: N+1 dongu yerine cascade.js'teki toplu SQL yolu — oy havuzu
//  1 kez okunur, bilesen basina 2 parametrik bulk UPDATE (toplam 12) calisir;
//  degeri degismeyen kayitlara dokunulmaz.
async function recomputeAllApprovals(pid) {
  await recomputeApprovalsBulk(prisma, pid);
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
    const { entityType, entityId } = req.body || {};
    if (!entityType || !entityId) throw bad('entityType, entityId zorunlu.');
    if (!['requirement', 'testcase'].includes(entityType)) throw bad('Gecersiz entityType.');
    const model = entityType === 'requirement' ? 'requirement' : 'testCase';
    const entity = await prisma[model].findUnique({ where: { id: entityId } });
    if (!entity || entity.projectId !== pid) throw bad('Varlik bulunamadi.', 404);
    let voterId, voterName, personnelId, personnelPermissions;
    if (req.auth.isPM) {
      voterId = req.auth.userId;
      voterName = req.auth.name || 'Proje Yoneticisi';
      personnelId = null;
    } else if (req.auth.kind === 'personnel') {
      voterId = req.auth.personnelId;
      personnelId = voterId;
      const pers = await prisma.personnel.findUnique({
        where: { id: voterId },
        select: { firstName: true, lastName: true, role: { select: { permissions: true } } },
      });
      if (!pers) throw bad('Personel bulunamadi.', 404);
      voterName = (pers.firstName + ' ' + pers.lastName).trim();
      personnelPermissions = pers.role ? pers.role.permissions || {} : {};
    } else throw bad('Gecersiz kimlik.', 401);
    if (entity.locked && !req.auth.isPM)
      throw bad('Bu kayit onaylandi ve kilitli. Yalnizca Proje Yoneticisi kilidi acabilir.', 403);
    if (!req.auth.isPM) {
      const compKey = componentKeyOf(entityType, entity.type);
      const perm = personnelPermissions ? personnelPermissions.approve || {} : {};
      if (!perm.enabled || !Array.isArray(perm.components) || !perm.components.includes(compKey))
        throw bad('Bu bilesen icin onaylama yetkiniz yok.', 403);
    }
    const existing = await prisma.approval.findFirst({ where: { projectId: pid, entityType, entityId, voterId } });
    if (existing) {
      await prisma.approval.delete({ where: { id: existing.id } });
      await audit(pid, {
        action: 'APPROVAL_WITHDRAW',
        entityType,
        entityId,
        textId: entity.text_id,
        actor: voterId,
        message: `Onay geri cekildi: ${voterName}.`,
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
        actor: voterId,
        message: `Onaylandi: ${voterName}.`,
      });
    }
    const state = await recomputeApproval(pid, entityType, entityId);
    res.json(state);
  }),
);

// PM kilit acar: PM'in onayini geri ceker -> durum Beklemede'ye doner.
app.post(
  '/api/projects/:pid/approvals/unlock',
  requirePM,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { entityType, entityId } = req.body || {};
    if (!entityType || !entityId) throw bad('entityType, entityId zorunlu.');
    await prisma.approval.deleteMany({ where: { projectId: pid, entityType, entityId, voterId: req.auth.userId } });
    const model = entityType === 'requirement' ? 'requirement' : 'testCase';
    const entity = await prisma[model].findUnique({ where: { id: entityId } });
    await audit(pid, {
      action: 'UNLOCK',
      entityType,
      entityId,
      textId: entity?.text_id,
      actor: req.auth.userId,
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
//reqIF Integration
app.post(
  '/api/projects/:pid/import/reqif',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { xmlContent } = req.body || {};

    if (!xmlContent || typeof xmlContent !== 'string') {
      throw bad('Geçersiz veya boş XML içeriği.');
    }

    const { requirements, relations } = parseReqIF(xmlContent);

    const result = await prisma.$transaction(async (tx) => {
      const externalToDbIdMap = new Map();

      // 1. Gereksinimleri Ekle
      for (const reqItem of requirements) {
        const text_id = await nextTextId(pid, 'User Requirement', false);
        const created = await tx.requirement.create({
          data: {
            projectId: pid,
            text_id,
            title: (reqItem.title || 'Adsız Gereksinim').trim(),
            description: cleanRichText((reqItem.description || '').trim()),
            type: 'User Requirement',
            attributes: { priority: 'Medium' },
            status: STATUS.IN_REVIEW,
            author: 'reqif.import',
          },
        });
        externalToDbIdMap.set(reqItem.externalId, created.id);
      }

      // 2. İzlenebilirlik Bağlarını Ekle
      let createdLinksCount = 0;
      for (const rel of relations) {
        const sourceDbId = externalToDbIdMap.get(rel.sourceExternalId);
        const targetDbId = externalToDbIdMap.get(rel.targetExternalId);

        if (sourceDbId && targetDbId) {
          await tx.traceabilityLink.create({
            data: {
              projectId: pid,
              fromId: sourceDbId,
              toId: targetDbId,
              type: rel.type || 'Satisfies',
              createdBy: 'reqif.import',
            },
          });
          createdLinksCount++;
        }
      }

      return {
        importedRequirements: requirements.length,
        importedLinks: createdLinksCount,
      };
    });

    await cascade(pid);

    res.status(200).json({
      success: true,
      message: 'ReqIF başarıyla içe aktarıldı.',
      stats: result,
    });
  }),
);

export default app;
