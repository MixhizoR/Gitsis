// ============================================================================
//  seed-admin.mjs  —  Issue #85: ilk ADMIN kullanicisini bootstrap eder.
//
//  AMAC: `prisma db push` sonrasi User.password -> passwordHash yeniden
//  adlandirmasi mevcut sifrelerin kaybina yol acar. Bu script, mevcut dev
//  veritabanina ADMIN kaydini idempotent sekilde geri ekler:
//    - YOKSA  -> ADMIN kullanici olusturur (varsayilan: admin / admin)
//    - VARSA  -> roleKey='admin', clearanceLevel>=5, isActive=true
//                guvence altina alinir; sifre YALNIZCA hash bos/silinmis ise
//                yeniden yazilir (mevcut sifreye dokunulmaz).
//
//  CALISTIRMA:
//    cd backend && pnpm run seed:admin
//    (Backend ayakta olmak ZORUNDA DEGILDIR — dogrudan DB'ye yazar.)
//
//  Env ile degistirilebilir:
//    ADMIN_USERNAME, ADMIN_DEFAULT_PASSWORD, ADMIN_NAME, ADMIN_INITIALS
// ============================================================================
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/auth.js';

/**
 * Idempotent ADMIN upsert.
 * @param {PrismaClient} [clientOverride] — testler mevcut client'ini
 *   gecirebilir; CLI modu kendi client'ini olusturup kapatir.
 * @returns {Promise<{ username: string, created: boolean }>}
 */
export async function upsertAdmin(clientOverride) {
  const prisma = clientOverride || new PrismaClient();
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin';
  const name = process.env.ADMIN_NAME || 'Admin';
  const initials =
    process.env.ADMIN_INITIALS ||
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    const data = {
      roleKey: 'admin',
      role: 'Admin',
      clearanceLevel: Math.max(existing.clearanceLevel || 0, 5),
      isActive: true,
    };
    // Hash bos/silinmis ise (db push sonrasi sifre kaybi) yeniden olustur.
    if (!existing.passwordHash || existing.passwordHash.length === 0) {
      data.passwordHash = await hashPassword(password);
    }
    await prisma.user.update({ where: { id: existing.id }, data });
    console.log(`[seed-admin] Mevcut kullanici ADMIN yapildi: ${username}`);
  } else {
    await prisma.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        name,
        initials,
        role: 'Admin',
        roleKey: 'admin',
        clearanceLevel: 5,
        isActive: true,
      },
    });
    console.log(`[seed-admin] ADMIN olusturuldu: ${username} / ${password} (ilk giris sonrasi degistirin!)`);
  }

  if (!clientOverride) await prisma.$disconnect();
  return { username, created: !existing };
}

// CLI giris noktasi:  node scripts/seed-admin.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  upsertAdmin().catch((e) => {
    console.error('[seed-admin] HATA:', e);
    process.exitCode = 1;
  });
}
