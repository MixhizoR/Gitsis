// ============================================================================
//  migrate-text-id-prefix.js — TUM projelerin mevcut kayitlarini, projenin
//  kendi `codePrefix` degerine gore yeni text_id semasina tasir:
//    REQ-USR-001  ->  <codePrefix>-USR-001     (orn. EH-KAHVE-TİD-USR-001)
//
//  Asil mantik src/textIdPrefix.js icindedir (API de ayni modulu kullanir);
//  bu dosya yalnizca komut satiri sarmalayicisidir.
//
//  Idempotent: zaten hedef oneki tasiyan kayitlar atlanir.
//
//  Kullanim:
//    DATABASE_URL=... node prisma/migrate-text-id-prefix.js           # uygula
//    DATABASE_URL=... node prisma/migrate-text-id-prefix.js --dry-run # rapor
// ============================================================================
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { migrateProjectPrefix } from '../src/textIdPrefix.js';

const prisma = new PrismaClient();

export async function migrateAll({ dryRun = false, log = console.log } = {}) {
  const projects = await prisma.project.findMany({ select: { id: true, name: true, codePrefix: true } });
  const total = { renamed: 0, skipped: 0, unresolved: 0 };

  for (const project of projects) {
    log(`\nProje: "${project.name}"  (onek: ${project.codePrefix})`);
    const res = await migrateProjectPrefix(prisma, project, { dryRun, log });
    log(`  ${res.plan.length} kayit yeniden adlandirilacak, ${res.skipped} kayit zaten yeni semada.`);
    for (const p of res.plan.slice(0, 5)) log(`    ${p.oldTextId} -> ${p.newTextId}`);
    if (res.plan.length > 5) log(`    ... (+${res.plan.length - 5} kayit daha)`);
    total.renamed += res.renamed;
    total.skipped += res.skipped;
    total.unresolved += res.unresolved;
  }

  log(
    `\n${dryRun ? '(dry-run) ' : ''}Tamam: ${total.renamed} kayit yeniden adlandirildi, ` +
      `${total.skipped} zaten yeni semada, ${total.unresolved} cozulemedi.`,
  );
  return total;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  migrateAll({ dryRun })
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error('Migration hatasi:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
