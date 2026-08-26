import express from 'express';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

/**
 * POST /api/traceability/import
 * Excel dosyasından Traceability bağlantılarını (link) içe aktarır
 */
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const pid = req.params.pid;

    if (!req.file) {
      return res.status(400).json({ error: 'Lütfen bir Excel dosyası yükleyin' });
    }

    // Yüklenen Excel'i oku
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet('Traceability Matrix') || workbook.worksheets[0];

    const importedLinks = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Header'ı atla

      // String dönüşümünü ve zengin metin durumlarını garantiye alalım
      const getCellValue = (cellIndex) => {
        const val = row.getCell(cellIndex).value;
        if (!val) return '';
        if (typeof val === 'object' && val.result) return String(val.result).trim(); // Formüllü hücreler için
        if (typeof val === 'object' && val.richText)
          return val.richText
            .map((t) => t.text)
            .join('')
            .trim(); // Formatlı yazılar için
        return String(val).trim();
      };

      const reqTextId = getCellValue(1);
      const testTextId = getCellValue(6);
      const linkType = getCellValue(8) || 'Verifies';

      if (reqTextId && testTextId) {
        importedLinks.push({ reqTextId, testTextId, linkType });
      }
    });

    // Veritabanındaki gerçek ID'lerle eşleştirip kaydet
    let successCount = 0;
    for (const item of importedLinks) {
      const req = await prisma.requirement.findFirst({
        where: { projectId: pid, text_id: item.reqTextId },
      });
      const test = await prisma.testCase.findFirst({
        where: { projectId: pid, text_id: item.testTextId },
      });

      if (req && test) {
        // Zaten varsa tekrar eklememek için upsert veya findFirst kontrolü
        const existingLink = await prisma.traceabilityLink.findFirst({
          where: { projectId: pid, fromId: req.id, toId: test.id },
        });

        if (!existingLink) {
          await prisma.traceabilityLink.create({
            data: {
              projectId: pid,
              fromId: req.id,
              toId: test.id,
              type: item.linkType,
            },
          });
          successCount++;
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `${successCount} adet izlenebilirlik bağlantısı başarıyla içe aktarıldı.`,
      totalProcessed: importedLinks.length,
    });
  } catch (error) {
    console.error('Excel import hatası:', error);
    res.status(500).json({ error: 'Excel içe aktarılamadı', details: error.message });
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
             r."priority" AS "reqPriority",
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
             r."priority" AS "reqPriority",
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
