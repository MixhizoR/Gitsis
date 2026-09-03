/* eslint-env node */
/* global console, process */

// ============================================================================
//  migrate-attributes-2-restore.mjs
//
//  STEP 2 of 2. Run AFTER `npx prisma db push` has already added the new
//  `attributes` JSONB column (and dropped the old `priority`/`dal_level`
//  columns) and created the `AttributeDefinition` table.
//
//  This script:
//    1. Seeds the built-in Priority/DAL Level AttributeDefinition rows for
//       every EXISTING project (new projects get these automatically at
//       creation time — see src/attributes.js — but projects created before
//       this migration need a one-time backfill).
//    2. Restores each Requirement/TestCase's old priority/dal_level values
//       (read from the JSON dump written by migrate-attributes-1-dump.mjs)
//       into the new `attributes` JSONB column.
//
//  Usage:
//    cd backend
//    node scripts/migrate-attributes-2-restore.mjs
// ============================================================================
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { seedDefaultAttributeDefinitions } from '../src/attributes.js';

const prisma = new PrismaClient();
const dumpPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'attr-migration-dump.json');

async function main() {
  if (!existsSync(dumpPath)) {
    console.error(
      `[migrate:2] Dump dosyasi bulunamadi: ${dumpPath}\n` +
        '            Once migrate-attributes-1-dump.mjs calistirilmali (db push ONCESINDE).',
    );
    process.exit(1);
  }
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
  console.log(`[migrate:2] Dump okundu (${dump.dumpedAt}): ${dump.requirements.length} req, ${dump.testCases.length} test.`);

  // 1) Mevcut tum projeler icin gomulu oznitelik tanimlarini backfill et.
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  for (const p of projects) {
    await seedDefaultAttributeDefinitions(prisma, p.id);
  }
  console.log(`[migrate:2] ${projects.length} proje icin Priority/DAL Level tanimlari dogrulandi.`);

  // 2) Requirement.attributes restore
  let reqUpdated = 0;
  for (const r of dump.requirements) {
    const attributes = {};
    if (r.priority != null) attributes.priority = r.priority;
    if (r.dal_level != null) attributes.dal_level = r.dal_level;
    if (Object.keys(attributes).length === 0) continue;
    await prisma.requirement.update({ where: { id: r.id }, data: { attributes } }).catch((e) => {
      // Kayit migration ile db push arasinda silinmis olabilir; atla.
      console.warn(`[migrate:2] Requirement ${r.id} guncellenemedi: ${e.message}`);
    });
    reqUpdated++;
  }

  // 3) TestCase.attributes restore
  let testUpdated = 0;
  for (const t of dump.testCases) {
    const attributes = {};
    if (t.priority != null) attributes.priority = t.priority;
    if (t.dal_level != null) attributes.dal_level = t.dal_level;
    if (Object.keys(attributes).length === 0) continue;
    await prisma.testCase.update({ where: { id: t.id }, data: { attributes } }).catch((e) => {
      console.warn(`[migrate:2] TestCase ${t.id} guncellenemedi: ${e.message}`);
    });
    testUpdated++;
  }

  console.log(`[migrate:2] Tamamlandi: ${reqUpdated} gereksinim, ${testUpdated} test guncellendi.`);
  console.log('[migrate:2] Dilerseniz artik attr-migration-dump.json dosyasini silebilirsiniz.');
}

main()
  .catch((e) => {
    console.error('[migrate:2] Beklenmeyen hata:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
