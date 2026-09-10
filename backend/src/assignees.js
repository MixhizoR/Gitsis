// ============================================================================
//  assignees.js  —  COKLU sorumlu personel atamasi (is atama).
//
//  DIKKAT: Sozlukteki "Assigned To" izlenebilirlik BAGI (terim <-> gereksinim)
//  ile ilgisi YOKTUR; burasi isin KIMDE oldugunu tutar.
//
//  Veri modeli
//  -----------
//  Tek dogruluk kaynagi RequirementAssignee / TestCaseAssignee ara
//  tablolaridir (bkz. prisma/schema.prisma). Sira ONEMLIDIR: atamalar
//  kullanicinin verdigi sirayla `order` alaninda saklanir, UI de bu sirayla
//  gosterir.
//
//  Requirement.assigneeId / TestCase.assigneeId kolonlari KORUNUR ve daima
//  listenin ILK elemanina esitlenir. Boylece:
//    - eski istemciler / raporlar / disa aktarimlar tek atamayi okumaya
//      devam eder,
//    - `@@index([projectId, assigneeId])` uzerinden kurulu sorgular calisir,
//    - bu surumden once girilmis atamalar veri kaybi olmadan tasinir
//      (bkz. backfillAssignees).
//
//  Istek govdesi iki sekli de kabul eder:
//    { assigneeIds: ['p1','p2'] }  -> coklu atama (yeni istemciler)
//    { assigneeId: 'p1' }          -> tek atama (eski istemciler)
//  Ikisi de gonderilmezse mevcut atama KORUNUR; bos gonderilirse
//  ([] / null / '') tum atamalar kaldirilir.
// ============================================================================

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Ara tablo adlari tek yerden: gereksinim ve test icin ayni mantik, farkli
// tablo/kolon adlari. `entity` = 'requirement' | 'testcase'.
const CONFIG = {
  requirement: {
    delegate: 'requirementAssignee',
    fk: 'requirementId',
    label: 'Gereksinim',
    auditEntityType: 'requirement',
  },
  testcase: {
    delegate: 'testCaseAssignee',
    fk: 'testCaseId',
    label: 'Test senaryosu',
    auditEntityType: 'testcase',
  },
};

const cfgOf = (entity) => {
  const c = CONFIG[entity];
  if (!c) throw new Error(`assignees: bilinmeyen varlik turu "${entity}"`);
  return c;
};

/**
 * Istek govdesinden atanacak personel id listesini cozer ve DOGRULAR.
 *
 * @returns {Promise<string[]|undefined>} `undefined` = alan gonderilmedi
 *   (mevcut atama korunur), `[]` = tum atamalari kaldir.
 */
