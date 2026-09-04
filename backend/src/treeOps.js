// ============================================================================
//  treeOps.js — PBS agaci yapisal islemleri (Issue #9 / Adim 3): tasima
//  (move), bolme (split), birlestirme (merge). Hepsi atomik transaction
//  icinde; dongusel tasima Recursive CTE ile engellenir (400); text_id'ler
//  hicbir zaman bozulmaz/yeniden kullanilmaz (idGen.js kara listesi).
//
//  Kararlastirilan semantik (Issue #9 / Adim 3 checkpoint):
//    Split : orijinal text_id + tum TraceabilityLink/testler BIRINCIL parcada
//            kalir; yeni parca(lar) ayni ust dugume (parentId + Satisfies
//            bagi) baglanir ama Verifies/Assigned-To bagsiz/bos baslar.
//    Merge : en eski (createdAt) gereksinim hayatta kalir (survivor); digerlerinin
//            TUM baglari + cocuklari survivor'a relink edilir, sonra silinirler;
//            silinen text_id'ler DELETE audit izi ile kara listede kalir.
// ============================================================================
import { assertUuid, MAX_DEPTH } from './tree.js';
import { LINK_TYPE } from './constants.js';
import { validateParentType } from './logic.js';
import { nextTextId } from './idGen.js';

