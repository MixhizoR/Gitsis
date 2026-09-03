// ============================================================================
//  migrate-text-id-prefix.js — Mevcut kayitlarin text_id onegini YENI semaya
//  tasir:  REQ-USR-001  ->  <codePrefix>-USR-001   (orn. EH-KAHVE-TİD-USR-001)
//
//  Yapi: <codePrefix>-<TIP>-<NNN>. Numara KORUNUR — yalnizca onek degisir,
//  boylece bir kaydin sirasi/kimligi degismis olmaz.
//
//  Denetim izi: her yeniden adlandirma icin AuditLog'a RENAME kaydi yazilir
//  ve `textId` alaninda "eski -> yeni" birlikte tutulur. Bu sayede:
//   - eski kodlar denetim gecmisinde aranabilir kalir
//   - idGen.js'in kara listesi eski kodlari da gormeye devam eder
//     (asla yeniden uretilmezler)
//
//  Snapshot'lara DOKUNULMAZ: onlar belirli bir andaki donmus kayitlardir,
//  o andaki kodlari gostermeye devam etmelidir.
//
//  Idempotent: zaten yeni oneki tasiyan kayitlar atlanir.
//
//  Kullanim:
//    DATABASE_URL=... node prisma/migrate-text-id-prefix.js           # uygula
//    DATABASE_URL=... node prisma/migrate-text-id-prefix.js --dry-run # rapor
// ============================================================================
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { prefixFor } from '../src/constants.js';

const prisma = new PrismaClient();

// Bir text_id'nin SONUNDAKI numarayi alir: "REQ-USR-007" -> "007"
const tailNumber = (textId) => {
  const m = String(textId || '').match(/(\d+)\s*$/);
  return m ? m[1] : null;
};

export async function migratePrefixes({ dryRun = false, log = console.log } = {}) {
  const projects = await prisma.project.findMany({ select: { id: true, name: true, codePrefix: true } });
  const stats = { renamed: 0, skipped: 0, unresolved: 0 };

  for (const project of projects) {
    log(`\nProje: "${project.name}"  (onek: ${project.codePrefix})`);

    const [requirements, testCases, glossary] = await Promise.all([
      prisma.requirement.findMany({ where: { projectId: project.id } }),
      prisma.testCase.findMany({ where: { projectId: project.id } }),
      prisma.glossaryTerm.findMany({ where: { projectId: project.id } }),
    ]);

    const plan = []; // { model, id, oldTextId, newTextId, entityType }
    const consider = (rows, model, entityType, typeOf) => {
      for (const row of rows) {
        const type = typeOf(row);
        const prefix = prefixFor(project.codePrefix, type);
        if (row.text_id?.startsWith(prefix + '-')) {
          stats.skipped++; // zaten yeni semada
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

    // Ayni projede hedef kod cakismasi var mi? (olmamali; erken uyar)
    const targets = new Set();
    for (const p of plan) {
      if (targets.has(p.newTextId)) {
        throw new Error(`Cakisma: ${p.newTextId} birden fazla kayda denk geliyor — migration durduruldu.`);
      }
      targets.add(p.newTextId);
    }

    log(`  ${plan.length} kayit yeniden adlandirilacak, ${stats.skipped} kayit zaten yeni semada.`);
    for (const p of plan.slice(0, 5)) log(`    ${p.oldTextId} -> ${p.newTextId}`);
    if (plan.length > 5) log(`    ... (+${plan.length - 5} kayit daha)`);

    if (dryRun || plan.length === 0) continue;

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
    stats.renamed += plan.length;
  }

  log(
    `\n${dryRun ? '(dry-run) ' : ''}Tamam: ${stats.renamed} kayit yeniden adlandirildi, ` +
      `${stats.skipped} zaten yeni semada, ${stats.unresolved} cozulemedi.`,
  );
  return stats;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  migratePrefixes({ dryRun })
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error('Migration hatasi:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
