// ============================================================================
//  migrate-system-role.mjs — Issue #101: systemRole -> roleKey backfill.
//  `prisma db push` User.systemRole kolonunu dusurmeden ONCE calistirilir
//  (predb:push). Idempotent: kolon yoksa atlar, varsa ADMIN kayitlarini
//  roleKey='admin' / role='Admin' yapar.
// ============================================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'systemRole'`,
  );
  if (rows.length === 0) {
    console.log('[migrate-system-role] systemRole kolonu yok; atlaniyor.');
    return;
  }
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "roleKey" = 'admin', "role" = 'Admin'
     WHERE "systemRole" = 'ADMIN' AND ("roleKey" IS NULL OR "roleKey" <> 'admin')`,
  );
  console.log(`[migrate-system-role] ${updated} ADMIN hesabi roleKey='admin' yapildi.`);
}

main()
  .catch((e) => {
    console.error('[migrate-system-role] HATA:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
