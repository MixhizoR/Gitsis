// ============================================================================
//  comments.js  —  Ana varliklar uzerinde ekip ici YORUMLAR (generic).
//
//  KAPSAM: Yorumlar onay/review surecinin PARCASI DEGILDIR. Yorum eklemek
//  veya silmek bir kaydin status/approvalStatus/locked degerlerini ETKILEMEZ;
//  cascade tetiklenmez. Yalnizca not/soru/baglam alanidir.
//
//  GENERIC TASARIM: tek tablo tum varliklara hizmet eder (entityType +
//  entityId). Her varlik icin ayri uc/tablo yoktur.
//
//  Yollar (/api/projects/:pid/comments altinda):
//    GET    /?entityType=&entityId=  -> kronolojik liste (eskiden yeniye)
//    POST   /                        -> yorum ekle
//    DELETE /:commentId              -> yorum sil (ZORUNLU gerekce + audit)
//
//  NOT: Router :pid altinda mount edildigi icin app.param('pid',
//  projectAccessGuard) otomatik calisir (IDOR korumasi: personel yalnizca
//  kendi projesine erisir).
// ============================================================================
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireReason } from './reason.js';
import { componentKeyOf } from './constants.js';

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

const MAX_TEXT_LENGTH = 5000;

// Desteklenen varlik tipleri -> Prisma modeli. Yeni bir ana varlik yorumlanacaksa
// TEK degisiklik burasidir (frontend ayni entityType degerini gonderir).
const ENTITY_MODEL = {
  requirement: 'requirement',
  testcase: 'testCase',
  glossary: 'glossaryTerm',
};

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    if (e?.status) return res.status(e.status).json({ error: e.message });
    console.error('[comments] hata:', e?.message || e);
    res.status(500).json({ error: 'Sunucu hatasi.' });
  });

// --- Audit yardimcisi (server.js ile ayni desen) ----------------------------
async function audit(projectId, entry) {
  try {
    await prisma.auditLog.create({ data: { projectId, ...entry } });
  } catch (e) {
    console.error('[audit] yazilamadi:', e?.message || e);
  }
}

/**
 * Istegi yapan kullaniciyi cozer.
 * Yorumun yazari SUNUCUDA belirlenir; istemcinin gonderdigi authorId /
 * authorName KESINLIKLE dikkate ALINMAZ (kimlige buruneme onlemi).
 * @returns {Promise<{id:string, name:string, role:string|null, isPM:boolean}>}
 */
async function resolveAuthor(req) {
  if (req.auth?.isPM) {
    const u = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { id: true, name: true, role: true },
    });
    return {
      id: req.auth.userId,
      name: u?.name || 'Proje Yöneticisi',
      role: u?.role || 'Proje Yöneticisi',
      isPM: true,
    };
  }
  if (req.auth?.kind === 'personnel') {
    const p = await prisma.personnel.findUnique({
      where: { id: req.auth.personnelId },
      select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } },
    });
    if (!p) throw bad('Gecersiz kimlik.', 401);
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      role: p.role?.name || null,
      isPM: false,
    };
  }
  throw bad('Gecersiz kimlik.', 401);
}

/**
 * Varligin GERCEKTEN bu projede oldugunu dogrular ve kaydi dondurur.
 * Boylece baska bir projenin kaydina yorum yazilamaz (IDOR).
 */
async function assertEntityInProject(pid, entityType, entityId) {
  const model = ENTITY_MODEL[entityType];
  if (!model) throw bad('Gecersiz entityType.');
  if (!entityId || typeof entityId !== 'string') throw bad('entityId zorunlu.');
  // `type` YALNIZCA gereksinim/testte vardir (izin bileseni ondan turetilir);
  // sozluk teriminde boyle bir kolon yoktur, istenirse sorgu patlar.
  const select = entityType === 'glossary' ? { id: true } : { id: true, type: true };
  const row = await prisma[model].findFirst({ where: { id: entityId, projectId: pid }, select });
  if (!row) throw bad('Kayit bulunamadi.', 404);
  return row;
}

/**
 * Yorum EKLEME yetkisi: "ilgili kaydi okuyabilen yorum yazabilir".
 * PM her zaman yetkilidir. Personel icin MEVCUT izin altyapisi kullanilir
 * (yeni izin turu ICAT EDILMEZ): rolunde `read` izni acik olmali; gereksinim
 * ve testlerde ayrica o kaydin BILESENI (componentKeyOf) izin listesinde
 * bulunmali. Sozlukte bilesen ayrimi yoktur, `read` acik olmasi yeterlidir.
 */
