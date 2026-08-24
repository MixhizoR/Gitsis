import express from 'express'
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage() })

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/traceability/import
 * Excel dosyasından Traceability bağlantılarını (link) içe aktarır
 */
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const { pid } = req.query
    if (!pid) {
      return res.status(400).json({ error: 'Proje ID (pid) zorunlu' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Lütfen bir Excel dosyası yükleyin' })
    }

    // Yüklenen Excel'i oku
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(req.file.buffer)
    const worksheet = workbook.getWorksheet('Traceability Matrix') || workbook.worksheets[0]

    const importedLinks = []

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // Header'ı atla

      // String dönüşümünü ve zengin metin durumlarını garantiye alalım
      const getCellValue = (cellIndex) => {
        const val = row.getCell(cellIndex).value;
        if (!val) return '';
        if (typeof val === 'object' && val.result) return String(val.result).trim(); // Formüllü hücreler için
        if (typeof val === 'object' && val.richText) return val.richText.map(t => t.text).join('').trim(); // Formatlı yazılar için
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
    let successCount = 0
    for (const item of importedLinks) {
      const req = await prisma.requirement.findFirst({
        where: { projectId: pid, text_id: item.reqTextId }
      })
      const test = await prisma.testCase.findFirst({
        where: { projectId: pid, text_id: item.testTextId }
      })

      if (req && test) {
        // Zaten varsa tekrar eklememek için upsert veya findFirst kontrolü
        const existingLink = await prisma.traceabilityLink.findFirst({
          where: { projectId: pid, fromId: req.id, toId: test.id }
        })

        if (!existingLink) {
          await prisma.traceabilityLink.create({
            data: {
              projectId: pid,
              fromId: req.id,
              toId: test.id,
              type: item.linkType
            }
          })
          successCount++
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `${successCount} adet izlenebilirlik bağlantısı başarıyla içe aktarıldı.`,
      totalProcessed: importedLinks.length
    })
  } catch (error) {
    console.error('Excel import hatası:', error)
    res.status(500).json({ error: 'Excel içe aktarılamadı', details: error.message })
  }
})

/**
 * GET /api/traceability/export/matrix
 * Traceability matrix'i Excel formatında export et
 * Query params: pid (projectId) - ZORUNLU
 */
router.get('/export/matrix', async (req, res) => {
  try {
    const { pid } = req.query;
    
    if (!pid) {
      return res.status(400).json({ error: 'Proje ID (pid) zorunlu' });
    }

    // Projeye ait gereksinimler ve testleri çek
    const requirements = await prisma.requirement.findMany({
      where: { projectId: pid },
      orderBy: { text_id: 'asc' },
    });

    const links = await prisma.traceabilityLink.findMany({
      where: { 
        projectId: pid,
        type: 'Verifies' // Sadece gereksinim-test bağlantılarını al
      },
    });

    const testCases = await prisma.testCase.findMany({
      where: { projectId: pid },
    });

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
    let totalRequirements = requirements.length;
    let linkedRequirements = 0;

    requirements.forEach((req) => {
      // Bu gereksinime ait linkler
      const reqLinks = links.filter(l => l.fromId === req.id);
      
      if (reqLinks.length === 0) {
        // Link yoksa boş satır ekle
        worksheet.addRow([
          req.text_id,
          req.title,
          req.description,
          req.status,
          req.priority,
          '',
          '',
          '',
          '',
          '0%',
        ]);
      } else {
        linkedRequirements++;
        // Her link için satır ekle
        reqLinks.forEach((link, index) => {
          const test = testCases.find(t => t.id === link.toId);
          worksheet.addRow([
            index === 0 ? req.text_id : '', // Sadece ilk satırda ID göster
            index === 0 ? req.title : '',
            index === 0 ? req.description : '',
            index === 0 ? req.status : '',
            index === 0 ? req.priority : '',
            test?.text_id || '',
            test?.title || '',
            link.type,
            test?.status || '',
            test ? '100%' : '0%',
          ]);

          // Merge cells (ilk link için)
          if (index === 0 && reqLinks.length > 1) {
            worksheet.mergeCells(`A${rowNumber}:A${rowNumber + reqLinks.length - 1}`);
            worksheet.mergeCells(`B${rowNumber}:B${rowNumber + reqLinks.length - 1}`);
            worksheet.mergeCells(`C${rowNumber}:C${rowNumber + reqLinks.length - 1}`);
            worksheet.mergeCells(`D${rowNumber}:D${rowNumber + reqLinks.length - 1}`);
            worksheet.mergeCells(`E${rowNumber}:E${rowNumber + reqLinks.length - 1}`);
          }

          rowNumber++;
        });
      }
    });

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
    summarySheet.addRow(['Toplam Test Senaryosu:', testCases.length]);
    summarySheet.addRow(['İzlenen Gereksinimler:', linkedRequirements]);
    summarySheet.addRow(['Toplam Bağlantılar:', links.length]);
    const coverage = totalRequirements > 0 
      ? `${((linkedRequirements / totalRequirements) * 100).toFixed(2)}%`
      : '0%';
    summarySheet.addRow(['Kapsama Oranı (Req):', coverage]);
    summarySheet.addRow(['Export Tarihi:', new Date().toLocaleString('tr-TR')]);

    // Summary formatı
    const titleRow = summarySheet.getRow(1);
    titleRow.font = { bold: true, size: 14 };
    summarySheet.columns = [{ width: 25 }, { width: 20 }];

    // Excel dosyasını response olarak gönder
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Traceability_Matrix_${new Date().getTime()}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel export hatası:', error);
    res.status(500).json({ error: 'Excel export yapılamadı', details: error.message });
  }
});

/**
 * GET /api/traceability/export/detailed
 * Detaylı traceability raporu (ileri ve geri izlenebilirlik)
 */
router.get('/export/detailed', async (req, res) => {
  try {
    const { pid } = req.query
    
    if (!pid) {
      return res.status(400).json({ error: 'Proje ID (pid) zorunlu' })
    }

    const requirements = await prisma.requirement.findMany({
      where: { projectId: pid },
      orderBy: { text_id: 'asc' },
    })

    const links = await prisma.traceabilityLink.findMany({
      where: { projectId: pid },
    })

    const testCases = await prisma.testCase.findMany({
      where: { projectId: pid },
    })

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Detaylı Traceability')

    // Headers
    const headers = [
      'Req ID',
      'Gereksinim Başlığı',
      'Test Bağlantıları',
      'Link Tipi',
      'Kapsama',
      'Durum',
      'Onay Durumu',
    ]
    worksheet.addRow(headers)

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF203864' },
    }
    headerRow.alignment = { horizontal: 'center', vertical: 'center' }

    // Veriler
    requirements.forEach((req) => {
      // Gereksinimden başlayan linkler (ileri izlenebilirlik)
      const forwardLinks = links.filter(
        l => l.fromId === req.id && l.type === 'Verifies'
      )
      
      if (forwardLinks.length === 0) {
        worksheet.addRow([
          req.text_id,
          req.title,
          'Test bağlantısı yok',
          '-',
          '0%',
          req.status,
          req.approvalStatus,
        ])
      } else {
        const linkedTests = forwardLinks
          .map(l => {
            const test = testCases.find(t => t.id === l.toId)
            return test ? `${test.text_id}: ${test.title}` : ''
          })
          .filter(Boolean)
          .join('; ')
        
        const linkTypes = forwardLinks.map(l => l.type).join('; ')
        const coverage = `${forwardLinks.length}/${testCases.length} (%${Math.round((forwardLinks.length / (testCases.length || 1)) * 100)})`

        worksheet.addRow([
          req.text_id,
          req.title,
          linkedTests,
          linkTypes,
          coverage,
          req.status,
          req.approvalStatus,
        ])
      }
    })

    worksheet.columns = [
      { width: 10 },
      { width: 25 },
      { width: 50 },
      { width: 15 },
      { width: 15 },
      { width: 12 },
      { width: 12 },
    ]

    // Summary sayfası ekle
    const summarySheet = workbook.addWorksheet('Summary')
    const totalReqs = requirements.length
    const linkedReqs = requirements.filter(
      r => links.some(l => l.fromId === r.id && l.type === 'Verifies')
    ).length

    summarySheet.addRow(['Detaylı Traceability Raporu'])
    summarySheet.addRow([''])
    summarySheet.addRow(['Proje ID:', pid])
    summarySheet.addRow(['Toplam Gereksinim:', totalReqs])
    summarySheet.addRow(['Toplam Test Senaryosu:', testCases.length])
    summarySheet.addRow(['Test ile İzlenen Gereksinimler:', linkedReqs])
    summarySheet.addRow(['Toplam Bağlantılar:', links.length])
    summarySheet.addRow(['Kapsama Oranı:', `${((linkedReqs / (totalReqs || 1)) * 100).toFixed(2)}%`])
    summarySheet.addRow(['Export Tarihi:', new Date().toLocaleString('tr-TR')])

    const titleRow = summarySheet.getRow(1)
    titleRow.font = { bold: true, size: 14 }
    summarySheet.columns = [{ width: 30 }, { width: 25 }]

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Detaylı_Traceability_${new Date().getTime()}.xlsx"`
    )

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('Detaylı export hatası:', error)
    res.status(500).json({ error: 'Detaylı rapor oluşturulamadı', details: error.message })
  }
})



