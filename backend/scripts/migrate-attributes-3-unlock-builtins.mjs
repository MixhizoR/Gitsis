// ============================================================================
//  migrate-attributes-3-unlock-builtins.mjs
//
//  Priority and DAL Level used to be "system"-protected attribute
//  definitions (undeletable). They no longer are: Priority still ships by
//  default on new projects but can now be removed, and DAL Level is no
//  longer seeded as a built-in at all.
//
//  Projects created BEFORE this change still have `system: true` stored on
//  their Priority/DAL Level AttributeDefinition rows, which would block
//  deletion through the API/UI. Run this once to unprotect them. Safe to
//  run more than once.
//
//  Usage:
//    cd backend
//    node scripts/migrate-attributes-3-unlock-builtins.mjs
// ============================================================================
import { PrismaClient } from '@prisma/client';
import { unlockLegacyBuiltinAttributes } from '../src/attributes.js';

const prisma = new PrismaClient();

async function main() {
  const count = await unlockLegacyBuiltinAttributes(prisma);
  console.log(`[migrate:3] ${count} eski Priority/DAL Level tanimi artik silinebilir (system kilidi kaldirildi).`);
  console.log('[migrate:3] DAL Level artik yeni projelerde varsayilan olarak eklenmiyor.');
  console.log('[migrate:3] Mevcut projelerde DAL Level istenmiyorsa, Oznitelik Yoneticisi\'nden silinebilir.');
}

main()
  .catch((e) => {
    console.error('[migrate:3] Beklenmeyen hata:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