function bad(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

async function auditTx(tx, projectId, entry) {
  await tx.auditLog.create({ data: { projectId, ...entry } });
}

/**
 * newParentId, reqId'nin kendisi veya ALT AGACINDAN biri mi? (dongusel tasima)
 * Recursive CTE ile reqId'nin tum alt agacini gezer, newParentId bu kumede mi bakar.
 */
async function wouldCreateCycle(tx, projectId, reqId, newParentId) {
  if (newParentId === reqId) return true;
  const rows = await tx.$queryRaw`
    WITH RECURSIVE subtree AS (
      SELECT id, 0 AS depth FROM "Requirement" WHERE id = ${reqId}::text AND "projectId" = ${projectId}::text
      UNION ALL
      SELECT r.id, s.depth + 1
      FROM "Requirement" r
      INNER JOIN subtree s ON r."parentId" = s.id
      WHERE r."projectId" = ${projectId}::text AND s.depth < ${MAX_DEPTH}
    )
    SELECT 1 FROM subtree WHERE id = ${newParentId}::text LIMIT 1;
  `;
  return rows.length > 0;
}

// ===========================================================================
//  MOVE — bir gereksinimi baska bir ust dugume tasir.
// ===========================================================================
export async function moveRequirement(prisma, projectId, reqId, newParentId, actor) {
  assertUuid('projectId', projectId);
  assertUuid('reqId', reqId);
  if (newParentId != null) assertUuid('newParentId', newParentId);

  return prisma.$transaction(async (tx) => {
    const child = await tx.requirement.findUnique({ where: { id: reqId } });
    if (!child || child.projectId !== projectId) throw bad('Gereksinim bulunamadi.', 404);
    if (child.locked) throw bad('Bu gereksinim onaylandi ve kilitli; tasinamaz.', 403);

    const parent = newParentId ? await tx.requirement.findUnique({ where: { id: newParentId } }) : null;
    if (newParentId && (!parent || parent.projectId !== projectId)) throw bad('Hedef ust gereksinim bulunamadi.', 404);

    const check = validateParentType(child, parent);
    if (!check.ok) throw bad(check.error);

    if (newParentId && (await wouldCreateCycle(tx, projectId, reqId, newParentId))) {
      throw bad('Dongusel tasima: bir gereksinim kendi alt agacinin altina tasinamaz.');
    }

    const oldParentId = child.parentId;
    if (oldParentId === newParentId) return child; // no-op

    await tx.requirement.update({ where: { id: reqId }, data: { parentId: newParentId } });

    // Satisfies bagini parentId ile SENKRON tut: eski ust->cocuk bagini kaldir,
    // yeni ust->cocuk bagini ekle (kok'e tasiniyorsa hic bag olmaz).
    await tx.traceabilityLink.deleteMany({
      where: { projectId, toId: reqId, type: LINK_TYPE.SATISFIES },
    });
    if (newParentId) {
      await tx.traceabilityLink.create({
        data: { projectId, fromId: newParentId, toId: reqId, type: LINK_TYPE.SATISFIES, createdBy: actor },
      });
    }

    await auditTx(tx, projectId, {
      action: 'MOVE',
      entityType: 'requirement',
      entityId: reqId,
      textId: child.text_id,
      message: `Gereksinim tasindi: "${child.text_id}" ${oldParentId ? `(eski ust: ${oldParentId})` : '(kokten)'} -> ${
        newParentId ? `${newParentId}` : 'kok'
      }.`,
    });

    return tx.requirement.findUnique({ where: { id: reqId } });
  });
}

// ===========================================================================
//  SPLIT — bir gereksinimi N yeni kardese boler (bkz. dosya basi semantik).
// ===========================================================================
export async function splitRequirement(prisma, projectId, reqId, newTitles, actor) {
  assertUuid('projectId', projectId);
  assertUuid('reqId', reqId);
  const titles = (Array.isArray(newTitles) ? newTitles : []).map((t) => String(t ?? '').trim()).filter(Boolean);
  if (titles.length === 0) throw bad('En az bir yeni parca basligi gerekli.');

  return prisma.$transaction(async (tx) => {
    const original = await tx.requirement.findUnique({ where: { id: reqId } });
    if (!original || original.projectId !== projectId) throw bad('Gereksinim bulunamadi.', 404);
    if (original.locked) throw bad('Bu gereksinim onaylandi ve kilitli; bolunemez.', 403);

    const created = [];
    for (const title of titles) {
      const text_id = await nextTextId(tx, projectId, original.type, false);
      const row = await tx.requirement.create({
        data: {
          projectId,
          text_id,
          title,
          description: '',
          type: original.type,
          field: original.field,
          // Modular oznitelikler (Priority / DAL Level / proje ozel alanlar)
          // orijinalden kopyalanir — onceki sabit priority/dal_level
          // kolonlarinin kopyalanmasiyla ayni davranis.
          attributes: original.attributes ?? {},
          status: 'In Review',
          author: actor,
          parentId: original.parentId,
        },
      });
      // Yapisal Satisfies bagi: yeni parca da ayni ust dugume baglanir
      // (tip kuralinin gerektirdigi zorunlu baglanti — Verifies/Assigned-To
      // gibi "icerik" baglari degil).
      if (original.parentId) {
        await tx.traceabilityLink.create({
          data: {
            projectId,
            fromId: original.parentId,
            toId: row.id,
            type: LINK_TYPE.SATISFIES,
            createdBy: actor,
          },
        });
      }
      created.push(row);
    }

    await auditTx(tx, projectId, {
      action: 'SPLIT',
      entityType: 'requirement',
      entityId: original.id,
      textId: original.text_id,
      message: `Gereksinim bolundu: "${original.text_id}" -> ${created.map((r) => r.text_id).join(', ')}.`,
    });

    return { original, created };
  });
}

// ===========================================================================
//  MERGE — kardes gereksinimleri tek gereksinimde birlestirir.
// ===========================================================================
export async function mergeRequirements(prisma, projectId, ids, actor) {
  assertUuid('projectId', projectId);
  if (!Array.isArray(ids) || ids.length < 2) throw bad('Birlestirme icin en az 2 gereksinim id gerekli.');
  const uniqueIds = [...new Set(ids)];
  uniqueIds.forEach((id) => assertUuid('ids[]', id));
  if (uniqueIds.length < 2) throw bad('Birlestirme icin en az 2 FARKLI gereksinim gerekli.');

  return prisma.$transaction(async (tx) => {
    const rows = await tx.requirement.findMany({ where: { id: { in: uniqueIds }, projectId } });
    if (rows.length !== uniqueIds.length) throw bad('Gereksinimlerden biri veya birden fazlasi bulunamadi.', 404);
    if (rows.some((r) => r.locked)) throw bad('Onaylanmis/kilitli gereksinimler birlestirilemez.', 403);

    const firstType = rows[0].type;
    if (!rows.every((r) => r.type === firstType)) throw bad('Yalnizca AYNI tipte gereksinimler birlestirilebilir.');
    const firstParent = rows[0].parentId;
    if (!rows.every((r) => r.parentId === firstParent)) {
      throw bad('Yalnizca AYNI ust dugume bagli (kardes) gereksinimler birlestirilebilir.');
    }

    // Survivor: en eski (createdAt); esitlikte text_id ile deterministik.
    const sorted = [...rows].sort(
      (a, b) =>
        a.createdAt - b.createdAt || String(a.text_id).localeCompare(String(b.text_id), undefined, { numeric: true }),
    );
    const survivor = sorted[0];
    const absorbed = sorted.slice(1);
    const absorbedIds = absorbed.map((r) => r.id);

    // Cocuklari (PBS agacinda parentId ile bu gereksinimlere bagli olanlar) survivor'a al.
    await tx.requirement.updateMany({
      where: { projectId, parentId: { in: absorbedIds } },
      data: { parentId: survivor.id },
    });
    // Ayni sekilde bu cocuklarin Satisfies "ust" bagini da survivor'a tasi.
    await tx.traceabilityLink.updateMany({
      where: { projectId, type: LINK_TYPE.SATISFIES, fromId: { in: absorbedIds } },
      data: { fromId: survivor.id },
    });

    // absorbed'e gelen/giden diger tum baglari (Verifies, Assigned-To, ve
    // absorbed'i HEDEF alan Satisfies) survivor'a yeniden yonlendir.
    const relinkSide = async (field) => {
      const where = { projectId, [field]: { in: absorbedIds } };
      const links = await tx.traceabilityLink.findMany({ where });
      for (const link of links) {
        const newFromId = field === 'fromId' ? survivor.id : link.fromId;
        const newToId = field === 'toId' ? survivor.id : link.toId;
        if (newFromId === newToId) continue; // survivor kendine baglanmaz
        await tx.traceabilityLink.deleteMany({ where: { id: link.id } });
        await tx.traceabilityLink.createMany({
          data: [{ projectId, fromId: newFromId, toId: newToId, type: link.type, createdBy: actor }],
          skipDuplicates: true,
        });
      }
    };
    await relinkSide('fromId');
    await relinkSide('toId');

    await tx.requirement.deleteMany({ where: { id: { in: absorbedIds }, projectId } });

    await auditTx(tx, projectId, {
      action: 'MERGE',
      entityType: 'requirement',
      entityId: survivor.id,
      textId: survivor.text_id,
      message: `Birlestirme: ${absorbed.map((r) => r.text_id).join(', ')} -> "${survivor.text_id}" icine tasindi.`,
    });
    for (const r of absorbed) {
      await auditTx(tx, projectId, {
        action: 'DELETE',
        entityType: 'requirement',
        entityId: r.id,
        textId: r.text_id,
        message: `Birlestirme sonucu silindi: "${r.text_id}" -> "${survivor.text_id}".`,
      });
    }

    return tx.requirement.findUnique({ where: { id: survivor.id } });
  });
}
