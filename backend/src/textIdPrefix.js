// ============================================================================
//  textIdPrefix.js — text_id onegini degistirme + mevcut kayitlari tasima.
//
//  Yapi: <codePrefix>-<TIP>-<NNN>   ornek: EH-KAHVE-TİD-USR-001
//  Numara KORUNUR; yalnizca onek degisir. Boylece bir kaydin sirasi/kimligi
//  degismis olmaz.
//
//  Denetim izi: her yeniden adlandirma icin AuditLog'a RENAME kaydi yazilir,
//  `textId` alaninda "eski -> yeni" birlikte tutulur. Bu sayede eski kodlar
//  hem gecmiste aranabilir kalir hem de idGen.js'in kara listesinde durur
//  (asla yeniden uretilmezler).
//
//  Snapshot'lara DOKUNULMAZ: onlar belirli bir andaki donmus kayitlardir.
// ============================================================================
import { prefixFor } from './constants.js';

// Bir text_id'nin SONUNDAKI numarayi alir: "REQ-USR-007" -> "007"
const tailNumber = (textId) => {
  const m = String(textId || '').match(/(\d+)\s*$/);
  return m ? m[1] : null;
};

/**
 * Tek bir projenin kayitlarini verilen onege tasir.
 * @param {object} prisma
 * @param {{id: string, name?: string, codePrefix: string}} project
 * @param {{dryRun?: boolean, log?: Function}} opts
 * @returns {Promise<{renamed:number, skipped:number, unresolved:number, plan:Array}>}
 */
export async function migrateProjectPrefix(prisma, project, { dryRun = false, log = () => {} } = {}) {
  const [requirements, testCases, glossary] = await Promise.all([
    prisma.requirement.findMany({ where: { projectId: project.id } }),
    prisma.testCase.findMany({ where: { projectId: project.id } }),
    prisma.glossaryTerm.findMany({ where: { projectId: project.id } }),
  ]);

  const stats = { renamed: 0, skipped: 0, unresolved: 0 };
  const plan = [];

  const consider = (rows, model, entityType, typeOf) => {
    for (const row of rows) {
      const prefix = prefixFor(project.codePrefix, typeOf(row));
      if (row.text_id?.startsWith(prefix + '-')) {
        stats.skipped++; // zaten hedef semada
        continue;
      }
      const n = tailNumber(row.text_id);
      if (!n) {
        stats.unresolved++;
        log(`  ! numara cozulemedi, atlandi: ${row.text_id}`);
        continue;
      }
      plan.push({ model, entityType, id: row.id, oldTextId: row.text_id, newTextId: `${prefix}-${n}` });
    }
  };

  consider(requirements, 'requirement', 'requirement', (r) => r.type);
  consider(testCases, 'testCase', 'testcase', (r) => r.type);
  consider(glossary, 'glossaryTerm', 'glossary', () => 'glossary');

  // Hedef kod cakismasi olmamali; olursa hicbir sey yazmadan dur.
  const targets = new Set();
  for (const p of plan) {
    if (targets.has(p.newTextId)) {
      throw Object.assign(new Error(`Cakisma: ${p.newTextId} birden fazla kayda denk geliyor.`), { status: 409 });
    }
    targets.add(p.newTextId);
  }

  if (dryRun || plan.length === 0) return { ...stats, plan };

  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      await tx[p.model].update({ where: { id: p.id }, data: { text_id: p.newTextId } });
      await tx.auditLog.create({
        data: {
          projectId: project.id,
          action: 'RENAME',
          entityType: p.entityType,
          entityId: p.id,
          // Eski kod kara listede kalsin diye ikisi birlikte yazilir.
          textId: `${p.oldTextId} -> ${p.newTextId}`,
          field: 'text_id',
          oldValue: p.oldTextId,
          newValue: p.newTextId,
          message: `Kod onegi guncellendi: ${p.oldTextId} -> ${p.newTextId}.`,
        },
      });
    }
  });
  stats.renamed = plan.length;
  return { ...stats, plan };
}

/**
 * Projenin onegini gunceller; istege bagli olarak mevcut kayitlari da tasir.
 * @returns {Promise<{project: object, renamed: number, skipped: number}>}
 */
export async function setProjectCodePrefix(prisma, projectId, codePrefix, { migrateExisting = false } = {}) {
  const clean = String(codePrefix ?? '').trim();
  if (!clean) throw Object.assign(new Error('Kod onegi bos olamaz.'), { status: 400 });
  // Kod uretiminde bosluk/karisik karakter istemiyoruz.
  if (!/^[A-Za-z0-9ĞÜŞİÖÇğüşıöç._-]+$/.test(clean)) {
    throw Object.assign(new Error('Kod onegi yalnizca harf, rakam, nokta, tire ve alt cizgi icerebilir.'), {
      status: 400,
    });
  }

  const project = await prisma.project.update({ where: { id: projectId }, data: { codePrefix: clean } });
  if (!migrateExisting) return { project, renamed: 0, skipped: 0 };

  const res = await migrateProjectPrefix(prisma, project);
  return { project, renamed: res.renamed, skipped: res.skipped };
}
