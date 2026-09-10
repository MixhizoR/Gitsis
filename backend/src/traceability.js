import express from 'express';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { validateLink } from './logic.js';
import { recomputeStatusesBulk } from './cascade.js';
import { REQ_TYPE, REQ_TYPES, TEST_TYPES, LINK_TYPE } from './constants.js';
import { parseReqIF } from './reqifParser.js';
import { buildReqIF } from './reqifExporter.js';
import { extractReqIFText, createZip } from './zipUtil.js';
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

const GITSIS_ATTR_PREFIX = 'gitsis_attr_';

// reqifExporter.js'in yazdigi "Gitsis.Field" / "Gitsis.Author" /
// "Gitsis.Attr.<anahtar>" oznitelikleri, reqifParser.js'ten customAttributes
// torbasina slugify'lenmis halleriyle ("gitsis_field", "gitsis_author",
// "gitsis_attr_<anahtar>") gelir. Bunlar Gitsis'in KENDI export->DOORS->
// reimport dongusune ozgudur (genel DOORS dosyalarinda hic bulunmazlar,
// bu yuzden hicbir kosul burada devre disi birakilmaya gerek duymaz):
//  - gitsis_field/gitsis_author  -> Requirement/TestCase kolonlarina yazilir.
//  - gitsis_attr_<anahtar>       -> attributes JSONB torbasina (priority,
//    dal_level, projeye ozel alanlar) MERGE edilir.
//  - geri kalan HER SEY (foreign, arac-bagimsiz oznitelikler) oldugu gibi
//    attributes torbasina yazilir — DAVRANIS DEGISMEDI (genel DOORS/ReqIF
//    importlarinda oncekiyle birebir ayni sonucu verir).
function splitGitsisAttributes(customAttributes) {
  const known = {};
  const attrBag = {};
  const foreign = {};
  for (const [key, value] of Object.entries(customAttributes || {})) {
    if (key === 'gitsis_field') known.field = value;
    else if (key === 'gitsis_author') known.author = value;
    else if (key.startsWith(GITSIS_ATTR_PREFIX)) attrBag[key.slice(GITSIS_ATTR_PREFIX.length)] = value;
    else foreign[key] = value;
  }
  return { known, attrBag, foreign };
}

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
    let sourceToolId;
    try {
      ({ requirements, relations, sourceToolId } = parseReqIF(xmlContent));
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

    // Bu dosya Gitsis'in KENDI export'undan mi geliyor (SOURCE-TOOL-ID/
    // REQ-IF-TOOL-ID "Gitsis")? Sadece o zaman her SPEC-OBJECT'in KENDI
    // SPEC-OBJECT-TYPE adi (objectTypeName) Requirement/TestCase hedefini
    // BELIRLEYEBILIR (Gitsis'in exportlari bu adi TAM OLARAK "User
    // Requirement" / "Acceptance Test" gibi yazar). Genel DOORS/ReqIF
    // dosyalarinda bu otomatik yonlendirme DEVRE DISI kalir — TUM nesneler
    // eskisi gibi kullanicinin sectigi TEK `importType`'a (Requirement)
    // aktarilir; boylece bu degisiklik mevcut ice aktarma davranisini
    // ETKILEMEZ.
    const isGitsisSource = sourceToolId === 'Gitsis';
    function resolveTarget(item) {
      if (isGitsisSource && item.objectTypeName) {
        if (TEST_TYPES.includes(item.objectTypeName)) return { isTest: true, type: item.objectTypeName };
        if (REQ_TYPES.includes(item.objectTypeName)) return { isTest: false, type: item.objectTypeName };
      }
      return { isTest: false, type: importType };
    }

    // Kaynak (DOORS/ReqIF) tarafinda silinmis olarak isaretlenmis nesneler
    // (reqifParser.js `isDeleted: true`) Gitsis'in KENDI silme akisiyla
    // ayni sekilde ele alinir: gorunur bir kayit OLUSTURULMAZ, ama numarasi
    // (text_id) tipki gercekten silinmis bir gereksinim gibi emekliye
    // ayrilir (bir daha asla kullanilmaz) — bkz. asagida "retiredCount".
    const liveItems = requirements.filter((r) => !r.isDeleted).map((r) => ({ ...r, target: resolveTarget(r) }));
    const deletedItems = requirements.filter((r) => r.isDeleted).map((r) => ({ ...r, target: resolveTarget(r) }));

    const result = await prisma.$transaction(async (tx) => {
      // Bu projede daha once reqif ile ice aktarilmis TUM Requirement/TestCase
      // kayitlarini (externalId/foreignId -> satir) haritala — hem re-import
      // guncellemesi hem de cok-modullu capraz-referans cozumlemesi icin.
      // IKI ayri anahtar denenir: externalId (SPEC-OBJECT IDENTIFIER — DOORS
      // bunu ORIJINAL haliyle korumayabilir) VE foreignId (ReqIF.ForeignID —
      // Gitsis'in KENDI exportlarinda "GITSIS-REQ-<id>" gibi KALICI bir capa
      // olarak yazilir, bkz. reqifExporter.js). Boylece DOORS export sirasinda
      // IDENTIFIER'i degistirse bile Gitsis ayni kaydi tanimaya devam eder.
      const [existingReqs, existingTests] = await Promise.all([
        tx.requirement.findMany({ where: { projectId: pid }, select: { id: true, type: true, attributes: true } }),
        tx.testCase.findMany({ where: { projectId: pid }, select: { id: true, type: true, attributes: true } }),
      ]);
      const reqByExternalId = new Map();
      const reqByForeignId = new Map();
      for (const row of existingReqs) {
        const extId = row.attributes?.reqifExternalId;
        if (extId) reqByExternalId.set(extId, row);
        const fgnId = row.attributes?.reqifForeignId;
        if (fgnId) reqByForeignId.set(fgnId, row);
      }
      const testByExternalId = new Map();
      const testByForeignId = new Map();
      for (const row of existingTests) {
        const extId = row.attributes?.reqifExternalId;
        if (extId) testByExternalId.set(extId, row);
        const fgnId = row.attributes?.reqifForeignId;
        if (fgnId) testByForeignId.set(fgnId, row);
      }

      function findExisting(item) {
        const byExt = item.target.isTest ? testByExternalId : reqByExternalId;
        const byFgn = item.target.isTest ? testByForeignId : reqByForeignId;
        return byExt.get(item.externalId) || (item.foreignId ? byFgn.get(item.foreignId) : undefined);
      }
      function registerExisting(item, row) {
        const byExt = item.target.isTest ? testByExternalId : reqByExternalId;
        const byFgn = item.target.isTest ? testByForeignId : reqByForeignId;
        byExt.set(item.externalId, row);
        if (item.foreignId) byFgn.set(item.foreignId, row);
      }

      // Yeni olusturulacaklari (varlik+tip bazinda grupla, her grup icin TEK
      // seferde text_id blogu ayir — bkz. idGen.js nextTextIdBatch).
      const toCreate = liveItems.filter((item) => {
        const existing = findExisting(item);
        return !existing || existing.type !== item.target.type;
      });
      const createGroups = new Map();
      for (const item of toCreate) {
        const key = `${item.target.isTest}|${item.target.type}`;
        if (!createGroups.has(key)) createGroups.set(key, []);
        createGroups.get(key).push(item);
      }
      const assignedTextId = new Map();
      for (const [key, items] of createGroups) {
        const [isTestStr, type] = key.split('|');
        const ids = await nextTextIdBatch(tx, pid, type, isTestStr === 'true', items.length);
        items.forEach((item, i) => assignedTextId.set(item, ids[i]));
      }

      let createdReqs = 0;
      let updatedReqs = 0;
      let createdTests = 0;
      let updatedTests = 0;
      for (const item of liveItems) {
        const existing = findExisting(item);
        const { known, attrBag, foreign } = splitGitsisAttributes(item.customAttributes);
        const baseAttributes = {
          reqifExternalId: item.externalId,
          ...(item.foreignId ? { reqifForeignId: item.foreignId } : {}),
          ...attrBag,
          ...foreign,
        };

        if (
          !item.target.isTest &&
          item.typeHint &&
          TYPE_LABEL[item.typeHint] &&
          TYPE_LABEL[item.typeHint] !== item.target.type
        ) {
          if (warnings.length < 20) {
            warnings.push(
              `"${item.title || item.externalId}" dosyada "${TYPE_LABEL[item.typeHint]}" tipini işaret ediyor, ancak "${item.target.type}" olarak içe aktarıldı.`,
            );
          }
        }

        const model = item.target.isTest ? tx.testCase : tx.requirement;
        if (existing && existing.type === item.target.type) {
          const mergedAttributes = { ...(existing.attributes || {}), ...baseAttributes };
          const row = await model.update({
            where: { id: existing.id },
            data: {
              title: (item.title || '').trim(),
              description: cleanRichText((item.description || '').trim()),
              attributes: mergedAttributes,
              ...(known.field ? { field: known.field } : {}),
            },
          });
          registerExisting(item, { id: row.id, type: row.type, attributes: row.attributes });
          if (item.target.isTest) updatedTests++;
          else updatedReqs++;
        } else {
          const text_id = assignedTextId.get(item);
          const row = await model.create({
            data: {
              projectId: pid,
              text_id,
              title: (item.title || '').trim(),
              description: cleanRichText((item.description || '').trim()),
              type: item.target.type,
              field: known.field || null,
              attributes: { priority: 'Medium', ...baseAttributes },
              status: 'In Review',
              author: known.author || 'reqif.import',
            },
          });
          registerExisting(item, { id: row.id, type: row.type, attributes: row.attributes });
          if (item.target.isTest) createdTests++;
          else createdReqs++;
        }
      }

      // Kaynakta silinmis nesneler: gorunur kayit OLUSTURMADAN numarasini
      // emekliye ayir (Requirement VEYA TestCase tarafinda, hedef tipine
      // gore). Ayni externalId icin DAHA ONCE emekliye ayrilmis bir numara
      // varsa (tekrar ice aktarma) IKINCI bir numara TUKETILMEZ — dedupe, bu
      // projede daha once yazilmis "*-retired" audit kayitlarina bakilarak
      // yapilir.
      const existingRetirements = await tx.auditLog.findMany({
        where: { projectId: pid, entityType: { in: ['requirement-retired', 'testcase-retired'] }, field: 'reqifExternalId' },
        select: { newValue: true },
      });
      const alreadyRetired = new Set(existingRetirements.map((r) => r.newValue).filter(Boolean));
      const newRetirements = deletedItems.filter((r) => !alreadyRetired.has(r.externalId));
      const retireGroups = new Map();
      for (const item of newRetirements) {
        const key = `${item.target.isTest}|${item.target.type}`;
        if (!retireGroups.has(key)) retireGroups.set(key, []);
        retireGroups.get(key).push(item);
      }
      let retiredCount = 0;
      for (const [key, items] of retireGroups) {
        const [isTestStr, type] = key.split('|');
        const isTest = isTestStr === 'true';
        const ids = await nextTextIdBatch(tx, pid, type, isTest, items.length);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await tx.auditLog.create({
            data: {
              projectId: pid,
              action: 'DELETE',
              entityType: isTest ? 'testcase-retired' : 'requirement-retired',
              textId: ids[i],
              field: 'reqifExternalId',
              newValue: item.externalId,
              message: `ReqIF içe aktarımda kaynak sistemde silinmiş olarak işaretlenmiş nesne: "${item.title || item.externalId}". Numara emekliye ayrıldı, görünür kayıt oluşturulmadı.`,
              actor: 'reqif.import',
            },
          });
        }
        retiredCount += items.length;
      }

      // İzlenebilirlik Bağlarını Ekle — Satisfies (Requirement<->Requirement)
      // VE Verifies (Requirement<->TestCase) desteklenir. SPEC-RELATION
      // kaynak/hedef yönü araca göre değişebildiğinden (kimi araçlarda
      // "source" alt seviye, kimisinde üst seviyedir) Satisfies için her iki
      // yön de denenir; Verifies yönü ise endpoint TÜRÜNDEN (hangisi
      // Requirement, hangisi TestCase) kesin olarak belirlenir.
      const existingLinks = await tx.traceabilityLink.findMany({ where: { projectId: pid } });
      const linkKey = (fromId, toId, type) => `${fromId}|${toId}|${type}`;
      const seenLinks = new Set(existingLinks.map((l) => linkKey(l.fromId, l.toId, l.type)));

      function resolveEndpoint(externalId) {
        const req = reqByExternalId.get(externalId);
        if (req) return { ...req, kind: 'requirement' };
        const test = testByExternalId.get(externalId);
        if (test) return { ...test, kind: 'testcase' };
        return null;
      }

      let skippedLinks = 0;
      const pendingLinks = [];
      for (const rel of relations) {
        const src = resolveEndpoint(rel.sourceExternalId);
        const tgt = resolveEndpoint(rel.targetExternalId);
        if (!src || !tgt) {
          skippedLinks++;
          continue;
        }

        let fromObj;
        let toObj;
        let linkType;
        let toKind;
        if (rel.linkTypeHint === 'verifies') {
          if (src.kind === 'requirement' && tgt.kind === 'testcase') {
            fromObj = src;
            toObj = tgt;
          } else if (src.kind === 'testcase' && tgt.kind === 'requirement') {
            fromObj = tgt;
            toObj = src;
          } else {
            skippedLinks++;
            continue;
          }
          linkType = LINK_TYPE.VERIFIES;
          toKind = 'test';
        } else if (rel.linkTypeHint === 'satisfies') {
          if (src.kind !== 'requirement' || tgt.kind !== 'requirement') {
            skippedLinks++;
            continue;
          }
          fromObj = src;
          toObj = tgt;
          linkType = LINK_TYPE.SATISFIES;
          toKind = 'requirement';
        } else {
          skippedLinks++;
          if (warnings.length < 20) {
            warnings.push(
              `İlişki desteklenmiyor (${rel.typeName || rel.linkTypeHint}): ${rel.sourceExternalId} → ${rel.targetExternalId}.`,
            );
          }
          continue;
        }

        let verdict = validateLink(fromObj, toObj, linkType, toKind);
        if (!verdict.ok && linkType === LINK_TYPE.SATISFIES) {
          const swapped = validateLink(toObj, fromObj, linkType, toKind);
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

        const key = linkKey(fromObj.id, toObj.id, linkType);
        if (seenLinks.has(key)) continue;
        seenLinks.add(key);
        pendingLinks.push({
          projectId: pid,
          fromId: fromObj.id,
          toId: toObj.id,
          type: linkType,
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
          message: `ReqIF içe aktarma: ${createdReqs} yeni gereksinim, ${updatedReqs} güncellendi, ${createdTests} yeni test, ${updatedTests} güncellendi, ${retiredCount} numara emekliye ayrıldı (kaynakta silinmiş), ${pendingLinks.length} bağ eklendi, ${skippedLinks} bağ atlandı.`,
        },
      });

      return {
        importedRequirements: createdReqs,
        updatedRequirements: updatedReqs,
        importedTestCases: createdTests,
        updatedTestCases: updatedTests,
        retiredRequirements: retiredCount,
        importedLinks: pendingLinks.length,
        skippedLinks,
        totalRequirementsInFile: requirements.length,
        totalRelationsInFile: relations.length,
      };
    });

    await recomputeStatusesBulk(prisma, pid);

    const retiredNote = result.retiredRequirements > 0 ? `, ${result.retiredRequirements} numara emekliye ayrıldı` : '';
    const testNote =
      result.importedTestCases > 0 || result.updatedTestCases > 0
        ? `, ${result.importedTestCases} yeni test, ${result.updatedTestCases} test güncellendi`
        : '';
    return res.status(200).json({
      success: true,
      message: `ReqIF başarıyla içe aktarıldı: ${result.importedRequirements} yeni, ${result.updatedRequirements} güncellendi${testNote}${retiredNote}, ${result.importedLinks} bağ eklendi.`,
      stats: result,
      warnings,
    });
  } catch (error) {
    console.error('ReqIF Import Hatası:', error);
    return res.status(500).json({ error: error.message || 'ReqIF içe aktarılamadı.' });
  }
});

