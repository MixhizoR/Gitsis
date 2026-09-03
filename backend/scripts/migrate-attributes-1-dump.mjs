//============================================================================
//  migrate-attributes-1-dump.mjs
//
//  STEP 1 of 2 for moving from hardcoded `priority`/`dal_level` columns to
//  the new modular JSONB `attributes` column (see src/attributes.js).
//
//  Run this BEFORE `npx prisma db push` / `npm run db:push` — i.e. while the
//  database still physically has the old `priority` and `dal_level` columns
//  on `Requirement` and `TestCase`. It reads them with raw SQL (which does
//  not depend on the Prisma Client's generated model types, only on the
//  columns actually existing in the DB) and writes a JSON snapshot to disk.
//
//  Usage:
//    cd backend
//    node scripts/migrate-attributes-1-dump.mjs
//
//  Then continue with:
//    npx prisma generate
//    npx prisma db push          # drops priority/dal_level, adds attributes
//    node scripts/migrate-attributes-2-restore.mjs
// ============================================================================
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const prisma = new PrismaClient();
const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'attr-migration-dump.json');

async function main() {
  console.log('[migrate:1] Eski priority/dal_level kolonlari okunuyor (raw SQL)...');

  let requirements, testCases;
  try {
    requirements = await prisma.$queryRawUnsafe(`SELECT "id", "priority", "dal_level" FROM "Requirement"`);
  } catch (e) {
    console.error(
      '[migrate:1] Requirement.priority/dal_level okunamadi. Bu script `prisma db push` calistirilmadan ONCE ' +
        "calistirilmalidir (kolonlar hala DB'de olmali). Hata:",
      e.message,
    );
    process.exit(1);
  }

  try {
    testCases = await prisma.$queryRawUnsafe(`SELECT "id", "priority", "dal_level" FROM "TestCase"`);
  } catch (e) {
    console.error('[migrate:1] TestCase.priority/dal_level okunamadi:', e.message);
    process.exit(1);
  }

  const dump = {
    dumpedAt: new Date().toISOString(),
    requirements: requirements.map((r) => ({ id: r.id, priority: r.priority, dal_level: r.dal_level })),
    testCases: testCases.map((t) => ({ id: t.id, priority: t.priority, dal_level: t.dal_level })),
  };

  writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf8');
  console.log(
    `[migrate:1] ${dump.requirements.length} gereksinim + ${dump.testCases.length} test kaydi yazildi -> ${outPath}`,
  );
  console.log('[migrate:1] Simdi calistirin: npx prisma generate && npx prisma db push');
  console.log('[migrate:1] Ardindan: node scripts/migrate-attributes-2-restore.mjs');
}

main()
  .catch((e) => {
    console.error('[migrate:1] Beklenmeyen hata:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
