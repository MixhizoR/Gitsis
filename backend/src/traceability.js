import express from 'express';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { validateLink } from './logic.js';
import { recomputeStatusesBulk } from './cascade.js';
import { REQ_TYPE, REQ_TYPES, LINK_TYPE } from './constants.js';
import { parseReqIF } from './reqifParser.js';
import { extractReqIFText } from './zipUtil.js';
import { cleanRichText } from './sanitize.js';
import { nextTextIdBatch } from './idGen.js';

const ALLOWED_EXT = ['.xlsx', '.xls'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      const err = new Error('Sadece .xlsx ve .xls dosyaları yüklenebilir.');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

function handleFileUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(413).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Dosya çok büyük (maks 10MB)' : 'Yükleme sınır hatası',
      });
    }
    return res.status(413).json({ error: err.message || 'Desteklenmeyen dosya tipi' });
  });
}

// ReqIF/ReqIFz/XML: DOORS/Polarion/Jama gibi araçlardan büyük modüller
// gelebileceğinden Excel'den daha geniş bir üst sınır (25MB) kullanılır.
// Uzantı dogrulamasi burada sadece "makul dosya" filtresidir — asil format
// tespiti (ZIP mi duz XML mi) icerik imzasina (magic bytes) bakarak yapilir.
const REQIF_ALLOWED_EXT = ['.reqif', '.reqifz', '.xml'];
const uploadReqif = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!REQIF_ALLOWED_EXT.includes(ext)) {
      const err = new Error('Sadece .reqif, .reqifz ve .xml dosyaları yüklenebilir.');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

function handleReqifUpload(req, res, next) {
  uploadReqif.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(413).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Dosya çok büyük (maks 25MB)' : 'Yükleme sınır hatası',
      });
    }
    return res.status(413).json({ error: err.message || 'Desteklenmeyen dosya tipi' });
  });
}

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

/**
 * POST /api/traceability/import
 * Excel dosyasından Traceability bağlantılarını (link) içe aktarır
 */
router.post('/import', handleFileUpload, async (req, res) => {
  try {
    const pid = req.params.pid;

    if (!req.file) {
      return res.status(400).json({ error: 'Lütfen bir Excel dosyası yükleyin' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet('Traceability Matrix') || workbook.worksheets[0];

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const getCellValue = (cellIndex) => {
        const val = row.getCell(cellIndex).value;
        if (!val) return '';
        if (typeof val === 'object' && val.result) return String(val.result).trim();
        if (typeof val === 'object' && val.richText) {
          return val.richText
            .map((t) => t.text)
            .join('')
            .trim();
        }
        return String(val).trim();
      };

      const reqTextId = getCellValue(1);
      const testTextId = getCellValue(6);
      const linkType = getCellValue(8); // varsayılan ATANMIYOR — doğrulama reddedecek

      if (reqTextId && testTextId) {
        rows.push({ reqTextId, testTextId, linkType });
      }
    });

    // Proje kapsamındaki gereksinim/testleri tek seferde çek (N+1 gider)
    const [requirements, tests] = await Promise.all([
      prisma.requirement.findMany({
        where: { projectId: pid },
        select: { id: true, text_id: true, type: true },
      }),
      prisma.testCase.findMany({
        where: { projectId: pid },
        select: { id: true, text_id: true, type: true },
      }),
    ]);
    const reqByText = new Map(requirements.map((r) => [r.text_id, r]));
    const testByText = new Map(tests.map((t) => [t.text_id, t]));

    const errors = [];
    const pending = [];

    for (let i = 0; i < rows.length; i++) {
      const item = rows[i];
      const rowNum = i + 2;
      const reqObj = reqByText.get(item.reqTextId);
      const testObj = testByText.get(item.testTextId);

      if (!reqObj) {
        errors.push(`Satır ${rowNum}: gereksinim bulunamadı: "${item.reqTextId}".`);
        continue;
      }
      if (!testObj) {
        errors.push(`Satır ${rowNum}: test bulunamadı: "${item.testTextId}".`);
        continue;
      }

      const verdict = validateLink(reqObj, testObj, item.linkType, 'test');
      if (!verdict.ok) {
        errors.push(`Satır ${rowNum}: ${verdict.error}`);
        continue;
      }

      pending.push({
        projectId: pid,
        fromId: reqObj.id,
        toId: testObj.id,
        type: item.linkType,
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: `${errors.length} satır geçersiz, içe aktarma reddedildi.`,
        details: errors,
      });
    }

    let imported = 0;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.traceabilityLink.findMany({
        where: { projectId: pid },
      });
      const key = (l) => `${l.fromId}|${l.toId}`;
      const seen = new Set(existing.map(key));
      const fresh = pending.filter((p) => !seen.has(key(p)));

      if (fresh.length > 0) {
        await tx.traceabilityLink.createMany({ data: fresh });
      }
      imported = fresh.length;

      await tx.auditLog.create({
        data: {
          projectId: pid,
          action: 'IMPORT',
          entityType: 'traceability_link',
          message: 'Traceability import completed',
        },
      });
    });

    const updatedStatuses = await recomputeStatusesBulk(prisma, pid);

    res.status(200).json({
      success: true,
      message: `${imported} adet izlenebilirlik bağlantısı başarıyla içe aktarıldı.`,
      totalProcessed: rows.length,
      imported,
      updatedStatuses,
    });
  } catch (error) {
    console.error('Excel import hatası:', error);
    res.status(500).json({ error: 'Excel içe aktarılamadı', details: error.message });
  }
});

