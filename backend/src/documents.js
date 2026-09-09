// ============================================================================
//  documents.js  —  Proje Dokuman Kutuphanesi (PDF / Excel).
//  Kullanici bilgisayarindan belge yukler; belge PostgreSQL'de (bytea) saklanir
//  ve proje bazli izole edilir. Bir kez yuklenen belge silinene kadar
//  kutuphanede kalir; yeni yuklemeler listeye eklenir.
//
//  Yollar (/api/projects/:pid/documents altinda):
//    GET    /                -> metadata listesi (icerik ASLA donmez)
//    POST   /                -> multipart yukleme (alan adi: file)
//    GET    /:id/download    -> dosyayi indir (attachment)
//    DELETE /:id             -> belgeyi sil (yalnizca PM veya 'delete' izni)
//
//  NOT: Router :pid altinda mount edildigi icin app.param('pid',
//  projectAccessGuard) otomatik calisir (IDOR korumasi).
// ============================================================================
import express from 'express';
import path from 'path';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { requireReason } from './reason.js';

const prisma = new PrismaClient();
const router = express.Router({ mergeParams: true });

// Nginx (client_max_body_size 25M) ile uyumlu ust sinir.
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Yalnizca PDF ve Excel: kullanicinin talebi (pdf / xlsx) + eski .xls.
const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};
const ALLOWED_EXT = Object.keys(MIME_BY_EXT);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      const err = new Error('Yalnizca .pdf, .xlsx ve .xls dosyalari yuklenebilir.');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

// Multer hatalarini JSON'a cevirir (traceability.js ile ayni desen).
function handleFileUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(413).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Dosya cok buyuk (maks 20MB).' : 'Yukleme sinir hatasi.',
      });
    }
    return res.status(415).json({ error: err.message || 'Desteklenmeyen dosya tipi.' });
  });
}

// Listeleme/detay sorgularinda icerigi (bytea) DISARIDA birakan projeksiyon.
const META_SELECT = {
  id: true,
  fileName: true,
  ext: true,
  mimeType: true,
  size: true,
  description: true,
  uploadedBy: true,
  createdAt: true,
};

// Audit yardimcisi — yazma hatasi ana islemi bozmaz.
async function audit(projectId, entry) {
  try {
    await prisma.auditLog.create({ data: { projectId, ...entry } });
  } catch (e) {
    console.error('[audit] yazilamadi:', e?.message || e);
  }
}

// Yukleyen kisinin okunabilir adi (PM -> User.name, personel -> Ad Soyad).
async function uploaderName(req) {
  try {
    if (req.auth?.isPM && req.auth.userId) {
      const u = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { name: true } });
      return u?.name || 'Proje Yoneticisi';
    }
    if (req.auth?.kind === 'personnel' && req.auth.personnelId) {
      const p = await prisma.personnel.findUnique({
        where: { id: req.auth.personnelId },
        select: { firstName: true, lastName: true },
      });
      return p ? `${p.firstName} ${p.lastName}`.trim() : 'Personel';
    }
  } catch {
    /* yoksay */
  }
  return 'Bilinmiyor';
}

// Silme yetkisi: PM her zaman; personel yalnizca rolunde 'delete' izni acikken.
async function canDelete(req) {
  if (req.auth?.isPM) return true;
  if (req.auth?.kind !== 'personnel') return false;
  const pers = await prisma.personnel.findUnique({
    where: { id: req.auth.personnelId },
    select: { role: { select: { permissions: true } } },
  });
  return Boolean((pers?.role?.permissions || {}).delete?.enabled);
}

// Content-Disposition icin dosya adini guvenli hale getirir (CRLF/tirnak yok).
function safeFileName(name) {
  return String(name || 'document')
    .replace(/[\r\n"\\]/g, '_')
    .slice(0, 200);
}

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error('[documents] hata:', e?.message || e);
    res.status(e?.status || 500).json({ error: e?.message || 'Sunucu hatasi.' });
  });

// --- Liste -----------------------------------------------------------------
router.get(
  '/',
  wrap(async (req, res) => {
    const rows = await prisma.projectDocument.findMany({
      where: { projectId: req.params.pid },
      select: META_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  }),
);

// --- Yukleme ---------------------------------------------------------------
router.post(
  '/',
  handleFileUpload,
  wrap(async (req, res) => {
    const pid = req.params.pid;
    if (!req.file) return res.status(400).json({ error: 'Lutfen bir dosya secin.' });
    const originalName = req.file.originalname || 'belge';
    const ext = path.extname(originalName).toLowerCase();
    const row = await prisma.projectDocument.create({
      data: {
        projectId: pid,
        fileName: path.basename(originalName).slice(0, 255),
        ext,
        // Tarayicidan gelen tipe guvenilmez; uzantiya gore sabitlenir.
        mimeType: MIME_BY_EXT[ext] || 'application/octet-stream',
        size: req.file.size,
        description: String(req.body?.description || '')
          .trim()
          .slice(0, 500),
        uploadedBy: await uploaderName(req),
        content: req.file.buffer,
      },
      select: META_SELECT,
    });
    await audit(pid, {
      action: 'DOCUMENT_UPLOAD',
      entityType: 'document',
      entityId: row.id,
      actor: row.uploadedBy,
      message: `Dokuman yuklendi: "${row.fileName}" (${row.size} bayt).`,
    });
    res.status(201).json(row);
  }),
);

// --- Indirme ---------------------------------------------------------------
router.get(
  '/:id/download',
  wrap(async (req, res) => {
    const row = await prisma.projectDocument.findUnique({ where: { id: req.params.id } });
    if (!row || row.projectId !== req.params.pid) {
      return res.status(404).json({ error: 'Dokuman bulunamadi.' });
    }
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Length', row.size);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(row.fileName)}"`);
    res.send(Buffer.from(row.content));
  }),
);

// --- Silme -----------------------------------------------------------------
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const pid = req.params.pid;
    const row = await prisma.projectDocument.findFirst({
      where: { id: req.params.id, projectId: pid },
      select: META_SELECT,
    });
    if (!row) return res.status(404).json({ error: 'Dokuman bulunamadi.' });
    if (!(await canDelete(req))) {
      return res.status(403).json({ error: 'Dokuman silme yetkiniz yok.' });
    }
    const reason = requireReason(req);
    await prisma.projectDocument.delete({ where: { id: req.params.id } });
    await audit(pid, {
      action: 'DOCUMENT_DELETE',
      entityType: 'document',
      entityId: row.id,
      actor: await uploaderName(req),
      message: `Dokuman silindi: "${row.fileName}".`,
      reason,
    });
    res.json({ ok: true });
  }),
);

export default router;
