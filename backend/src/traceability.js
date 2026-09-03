import express from 'express';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { validateLink } from './logic.js';
import { recomputeStatusesBulk } from './cascade.js';
import { TYPE_PREFIX } from './constants.js';
import { parseReqIF } from './reqifParser.js';

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

// ReqIF Import
router.post('/import/reqif', async (req, res) => {
  try {
    const pid = req.params.pid || req.projectId;

    if (!pid) {
      return res.status(400).json({ error: 'Proje ID (pid) bulunamadı.' });
    }

    const { xmlContent } = req.body || {};

    if (!xmlContent || typeof xmlContent !== 'string') {
      return res.status(400).json({ error: 'Geçersiz veya boş XML içeriği.' });
    }

    const { requirements, relations } = parseReqIF(xmlContent);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mevcut en yüksek text_id numarasını bul
      const prefix = TYPE_PREFIX['User Requirement'] || 'REQ-USR';
      const existingReqs = await tx.requirement.findMany({
        where: { projectId: pid },
        select: { text_id: true },
      });

      let currentMax = 0;
      for (const r of existingReqs) {
        if (r.text_id && r.text_id.startsWith(prefix + '-')) {
          const num = parseInt(r.text_id.split('-').pop(), 10);
          if (!Number.isNaN(num) && num > currentMax) {
            currentMax = num;
          }
        }
      }

      const externalToDbIdMap = new Map();

      // 2. Gereksinimleri Sırayla Ekle
      for (const reqItem of requirements) {
        currentMax += 1;
        const text_id = `${prefix}-${String(currentMax).padStart(3, '0')}`;

        const created = await tx.requirement.create({
          data: {
            projectId: pid,
            text_id,
            title: (reqItem.title || 'Adsız Gereksinim').trim(),
            description: (reqItem.description || '').trim(),
            type: 'User Requirement',
            attributes: { priority: 'Medium' },
            status: 'In Review',
            author: 'reqif.import',
          },
        });
        externalToDbIdMap.set(reqItem.externalId, created.id);
      }

      // 3. İzlenebilirlik Bağlarını Ekle
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

    return res.status(200).json({
      success: true,
      message: 'ReqIF başarıyla içe aktarıldı.',
      stats: result,
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