/**
 * POST /api/projects/:pid/traceability/import/reqif
 * .reqif / .reqifz (ZIP) / .xml dosyasindan gereksinim + izlenebilirlik
 * bagi ice aktarir. Cok modullu DOORS is akisini destekler: ayni projeye
 * ardisik olarak User -> System -> Software/Hardware modulleri ice
 * aktarildiginda, SPEC-RELATIONS'daki referanslar ONCEKI importlarda
 * olusturulan kayitlari da bulur (bkz. `attributes.reqifExternalId`).
 *
 * multipart/form-data alanlari:
 *   file        - .reqif/.reqifz/.xml (ZORUNLU, veya asagidaki xmlContent)
 *   importType  - REQ_TYPE degerlerinden biri (varsayilan: User Requirement)
 * (Geriye donuk uyum icin dosya yerine JSON govdesinde { xmlContent, importType } da kabul edilir.)
 */
router.post('/import/reqif', handleReqifUpload, async (req, res) => {
  try {
    const pid = req.params.pid || req.projectId;
    if (!pid) {
      return res.status(400).json({ error: 'Proje ID (pid) bulunamadı.' });
    }

    const importType = REQ_TYPES.includes(req.body?.importType) ? req.body.importType : REQ_TYPE.USER;

    let xmlContent;
    if (req.file) {
      try {
        xmlContent = extractReqIFText(req.file.buffer);
      } catch (zipErr) {
        return res.status(400).json({ error: zipErr.message });
      }
    } else if (req.body?.xmlContent && typeof req.body.xmlContent === 'string') {
      xmlContent = req.body.xmlContent;
    } else {
      return res.status(400).json({ error: 'Lütfen bir .reqif, .reqifz veya .xml dosyası yükleyin.' });
    }

    let requirements;
    let relations;
    try {
      ({ requirements, relations } = parseReqIF(xmlContent));
    } catch (parseErr) {
      return res.status(400).json({ error: `ReqIF ayrıştırılamadı: ${parseErr.message}` });
    }
    if (requirements.length === 0) {
      return res.status(400).json({ error: 'Dosyada içe aktarılacak gereksinim (SPEC-OBJECT) bulunamadı.' });
    }

    const warnings = [];
    const TYPE_LABEL = {
      user: REQ_TYPE.USER,
      system: REQ_TYPE.SYSTEM,
      software: REQ_TYPE.SOFTWARE,
      hardware: REQ_TYPE.HARDWARE,
    };

    // Kaynak (DOORS/ReqIF) tarafinda silinmis olarak isaretlenmis nesneler
    // (reqifParser.js `isDeleted: true`) Gitsis'in KENDI silme akisiyla
    // ayni sekilde ele alinir: gorunur bir kayit OLUSTURULMAZ, ama numarasi
    // (text_id) tipki gercekten silinmis bir gereksinim gibi emekliye
    // ayrilir (bir daha asla kullanilmaz) — bkz. asagida "retiredCount".
    const liveItems = requirements.filter((r) => !r.isDeleted);
    const deletedItems = requirements.filter((r) => r.isDeleted);

    const result = await prisma.$transaction(async (tx) => {
      // Bu projede daha once reqif ile ice aktarilmis TUM kayitlari
      // (externalId -> {id, type}) haritala — hem re-import guncellemesi
      // hem de cok-modullu capraz-referans cozumlemesi icin.
      const existingRows = await tx.requirement.findMany({
        where: { projectId: pid },
        select: { id: true, type: true, attributes: true },
      });
      const byExternalId = new Map(); // externalId -> { id, type }
      for (const row of existingRows) {
        const extId = row.attributes?.reqifExternalId;
        if (extId) byExternalId.set(extId, { id: row.id, type: row.type });
      }

      // Yeni olusturulacak kayit sayisini onceden bilerek TEK seferde
      // text_id blogu ayir (bkz. idGen.js nextTextIdBatch).
      const toCreate = liveItems.filter((r) => {
        const existing = byExternalId.get(r.externalId);
        return !existing || existing.type !== importType;
      });
      const freshIds = await nextTextIdBatch(tx, pid, importType, false, toCreate.length);
      let freshIdx = 0;

      let createdCount = 0;
      let updatedCount = 0;
      for (const reqItem of liveItems) {
        const existing = byExternalId.get(reqItem.externalId);
        const attributes = {
          priority: 'Medium',
          reqifExternalId: reqItem.externalId,
          ...(reqItem.foreignId ? { reqifForeignId: reqItem.foreignId } : {}),
          ...reqItem.customAttributes,
        };

        if (reqItem.typeHint && TYPE_LABEL[reqItem.typeHint] && TYPE_LABEL[reqItem.typeHint] !== importType) {
          if (warnings.length < 20) {
            warnings.push(
              `"${reqItem.title || reqItem.externalId}" dosyada "${TYPE_LABEL[reqItem.typeHint]}" tipini işaret ediyor, ancak "${importType}" olarak içe aktarıldı.`,
            );
          }
        }

        if (existing && existing.type === importType) {
          await tx.requirement.update({
            where: { id: existing.id },
            data: {
              title: (reqItem.title || '').trim(),
              description: cleanRichText((reqItem.description || '').trim()),
              attributes,
            },
          });
          byExternalId.set(reqItem.externalId, { id: existing.id, type: importType });
          updatedCount++;
        } else {
          const text_id = freshIds[freshIdx++];
          const created = await tx.requirement.create({
            data: {
              projectId: pid,
              text_id,
              title: (reqItem.title || '').trim(),
              description: cleanRichText((reqItem.description || '').trim()),
              type: importType,
              attributes,
              status: 'In Review',
              author: 'reqif.import',
            },
          });
          byExternalId.set(reqItem.externalId, { id: created.id, type: importType });
          createdCount++;
        }
      }

      // Kaynakta silinmis nesneler: gorunur kayit OLUSTURMADAN numarasini
      // emekliye ayir. Ayni externalId icin DAHA ONCE emekliye ayrilmis bir
      // numara varsa (tekrar ice aktarma) IKINCI bir numara TUKETILMEZ —
      // dedupe, bu projede daha once yazilmis "requirement-retired" audit
      // kayitlarina bakilarak yapilir.
      const existingRetirements = await tx.auditLog.findMany({
        where: { projectId: pid, entityType: 'requirement-retired', field: 'reqifExternalId' },
        select: { newValue: true },
      });
      const alreadyRetired = new Set(existingRetirements.map((r) => r.newValue).filter(Boolean));
      const newRetirements = deletedItems.filter((r) => !alreadyRetired.has(r.externalId));
      const retiredIds = await nextTextIdBatch(tx, pid, importType, false, newRetirements.length);
      for (let i = 0; i < newRetirements.length; i++) {
        const reqItem = newRetirements[i];
        await tx.auditLog.create({
          data: {
            projectId: pid,
            action: 'DELETE',
            entityType: 'requirement-retired',
            textId: retiredIds[i],
            field: 'reqifExternalId',
            newValue: reqItem.externalId,
            message: `ReqIF içe aktarımda kaynak sistemde silinmiş olarak işaretlenmiş nesne: "${reqItem.title || reqItem.externalId}". Numara emekliye ayrıldı, görünür kayıt oluşturulmadı.`,
            actor: 'reqif.import',
          },
        });
      }
      const retiredCount = newRetirements.length;

      // İzlenebilirlik Bağlarını Ekle — SPEC-RELATION kaynak/hedef yönü
      // araca göre değişebildiğinden (kimi araçlarda "source" alt seviye,
      // kimisinde üst seviyedir) her iki yön de denenir; hangisi şema
      // kurallarına (SATISFIES_ALLOWED_PARENTS) uyuyorsa o kullanılır.
      const existingLinks = await tx.traceabilityLink.findMany({ where: { projectId: pid } });
      const linkKey = (fromId, toId, type) => `${fromId}|${toId}|${type}`;
      const seenLinks = new Set(existingLinks.map((l) => linkKey(l.fromId, l.toId, l.type)));

      let skippedLinks = 0;
      const pendingLinks = [];
      for (const rel of relations) {
        if (rel.linkTypeHint !== 'satisfies') {
          skippedLinks++;
          if (warnings.length < 20) {
            warnings.push(
              `İlişki desteklenmiyor (${rel.typeName || rel.linkTypeHint}): ${rel.sourceExternalId} → ${rel.targetExternalId}.`,
            );
          }
          continue;
        }
        const src = byExternalId.get(rel.sourceExternalId);
        const tgt = byExternalId.get(rel.targetExternalId);
        if (!src || !tgt) {
          skippedLinks++;
          continue;
        }

        let fromObj = { id: src.id, type: src.type };
        let toObj = { id: tgt.id, type: tgt.type };
        let verdict = validateLink(fromObj, toObj, LINK_TYPE.SATISFIES, 'requirement');
        if (!verdict.ok) {
          const swapped = validateLink(toObj, fromObj, LINK_TYPE.SATISFIES, 'requirement');
          if (swapped.ok) {
            [fromObj, toObj] = [toObj, fromObj];
            verdict = swapped;
          }
        }
        if (!verdict.ok) {
          skippedLinks++;
          if (warnings.length < 20) {
            warnings.push(`Bağ kurulamadı (${src.type} ↔ ${tgt.type}): ${verdict.error}`);
          }
          continue;
        }

        const key = linkKey(fromObj.id, toObj.id, LINK_TYPE.SATISFIES);
        if (seenLinks.has(key)) continue;
        seenLinks.add(key);
        pendingLinks.push({
          projectId: pid,
          fromId: fromObj.id,
          toId: toObj.id,
          type: LINK_TYPE.SATISFIES,
          createdBy: 'reqif.import',
        });
      }

      if (pendingLinks.length > 0) {
        await tx.traceabilityLink.createMany({ data: pendingLinks });
      }

      await tx.auditLog.create({
        data: {
          projectId: pid,
          action: 'IMPORT',
          entityType: 'requirement',
          message: `ReqIF içe aktarma: ${createdCount} yeni, ${updatedCount} güncellendi, ${retiredCount} numara emekliye ayrıldı (kaynakta silinmiş), ${pendingLinks.length} bağ eklendi, ${skippedLinks} bağ atlandı.`,
        },
      });

      return {
        importedRequirements: createdCount,
        updatedRequirements: updatedCount,
        retiredRequirements: retiredCount,
        importedLinks: pendingLinks.length,
        skippedLinks,
        totalRequirementsInFile: requirements.length,
        totalRelationsInFile: relations.length,
      };
    });

    await recomputeStatusesBulk(prisma, pid);

    const retiredNote = result.retiredRequirements > 0 ? `, ${result.retiredRequirements} numara emekliye ayrıldı` : '';
    return res.status(200).json({
      success: true,
      message: `ReqIF başarıyla içe aktarıldı: ${result.importedRequirements} yeni, ${result.updatedRequirements} güncellendi${retiredNote}, ${result.importedLinks} bağ eklendi.`,
      stats: result,
      warnings,
    });
  } catch (error) {
    console.error('ReqIF Import Hatası:', error);
    return res.status(500).json({ error: error.message || 'ReqIF içe aktarılamadı.' });
  }
});
/**
 * GET /api/traceability/export/matrix
 * Traceability matrix'i Excel formatında export et
 * Issue #15: Tüm veri belleğe alınıp JS filter/find ile eşleştirilmez;
 * Requirement ← Verifies-link → TestCase tek SQL JOIN ile çekilir.
 * Query params: pid (projectId) - ZORUNLU
 */