export async function resolveAssigneeIds(prisma, pid, body) {
  const b = body || {};
  const hasMulti = b.assigneeIds !== undefined;
  const hasSingle = b.assigneeId !== undefined;
  if (!hasMulti && !hasSingle) return undefined;

  // Coklu alan gonderildiyse o kazanir; tek alan yalnizca eski istemciler icin.
  const raw = hasMulti ? b.assigneeIds : b.assigneeId;
  if (raw === null || raw === '' || raw === undefined) return [];

  const list = Array.isArray(raw) ? raw : [raw];
  // Tekrarlari at, sirayi koru (ilk gorulen kazanir).
  const ids = [...new Set(list.map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  // Proje sinirini asma korumasi: atama YALNIZCA ayni projenin UYELERINE
  // yapilabilir. Issue #97/A: Personnel kaldirildi — uyelik ProjectMember
  // uzerinden dogrulanir (tek sorgu, N+1 yok).
  const members = await prisma.projectMember.findMany({
    where: { projectId: pid, userId: { in: ids } },
    select: { userId: true },
  });
  if (members.length !== ids.length) {
    throw bad('Gecersiz atama: kullanici bu projenin uyesi degil.');
  }
  return ids;
}

/**
 * Bir kaydin atama listesini istenen hale getirir (ara tablo + legacy
 * assigneeId kolonu). Cagiran bir transaction (tx) gecebilir.
 *
 * @param {string} entity 'requirement' | 'testcase'
 * @param {string} rowId
 * @param {string[]} ids  sirali personel id listesi ([] = atamayi kaldir)
 * @returns {Promise<object>} guncel kayit (assigneeId yenilenmis haliyle)
 */
export async function setAssignees(tx, entity, rowId, ids) {
  const cfg = cfgOf(entity);
  await tx[cfg.delegate].deleteMany({ where: { [cfg.fk]: rowId } });
  if (ids.length > 0) {
    await tx[cfg.delegate].createMany({
      data: ids.map((userId, order) => ({ [cfg.fk]: rowId, userId, order })),
      skipDuplicates: true,
    });
  }
  // Legacy tek-atama kolonu daima listenin ILK elemanini yansitir.
  const delegate = entity === 'requirement' ? 'requirement' : 'testCase';
  return tx[delegate].update({ where: { id: rowId }, data: { assigneeId: ids[0] ?? null } });
}

/** Bir kaydin atanan personel id'leri, atama SIRASIYLA. */
export async function getAssigneeIds(prisma, entity, rowId) {
  const cfg = cfgOf(entity);
  const rows = await prisma[cfg.delegate].findMany({
    where: { [cfg.fk]: rowId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/**
 * Cok sayida kayit icin atama listelerini TEK sorguda cikarir (N+1 yok).
 * @returns {Promise<Map<string, string[]>>} rowId -> sirali personel id'leri
 */
export async function getAssigneeIdsMap(prisma, entity, rowIds) {
  const cfg = cfgOf(entity);
  const map = new Map(rowIds.map((id) => [id, []]));
  if (rowIds.length === 0) return map;
  const rows = await prisma[cfg.delegate].findMany({
    where: { [cfg.fk]: { in: rowIds } },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { [cfg.fk]: true, userId: true },
  });
  for (const r of rows) {
    const bucket = map.get(r[cfg.fk]);
    if (bucket) bucket.push(r.userId);
  }
  return map;
}

/**
 * API yanitina `assigneeIds` ekler. `assigneeId` yanittan KALDIRILMAZ —
 * eski istemciler icin listenin ILK elemani olarak yeniden turetilir
 * (kolonun kendisi degil ara tablo dogruluk kaynagidir).
 */
export function withAssigneeIds(row, ids) {
  if (!row) return row;
  const list = ids || [];
  return { ...row, assigneeIds: list, assigneeId: list[0] ?? null };
}

/** Bir listenin tamamini tek sorguda zenginlestirir. */
export async function withAssigneeIdsAll(prisma, entity, rows) {
  const map = await getAssigneeIdsMap(
    prisma,
    entity,
    rows.map((r) => r.id),
  );
  return rows.map((r) => withAssigneeIds(r, map.get(r.id)));
}

/** Audit mesajlari icin okunabilir adlar; silinmis kullanici listeye girmez. */
async function labelsOf(prisma, ids) {
  if (!ids || ids.length === 0) return [];
  const people = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const byId = new Map(people.map((p) => [p.id, (p.name || '').trim() || p.id]));
  return ids.map((id) => byId.get(id) || 'silinmis kullanici');
}

/**
 * Atama DEGISTIYSE ayri bir ASSIGN audit kaydi yazar (guncelleme kaydindan
 * bagimsiz): "kim neyi kime verdi" sorusu tek bir action ile filtrelenebilsin.
 * Sira degisimi de degisiklik sayilir (gosterim sirasi anlamlidir).
 */
export async function auditAssignment(prisma, audit, pid, { entity, row, before, after, actor }) {
  const cfg = cfgOf(entity);
  const b = before || [];
  const a = after || [];
  if (b.length === a.length && b.every((id, i) => id === a[i])) return;

  const [fromNames, toNames] = await Promise.all([labelsOf(prisma, b), labelsOf(prisma, a)]);
  const fromText = fromNames.join(', ');
  const toText = toNames.join(', ');
  let message;
  if (b.length === 0) message = `${cfg.label} atandi: "${row.title}" -> ${toText}.`;
  else if (a.length === 0) message = `${cfg.label} atamasi kaldirildi: "${row.title}" (onceki: ${fromText}).`;
  else message = `${cfg.label} atamasi degisti: "${row.title}": ${fromText} -> ${toText}.`;

  await audit(pid, {
    action: 'ASSIGN',
    entityType: cfg.auditEntityType,
    entityId: row.id,
    textId: row.text_id,
    actor,
    message,
  });
}

/**
 * Tek seferlik gecis: bu surumden ONCE girilmis tek atamalari (assigneeId)
 * ara tabloya tasir. Idempotenttir — zaten satiri olan kayitlara dokunmaz,
 * her acilista guvenle calistirilabilir.
 * @returns {Promise<{requirements:number, testCases:number}>} eklenen satirlar
 */
export async function backfillAssignees(prisma) {
  const counts = { requirements: 0, testCases: 0 };
  for (const [entity, delegate] of [
    ['requirement', 'requirement'],
    ['testcase', 'testCase'],
  ]) {
    const cfg = cfgOf(entity);
    const rows = await prisma[delegate].findMany({
      where: { assigneeId: { not: null }, assignees: { none: {} } },
      select: { id: true, assigneeId: true },
    });
    if (rows.length === 0) continue;
    const res = await prisma[cfg.delegate].createMany({
      data: rows.map((r) => ({ [cfg.fk]: r.id, userId: r.assigneeId, order: 0 })),
      skipDuplicates: true,
    });
    counts[entity === 'requirement' ? 'requirements' : 'testCases'] = res.count;
  }
  return counts;
}

/**
 * Personel silindikten SONRA legacy `assigneeId` kolonunu tazeler.
 *
 * Ara tablo satiri Cascade ile silinir, ama kolonun FK'si SetNull oldugu icin
 * coklu atamada SIRADAKI kisi otomatik yerine gecmez (kolon null'a duser).
 * Burada kolon yeniden listenin ILK elemanina esitlenir. Atamasi kalmayan
 * kayitlara DOKUNULMAZ (onlari SetNull zaten null yapmistir).
 */
export async function resyncLegacyAssignee(prisma, projectId) {
  await prisma.$executeRaw`
    UPDATE "Requirement" r
       SET "assigneeId" = sub."userId"
      FROM (
        SELECT DISTINCT ON ("requirementId") "requirementId", "userId"
          FROM "RequirementAssignee"
         ORDER BY "requirementId", "order" ASC, "createdAt" ASC
      ) sub
     WHERE r.id = sub."requirementId"
       AND r."projectId" = ${projectId}::text
       AND r."assigneeId" IS DISTINCT FROM sub."userId";
  `;
  await prisma.$executeRaw`
    UPDATE "TestCase" t
       SET "assigneeId" = sub."userId"
      FROM (
        SELECT DISTINCT ON ("testCaseId") "testCaseId", "userId"
          FROM "TestCaseAssignee"
         ORDER BY "testCaseId", "order" ASC, "createdAt" ASC
      ) sub
     WHERE t.id = sub."testCaseId"
       AND t."projectId" = ${projectId}::text
       AND t."assigneeId" IS DISTINCT FROM sub."userId";
  `;
}
