// ============================================================================
//  backfill-parent-id.js — Issue #9 / Adim 1
//
//  Mevcut projelerde PBS (Urun Agaci) hiyerarsisini `Requirement.parentId`
//  koluna tasir. Kaynak: TraceabilityLink kayitlari (type = 'Satisfies',
//  fromId = UST gereksinim, toId = ALT gereksinim).
//
//  Onemli: TraceabilityLink cok-ebeveynli olabilir (bir SW/HW gereksinimi
//  birden fazla System gereksinimini "satisfy" edebilir). Agac yapisi TEK
//  ebeveyn gerektirdigi icin cakisma halinde en dusuk text_id'li ebeveyn
//  secilir ve durum denetim amaciyla loglanir. TraceabilityLink tablosuna
//  DOKUNULMAZ — izlenebilirlik semantigi oldugu gibi kalir.
//
//  Idempotent: zaten dogru parentId'ye sahip satirlar guncellenmez; script
//  tekrar tekrar calistirilabilir.
//
//  Kullanim:
//    DATABASE_URL=... node prisma/backfill-parent-id.js           # yaz
//    DATABASE_URL=... node prisma/backfill-parent-id.js --dry-run # sadece rapor
// ============================================================================
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { LINK_TYPE, SATISFIES_PARENT_OF } from '../src/constants.js';

const prisma = new PrismaClient();

// text_id'leri dogal (sayisal) siraya gore karsilastirir: REQ-SYS-002 < REQ-SYS-010
const byTextId = (a, b) => String(a.text_id).localeCompare(String(b.text_id), undefined, { numeric: true });

export async function backfillParentIds({ dryRun = false, log = console.log } = {}) {
  const [requirements, satisfies] = await Promise.all([
    prisma.requirement.findMany({ select: { id: true, projectId: true, text_id: true, type: true, parentId: true } }),
    prisma.traceabilityLink.findMany({
      where: { type: LINK_TYPE.SATISFIES },
      select: { fromId: true, toId: true },
    }),
  ]);

  const reqById = new Map(requirements.map((r) => [r.id, r]));

  // child id -> aday ebeveyn gereksinimler
  const candidates = new Map();
  for (const link of satisfies) {
    const child = reqById.get(link.toId);
    const parent = reqById.get(link.fromId);
    // Satisfies baglari test/glossary hedefi de tasiyabilir; yalnizca
    // gereksinim-gereksinim baglari agaca girer.
    if (!child || !parent) continue;
    if (child.projectId !== parent.projectId) continue;
    if (!candidates.has(child.id)) candidates.set(child.id, []);
    candidates.get(child.id).push(parent);
  }

  const stats = { children: candidates.size, updated: 0, unchanged: 0, conflicts: 0, typeMismatch: 0 };
  // parent id -> guncellenecek child id listesi (tek updateMany ile yazmak icin)
  const updates = new Map();

  for (const [childId, parents] of candidates) {
    const child = reqById.get(childId);
    const expectedType = SATISFIES_PARENT_OF[child.type];
    // Tip kuralina uyan adaylari tercih et; hicbiri uymuyorsa tum adaylara dus.
    const valid = expectedType ? parents.filter((p) => p.type === expectedType) : [];
    let pool = valid;
    if (valid.length === 0) {
      stats.typeMismatch++;
      log(
        `  ! ${child.text_id} (${child.type}): beklenen ust tip "${expectedType || '-'}" olan aday yok; ` +
          `adaylar: ${parents.map((p) => `${p.text_id}/${p.type}`).join(', ')}`,
      );
      pool = parents;
    }

    const chosen = [...pool].sort(byTextId)[0];
    if (pool.length > 1) {
      stats.conflicts++;
      const others = [...pool]
        .sort(byTextId)
        .slice(1)
        .map((p) => p.text_id)
        .join(', ');
      log(`  ~ ${child.text_id}: ${pool.length} ebeveyn adayi — secilen ${chosen.text_id}, disarida kalan: ${others}`);
    }

    if (child.parentId === chosen.id) {
      stats.unchanged++;
      continue;
    }
    if (!updates.has(chosen.id)) updates.set(chosen.id, []);
    updates.get(chosen.id).push(child.id);
    stats.updated++;
  }

  if (!dryRun && updates.size > 0) {
    await prisma.$transaction(
      [...updates].map(([parentId, childIds]) =>
        prisma.requirement.updateMany({ where: { id: { in: childIds } }, data: { parentId } }),
      ),
    );
  }

  log(
    `Backfill ${dryRun ? '(dry-run) ' : ''}tamam: ${stats.children} alt gereksinim tarandi — ` +
      `${stats.updated} guncellendi, ${stats.unchanged} zaten dogruydu, ` +
      `${stats.conflicts} coklu-ebeveyn cakismasi, ${stats.typeMismatch} tip uyumsuzlugu.`,
  );
  return stats;
}

// Dogrudan calistirilirsa (import edildiginde degil) uygula.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  backfillParentIds({ dryRun })
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error('Backfill hatasi:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