router.get('/export/matrix', async (req, res) => {
  try {
    const pid = req.params.pid;

    // Tek sorgu: her (gereksinim, Verifies bağı) çifti bir satır;
    // bağı olmayan gereksinimler test alanları NULL tek satır olarak gelir.
    const joinRows = await prisma.$queryRaw`
      SELECT r."id" AS "reqId",
             r."text_id" AS "reqTextId",
             r."title" AS "reqTitle",
             r."description" AS "reqDescription",
             r."status" AS "reqStatus",
             r."attributes"->>'priority' AS "reqPriority",
             l."id" AS "linkId",
             t."id" AS "testId",
             t."text_id" AS "testTextId",
             t."title" AS "testTitle",
             t."status" AS "testStatus"
      FROM "Requirement" r
      LEFT JOIN "TraceabilityLink" l
        ON l."projectId" = r."projectId" AND l."fromId" = r."id" AND l."type" = 'Verifies'
      LEFT JOIN "TestCase" t
        ON t."id" = l."toId" AND t."projectId" = r."projectId"
      WHERE r."projectId" = ${pid}
      ORDER BY r."text_id", t."text_id"`;

    // Sunum amaçlı gruplama (veri eşleştirme değil): gereksinim başına satırlar.
    const groups = [];
    for (const row of joinRows) {
      let g = groups[groups.length - 1];
      if (!g || g.reqId !== row.reqId) {
        g = { reqId: row.reqId, rows: [] };
        groups.push(g);
      }
      g.rows.push(row);
    }

    const totalRequirements = groups.length;
    const totalTests = await prisma.testCase.count({ where: { projectId: pid } });
    const totalLinks = joinRows.filter((r) => r.linkId !== null).length;

    // Excel workbook oluştur
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Traceability Matrix');

    // Header satırı
    const headers = [
      'Gereksinim ID',
      'Gereksinim Başlığı',
      'Açıklama',
      'Durum',
      'Öncelik',
      'Test ID',
      'Test Başlığı',
      'Link Tipi',
      'Test Durum',
      'Kapsama (%)',
    ];

    worksheet.addRow(headers);

    // Header formatı
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF366092' }, // Koyu mavi
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'center' };

    // Satırları ekle
    let rowNumber = 2;
    let linkedRequirements = 0;

    for (const group of groups) {
      const first = group.rows[0];

      if (first.linkId === null) {
        // Link yoksa boş satır ekle
        worksheet.addRow([
          first.reqTextId,
          first.reqTitle,
          first.reqDescription,
          first.reqStatus,
          first.reqPriority,
          '',
          '',
          '',
          '',
          '0%',
        ]);
        rowNumber += 1;
        continue;
      }

      linkedRequirements += 1;
      group.rows.forEach((row, index) => {
        worksheet.addRow([
          index === 0 ? row.reqTextId : '', // Sadece ilk satırda ID göster
          index === 0 ? row.reqTitle : '',
          index === 0 ? row.reqDescription : '',
          index === 0 ? row.reqStatus : '',
          index === 0 ? row.reqPriority : '',
          row.testTextId || '',
          row.testTitle || '',
          'Verifies',
          row.testStatus || '',
          row.testId ? '100%' : '0%',
        ]);

        // Merge cells (ilk link için)
        if (index === 0 && group.rows.length > 1) {
          const end = rowNumber + group.rows.length - 1;
          for (const col of ['A', 'B', 'C', 'D', 'E']) {
            worksheet.mergeCells(`${col}${rowNumber}:${col}${end}`);
          }
        }

        rowNumber++;
      });
    }

    // Kolon genişlikleri
    worksheet.columns = [
      { width: 12 },
      { width: 20 },
      { width: 30 },
      { width: 12 },
      { width: 10 },
      { width: 10 },
      { width: 20 },
      { width: 15 },
      { width: 12 },
      { width: 12 },
    ];

    // Summary sayfası ekle
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Traceability Matrix Özeti']);
    summarySheet.addRow(['']);
    summarySheet.addRow(['Proje ID:', pid]);
    summarySheet.addRow(['Toplam Gereksinim:', totalRequirements]);
    summarySheet.addRow(['Toplam Test Senaryosu:', totalTests]);
    summarySheet.addRow(['İzlenen Gereksinimler:', linkedRequirements]);
    summarySheet.addRow(['Toplam Bağlantılar:', totalLinks]);
    const coverage = totalRequirements > 0 ? `${((linkedRequirements / totalRequirements) * 100).toFixed(2)}%` : '0%';
    summarySheet.addRow(['Kapsama Oranı (Req):', coverage]);
    summarySheet.addRow(['Export Tarihi:', new Date().toLocaleString('tr-TR')]);

    // Summary formatı
    const titleRow = summarySheet.getRow(1);
    titleRow.font = { bold: true, size: 14 };
    summarySheet.columns = [{ width: 25 }, { width: 20 }];

    // Excel dosyasını response olarak gönder
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Traceability_Matrix_${new Date().getTime()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel export hatası:', error);
    res.status(500).json({ error: 'Excel export yapılamadı', details: error.message });
  }
});

