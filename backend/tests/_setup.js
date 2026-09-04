// ============================================================================
//  _setup.js — Backend test ortak setup (Issue #69 refactor).
//
//  Her test dosyasi bu modulu `import './_setup.js'` ile EN ÜSTTE yükler.
//  Module side-effect-only: import aninda ortam degiskenlerini kurar, DB
//  sifirlama yardimcisi (`resetDb`) ve setup sabitlerini export eder.
//
//  NEDEN DRY?
//    Eski duzende 9 dosya ayni 10 satirlik env-setup + execSync + createDb
//    karmasini kopyeliyordu (BP-2/BP-3). Bu modul tek dogruluk kaynagi.
//
//  NEDEN "TEK SEFER" DEGIL?
//    `node --test` her dosyayi ayri bir surec olarak calistirir
//    (varsayilan: --test-isolation=process). Bu yuzden global bir modul
//    seviyesinde DB sifirlama flag'i surecler arasinda tasinmaz. Yine de
//    sifirlama kodunu 9 dosyada tekrarlamak yerine 1 yardimci fonksiyona
//    indirgiyoruz (BP-2). Sure iyilesmesi minimal; bakim iyilesmesi buyuk.
// ============================================================================

// --- 1) Ortam degiskenleri --------------------------------------------------
// PrismaClient import aninda DATABASE_URL'i okur; import'lardan ONCE kurulur.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ehsim-test-secret';

if (!process.env.DATABASE_URL) {
  // Yerel: docker compose "db" servisi 5433'u disariya acar.
  // CI: TEST_DATABASE_URL ile override edilir.
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    `postgresql://ehsim:${encodeURIComponent(
      process.env.POSTGRES_PASSWORD || 'ehsim_local_pass_2026',
    )}@localhost:5433/ehsim_rmt_test`;
}
export const LOCAL_DOCKER_DB = !process.env.TEST_DATABASE_URL;

// --- 2) DB sifirlama yardimcisi ---------------------------------------------
// Yalnizca entegrasyon testlerinde cagrilir (`resetDb()`); birim testlerde
// import edilmez. execSync zorunlu: Prisma API yalnizca veri temizler, sema
// push yapmaz — biz "force-reset" istiyoruz (BP-3 kapsaminda not).
import { execSync } from 'node:child_process';

/**
 * Test veritabanini sifirlar + mevcutsa `ehsim_rmt_test`'i yaratir.
 * 9 dosya tarafindan ortak cagrilir; surekli surecler arasinda "tek sefer"
 * calismaz (node --test varsayilan izolasyon).
 */
export function resetDb() {
  if (LOCAL_DOCKER_DB) {
    try {
      execSync('docker compose exec -T db psql -U ehsim -d ehsim_rmt -c "CREATE DATABASE ehsim_rmt_test"', {
        stdio: 'pipe',
      });
    } catch {
      // Zaten var — sorun degil.
    }
  }
  execSync('npx prisma db push --force-reset --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env },
  });
}

// --- 3) Paylasilan PM seed sabitleri ---------------------------------------
// Her test dosyasi kendi PM kullanici adini uretir (izolasyon), ama
// hashPassword tek bir ortak modul (auth.js) uzerinden gelir; sabit burada
// export edilmez — her test kendi username/password'unu secer.