async function assertCanComment(req, entityType, entity) {
  if (req.auth?.isPM) return;
  if (req.auth?.kind !== 'personnel') throw bad('Gecersiz kimlik.', 401);
  const pers = await prisma.personnel.findUnique({
    where: { id: req.auth.personnelId },
    select: { role: { select: { permissions: true } } },
  });
  const perm = (pers?.role?.permissions || {}).read || {};
  if (!perm.enabled) throw bad('Bu kayda yorum yapma yetkiniz yok.', 403);
  if (entityType === 'glossary') return; // bilesen ayrimi yok
  const compKey = componentKeyOf(entityType, entity.type);
  if (!Array.isArray(perm.components) || !perm.components.includes(compKey)) {
    throw bad('Bu kayda yorum yapma yetkiniz yok.', 403);
  }
}

// --- Liste -----------------------------------------------------------------
//  entityType + entityId verilirse o kayda ait yorumlar doner; verilmezse
//  projenin tum yorumlari (sekme rozetlerini tek istekte beslemek icin).
//  Siralama KRONOLOJIK (eskiden yeniye): yorumlar bir sohbet gibi okunur,
//  yeni yorum listenin sonunda, yazma alaninin hemen ustunde belirir.
router.get(
  '/',
  wrap(async (req, res) => {
    const { entityType, entityId } = req.query || {};
    const where = { projectId: req.params.pid };
    if (entityType || entityId) {
      if (!entityType || !entityId) throw bad('entityType ve entityId birlikte verilmelidir.');
      if (!ENTITY_MODEL[entityType]) throw bad('Gecersiz entityType.');
      where.entityType = String(entityType);
      where.entityId = String(entityId);
    }
    const rows = await prisma.comment.findMany({ where, orderBy: { createdAt: 'asc' } });
    res.json(rows);
  }),
);

// --- Ekleme ----------------------------------------------------------------
router.post(
  '/',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const { entityType, entityId } = req.body || {};
    const text = String(req.body?.text ?? '').trim();

    // Bos / yalnizca bosluk iceren yorum kabul edilmez.
    if (!text) throw bad('Yorum metni bos olamaz.');
    if (text.length > MAX_TEXT_LENGTH) throw bad(`Yorum en fazla ${MAX_TEXT_LENGTH} karakter olabilir.`);

    const entity = await assertEntityInProject(pid, entityType, entityId);
    await assertCanComment(req, entityType, entity);
    const author = await resolveAuthor(req);

    const row = await prisma.comment.create({
      data: {
        projectId: pid,
        entityType,
        entityId,
        // Yazar SUNUCUDA belirlenir — istemciden gelen authorId/authorName yok sayilir.
        authorId: author.id,
        authorName: author.name,
        authorRole: author.role,
        text,
      },
    });
    res.status(201).json(row);
  }),
);

// --- Silme (ZORUNLU gerekce + AuditLog) -------------------------------------
//  Yetki: yorumu YAZAN kendi yorumunu silebilir; PM her yorumu silebilir.
//  Baskasinin yorumunu silmek 403'tur (kontrol SUNUCUDA — istemci gizlese de
//  API'ye dogrudan istek atilarak atlatilamaz).
router.delete(
  '/:commentId',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const row = await prisma.comment.findFirst({
      where: { id: req.params.commentId, projectId: pid },
    });
    if (!row) throw bad('Yorum bulunamadi.', 404);

    const author = await resolveAuthor(req);
    const isOwner = row.authorId === author.id;
    if (!author.isPM && !isOwner) throw bad('Baskasinin yorumunu silemezsiniz.', 403);

    // Mevcut "silme gerekcesi" kurali (bkz. reason.js) yorumlar icin de gecerli.
    const reason = requireReason(req);

    await prisma.comment.delete({ where: { id: row.id } });
    // Mevcut AuditLog kullanilir — paralel bir denetim mekanizmasi YOK.
    await audit(pid, {
      action: 'COMMENT_DELETE',
      entityType: 'comment',
      entityId: row.id,
      // Yorumun hangi kayda ait oldugu izlenebilir kalsin.
      field: `${row.entityType}:${row.entityId}`,
      oldValue: row.text.slice(0, 500),
      actor: author.name,
      reason,
      message: `Yorum silindi (${row.entityType}) — yazar: "${row.authorName}".`,
    });
    res.json({ ok: true });
  }),
);

export default router;