/**
 * GET /api/traceability/export/detailed
 * Detaylı traceability raporu (ileri izlenebilirlik)
 * Issue #15: Eşleştirme JS filter/find yerine SQL JOIN + string_agg ile.
 */
router.get('/export/detailed', async (req, res) => {
  try {
    const pid = req.params.pid;

    // Tek sorgu: gereksinim başına ileri (Verifies) bağlantı özeti.
    const rows = await prisma.$queryRaw`
      SELECT r."id" AS "reqId",
             r."text_id" AS "reqTextId",
             r."title" AS "reqTitle",
             r."status" AS "reqStatus",
             r."approvalStatus" AS "reqApprovalStatus",
             COALESCE(
               string_agg(t."text_id" || ': ' || t."title", '; ' ORDER BY t."text_id")
                 FILTER (WHERE t."id" IS NOT NULL),
               ''
             ) AS "linkedTests",
             COALESCE(
               string_agg(l."type", '; ' ORDER BY t."text_id")
                 FILTER (WHERE t."id" IS NOT NULL),
               ''
             ) AS "linkTypes",
             COUNT(l."id")::int AS "forwardCount"
      FROM "Requirement" r
      LEFT JOIN "TraceabilityLink" l
        ON l."projectId" = r."projectId" AND l."fromId" = r."id" AND l."type" = 'Verifies'
      LEFT JOIN "TestCase" t
        ON t."id" = l."toId" AND t."projectId" = r."projectId"
      WHERE r."projectId" = ${pid}
      GROUP BY r."id", r."text_id", r."title", r."status", r."approvalStatus"
      ORDER BY r."text_id"`;

    const totalTests = await prisma.testCase.count({ where: { projectId: pid } });
    const totalLinksAllTypes = await prisma.traceabilityLink.count({ where: { projectId: pid } });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Detaylı Traceability');

    // Headers
    const headers = [
      'Req ID',
      'Gereksinim Başlığı',
      'Test Bağlantıları',
      'Link Tipi',
      'Kapsama',
      'Durum',
      'Onay Durumu',
    ];
    worksheet.addRow(headers);

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF203864' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'center' };

    // Veriler
    let linkedReqs = 0;
    for (const row of rows) {
      if (row.forwardCount === 0) {
        worksheet.addRow([
          row.reqTextId,
          row.reqTitle,
          'Test bağlantısı yok',
          '-',
          '0%',
          row.reqStatus,
          row.reqApprovalStatus,
        ]);
        continue;
      }

      linkedReqs += 1;
      const coverage = `${row.forwardCount}/${totalTests} (%${Math.round((row.forwardCount / (totalTests || 1)) * 100)})`;
      worksheet.addRow([
        row.reqTextId,
        row.reqTitle,
        row.linkedTests,
        row.linkTypes,
        coverage,
        row.reqStatus,
        row.reqApprovalStatus,
      ]);
    }

    worksheet.columns = [
      { width: 10 },
      { width: 25 },
      { width: 50 },
      { width: 15 },
      { width: 15 },
      { width: 12 },
      { width: 12 },
    ];

    // Summary sayfası ekle
    const summarySheet = workbook.addWorksheet('Summary');
    const totalReqs = rows.length;

    summarySheet.addRow(['Detaylı Traceability Raporu']);
    summarySheet.addRow(['']);
    summarySheet.addRow(['Proje ID:', pid]);
    summarySheet.addRow(['Toplam Gereksinim:', totalReqs]);
    summarySheet.addRow(['Toplam Test Senaryosu:', totalTests]);
    summarySheet.addRow(['Test ile İzlenen Gereksinimler:', linkedReqs]);
    summarySheet.addRow(['Toplam Bağlantılar:', totalLinksAllTypes]);
    summarySheet.addRow(['Kapsama Oranı:', `${((linkedReqs / (totalReqs || 1)) * 100).toFixed(2)}%`]);
    summarySheet.addRow(['Export Tarihi:', new Date().toLocaleString('tr-TR')]);

    const titleRow = summarySheet.getRow(1);
    titleRow.font = { bold: true, size: 14 };
    summarySheet.columns = [{ width: 30 }, { width: 25 }];

    // Not: HTTP header'ı non-ASCII kabul etmez; dosya adı ISO-8859-1 güvenli.
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Detayli_Traceability_${new Date().getTime()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Detaylı export hatası:', error);
    res.status(500).json({ error: 'Detaylı rapor oluşturulamadı', details: error.message });
  }
});

/**
 * GET /api/traceability/matrix
 * Matris verilerini JSON formatında döndür (Frontend görüntülemesi için)
 * Issue #15: JS filter/find yerine SQL JOIN + json_agg; response şekli aynı.
 */
router.get('/matrix', async (req, res) => {
  try {
    const pid = req.params.pid;

    // Tek sorgu: gereksinim başına bağlı testler json_agg ile toplanır.
    const rows = await prisma.$queryRaw`
      SELECT r."id" AS "reqId",
             r."text_id" AS "reqTextId",
             r."title" AS "reqTitle",
             r."description" AS "reqDescription",
             r."type" AS "reqType",
             r."status" AS "reqStatus",
             r."attributes"->>'priority' AS "reqPriority",
             r."author" AS "reqAuthor",
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', t."id",
                   'text_id', t."text_id",
                   'title', t."title",
                   'description', t."description",
                   'status', t."status",
                   'type', l."type"
                 )
                 ORDER BY t."text_id"
               ) FILTER (WHERE t."id" IS NOT NULL),
               '[]'
             ) AS "linkedTests"
      FROM "Requirement" r
      LEFT JOIN "TraceabilityLink" l
        ON l."projectId" = r."projectId" AND l."fromId" = r."id" AND l."type" = 'Verifies'
      LEFT JOIN "TestCase" t
        ON t."id" = l."toId" AND t."projectId" = r."projectId"
      WHERE r."projectId" = ${pid}
      GROUP BY r."id"
      ORDER BY r."text_id"`;

    const totalTests = await prisma.testCase.count({ where: { projectId: pid } });
    const totalLinks = await prisma.traceabilityLink.count({
      where: { projectId: pid, type: 'Verifies' },
    });

    const parseTests = (v) => {
      if (Array.isArray(v)) return v;
      try {
        return JSON.parse(v ?? '[]');
      } catch {
        return [];
      }
    };

    // Matris verilerini hazırla
    let linkedRequirements = 0;
    const matrixData = rows.map((row) => {
      const linkedTests = parseTests(row.linkedTests);
      if (linkedTests.length > 0) linkedRequirements += 1;
      const coverage = totalTests > 0 ? Math.round((linkedTests.length / totalTests) * 100) : 0;

      return {
        id: row.reqId,
        text_id: row.reqTextId,
        title: row.reqTitle,
        description: row.reqDescription,
        type: row.reqType,
        status: row.reqStatus,
        priority: row.reqPriority,
        author: row.reqAuthor,
        linkedTests,
        coverage: `${coverage}%`,
      };
    });

    res.status(200).json({
      success: true,
      data: matrixData,
      summary: {
        totalRequirements: matrixData.length,
        totalTests,
        totalLinks,
        linkedRequirements,
      },
    });
  } catch (error) {
    console.error('Matris verisi hatası:', error);
    res.status(500).json({ error: 'Matris verileri yüklenemedi', details: error.message });
  }
});

export default router;