/**
 * GET /api/projects/:pid/traceability/export/reqif
 * Gereksinim + Test Senaryosu verisini standart ReqIF 1.0 (.reqif ya da
 * .reqifz) formatinda export eder — DOORS'a (ReqIF Exchange) ice
 * aktarilabilir ve daha sonra Gitsis'e KAYIPSIZ geri aktarilabilir (bkz.
 * reqifExporter.js basindaki round-trip aciklamasi).
 *
 * Query parametreleri:
 *   layer   - bir REQ_TYPE degeri (opsiyonel). Verilirse SADECE o katmandaki
 *             gereksinimler export edilir (test senaryolari HARIC tutulur —
 *             bu, tek bir DOORS modulune karsilik gelen "katman bazli"
 *             export'tur). Verilmezse TUM katmanlar + tum test senaryolari
 *             TEK dosyada, her biri kendi SPECIFICATION'inda export edilir.
 *   format  - 'reqif' (duz XML, varsayilan) ya da 'reqifz' (ZIP).
 */
router.get('/export/reqif', async (req, res) => {
  try {
    const pid = req.params.pid;
    const layer = REQ_TYPES.includes(req.query.layer) ? req.query.layer : null;
    const format = req.query.format === 'reqifz' ? 'reqifz' : 'reqif';

    const [project, requirements, testCases, links] = await Promise.all([
      prisma.project.findUnique({ where: { id: pid }, select: { name: true } }),
      prisma.requirement.findMany({
        where: { projectId: pid, ...(layer ? { type: layer } : {}) },
        orderBy: { text_id: 'asc' },
      }),
      layer ? Promise.resolve([]) : prisma.testCase.findMany({ where: { projectId: pid }, orderBy: { text_id: 'asc' } }),
      prisma.traceabilityLink.findMany({ where: { projectId: pid } }),
    ]);

    if (requirements.length === 0 && testCases.length === 0) {
      return res.status(400).json({ error: 'Dışa aktarılacak gereksinim veya test senaryosu bulunamadı.' });
    }

    const xml = buildReqIF({ projectName: project?.name, requirements, testCases, links });

    const baseName = `Gitsis_${layer ? layer.replace(/\s+/g, '_') : 'Export'}_${Date.now()}`;
    if (format === 'reqifz') {
      const zipBuf = createZip([{ name: `${baseName}.reqif`, data: xml }]);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.reqifz"`);
      return res.end(zipBuf);
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.reqif"`);
    return res.end(Buffer.from(xml, 'utf8'));
  } catch (error) {
    console.error('ReqIF export hatası:', error);
    res.status(500).json({ error: 'ReqIF export yapılamadı', details: error.message });
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
