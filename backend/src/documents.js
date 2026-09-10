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
//    GET    /:id/preview     -> Excel'i sayfa-ici onizleme icin JSON'a cevirir
//    GET    /:id/text        -> cikarilmis duz metin (metinden gereksinim uretme)
//    DELETE /:id             -> belgeyi sil (yalnizca PM veya 'delete' izni)
//
//  NOT: Router :pid altinda mount edildigi icin app.param('pid',
//  projectAccessGuard) otomatik calisir (IDOR korumasi).
// ============================================================================
import express from 'express';
import path from 'path';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { requireReason } from './reason.js';
import { extractDocumentText, cellText } from './documentText.js';
import { resolveUserRole } from './systemRoles.js';

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
  // Metin secimi mumkun mu? (extractedText'in KENDISI listede DONMEZ — buyuk
  // olabilir; yalnizca /text ucundan tek belge icin cekilir.)
  textStatus: true,
};

// Audit yardimcisi — yazma hatasi ana islemi bozmaz.
async function audit(projectId, entry) {
  try {
    await prisma.auditLog.create({ data: { projectId, ...entry } });
  } catch (e) {
    console.error('[audit] yazilamadi:', e?.message || e);
  }
}

// Yukleyen kisinin okunabilir adi — Issue #97: tek kimlik dunyasi (User.name).
async function uploaderName(req) {
  try {
    if (req.auth?.userId) {
      const u = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { name: true } });
      if (u?.name) return u.name;
    }
  } catch {
    /* yoksay */
  }
  return 'Bilinmiyor';
}

// Silme yetkisi: PM her zaman; normal kullanici SystemRole'unde 'delete' izni aciksa.
async function canDelete(req) {
  if (req.auth?.roleKey === 'pm') return true;
  const u = await prisma.user.findUnique({
    where: { id: req.auth?.userId },
    select: { role: true, roleKey: true },
  });
  if (!u) return false;
  const resolved = await resolveUserRole(prisma, u);
  return Boolean((resolved?.permissions || {}).delete?.enabled);
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
    // Metin YUKLEME ANINDA bir kez cikarilir (bkz. documentText.js): sonradan
    // yeniden cikarilirsa bu belgeye dayanan gereksinimlerin karakter
    // araliklari kayardi.
    const { text, status } = await extractDocumentText(req.file.buffer, ext);
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
        extractedText: text,
        textStatus: status,
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

// --- Onizleme (Excel -> JSON) ----------------------------------------------
//  Sayfa-ici goruntuleme icin .xlsx dosyasini satir dizisine cevirir. PDF bu
//  uctan GECMEZ: tarayici PDF'i kendi goruntuleyicisiyle acabildigi icin
//  istemci /download yanitini Blob olarak alip <iframe>'e verir (bkz.
//  DocumentPreviewModal.jsx). Eski ikili .xls formatini ExcelJS okuyamaz;
//  o durumda 415 ile "indirin" mesaji doner.
//  Yanit boyutu SINIRLIDIR (asagidaki ust sinirlar): cok buyuk bir tablo
//  tarayiciyi kilitlemesin diye kirpilir ve kirpildigi bilgisi doner.
const MAX_PREVIEW_SHEETS = 12;
const MAX_PREVIEW_ROWS = 300;
const MAX_PREVIEW_COLS = 40;

router.get(
  '/:id/preview',
  wrap(async (req, res) => {
    const row = await prisma.projectDocument.findFirst({
      where: { id: req.params.id, projectId: req.params.pid },
    });
    if (!row) return res.status(404).json({ error: 'Dokuman bulunamadi.' });

    if (row.ext === '.pdf') {
      // PDF istemcide dogrudan goruntulenir; bu uc onu islemez.
      return res.status(415).json({ error: 'PDF onizlemesi istemcide yapilir.' });
    }
    if (row.ext !== '.xlsx') {
      return res.status(415).json({ error: 'Eski .xls bicimi sayfa icinde onizlenemiyor; dosyayi indirin.' });
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(Buffer.from(row.content));
    } catch {
      return res.status(422).json({ error: 'Excel dosyasi okunamadi (bozuk olabilir).' });
    }

    const all = workbook.worksheets;
    const sheets = all.slice(0, MAX_PREVIEW_SHEETS).map((ws) => {
      const rows = [];
      let widest = 0;
      ws.eachRow({ includeEmpty: true }, (r, rowNumber) => {
        if (rowNumber > MAX_PREVIEW_ROWS) return;
        const cells = [];
        r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber > MAX_PREVIEW_COLS) return;
          cells[colNumber - 1] = cellText(cell.value);
        });
        // eachCell atlanan (hic dokunulmamis) hucreler icin bosluk birak.
        for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
        widest = Math.max(widest, cells.length);
        rows.push(cells);
      });
      // Tum satirlari ayni genislige tamamla (tablo hizali olsun).
      for (const r of rows) while (r.length < widest) r.push('');
      return {
        name: ws.name,
        rows,
        totalRows: ws.rowCount,
        truncatedRows: ws.rowCount > MAX_PREVIEW_ROWS,
        truncatedCols: ws.columnCount > MAX_PREVIEW_COLS,
      };
    });

    res.json({
      kind: 'spreadsheet',
      fileName: row.fileName,
      sheets,
      truncatedSheets: all.length > MAX_PREVIEW_SHEETS,
      totalSheets: all.length,
    });
  }),
);

// --- Cikarilmis duz metin ---------------------------------------------------
//  Dokumandan metin secip gereksinim olusturma akisinin veri kaynagi.
//  Istemci bu metni oldugu gibi gosterir; kullanicinin sectigi araligin
//  (start/end) bu metne gore hesaplanmasi ZORUNLUDUR.
router.get(
  '/:id/text',
  wrap(async (req, res) => {
    const row = await prisma.projectDocument.findFirst({
      where: { id: req.params.id, projectId: req.params.pid },
      select: { id: true, fileName: true, ext: true, extractedText: true, textStatus: true, content: true },
    });
    if (!row) return res.status(404).json({ error: 'Dokuman bulunamadi.' });

    let { extractedText, textStatus } = row;
    // GERIYE DONUK UYUM: metin cikarma ozelligi eklenmeden ONCE yuklenmis
    // belgeler 'pending' durumda kalir. Ilk erisimde bir KEZ cikarilip
    // kaydedilir; sonraki isteklerde ayni metin dondurulur (karakter
    // araliklarinin kararliligi icin metin bir daha degistirilmez).
    if (textStatus === 'pending') {
      const result = await extractDocumentText(Buffer.from(row.content), row.ext);
      extractedText = result.text;
      textStatus = result.status;
      await prisma.projectDocument.update({
        where: { id: row.id },
        data: { extractedText, textStatus },
      });
    }

    res.json({
      id: row.id,
      fileName: row.fileName,
      ext: row.ext,
      textStatus,
      text: extractedText || '',
    });
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