/**
 * GET /api/traceability/matrix
 * Matris verilerini JSON formatında döndür (Frontend görüntülemesi için)
 */
router.get('/matrix', async (req, res) => {
  try {
    const { pid } = req.query;
    
    if (!pid) {
      return res.status(400).json({ error: 'Proje ID (pid) zorunlu' });
    }

    // Projeye ait gereksinimler ve test bağlantılarını çek
    const requirements = await prisma.requirement.findMany({
      where: { projectId: pid },
      orderBy: { text_id: 'asc' },
    });

    const links = await prisma.traceabilityLink.findMany({
      where: { 
        projectId: pid,
        type: 'Verifies'
      },
    });

    const testCases = await prisma.testCase.findMany({
      where: { projectId: pid },
    });

    // Matris verilerini hazırla
    const matrixData = requirements.map((req) => {
      const reqLinks = links.filter(l => l.fromId === req.id);
      
      const linkedTests = reqLinks
        .map(link => {
          const test = testCases.find(t => t.id === link.toId);
          return test 
            ? { 
                id: test.id,
                text_id: test.text_id, 
                title: test.title,
                status: test.status,
                type: link.type
              }
            : null;
        })
        .filter(Boolean);

      const coverage = testCases.length > 0 
        ? Math.round((reqLinks.length / testCases.length) * 100)
        : 0;

      return {
        id: req.id,
        text_id: req.text_id,
        title: req.title,
        description: req.description,
        type: req.type,
        status: req.status,
        priority: req.priority,
        author: req.author,
        linkedTests,
        coverage: `${coverage}%`,
      };
    });

    res.status(200).json({ 
      success: true,
      data: matrixData,
      summary: {
        totalRequirements: requirements.length,
        totalTests: testCases.length,
        totalLinks: links.length,
        linkedRequirements: requirements.filter(r => 
          links.some(l => l.fromId === r.id)
        ).length,
      }
    });
  } catch (error) {
    console.error('Matris verisi hatası:', error);
    res.status(500).json({ error: 'Matris verileri yüklenemedi', details: error.message });
  }
});

export default router