// ============================================================================
//  cascade.js  —  Issue #15: Toplu (bulk) durum ve onay yeniden hesabi.
//  N+1 yerine sabit sayida sorgu: durum icin 1 okuma + <=3 updateMany + 1 audit;
//  onay icin 1 personnel okuma + 12 parametrik bulk UPDATE (6 bilesen x 2).
//  Sadece degeri DEGISEN satirlar yazilir ("sadece etkilenenler").
// ============================================================================
import { Prisma } from '@prisma/client';
import { REQ_TYPE, TEST_TYPE } from './constants.js';

// --- Bilesen -> varlik tip eslemesi (server.js'teki componentKeyOf ile ayni)
const COMPONENT_TYPES = [
  { key: 'req-user', entityType: 'requirement', model: 'Requirement', types: [REQ_TYPE.USER] },
  { key: 'req-system', entityType: 'requirement', model: 'Requirement', types: [REQ_TYPE.SYSTEM] },
  {
    key: 'req-subsystem',
    entityType: 'requirement',
    model: 'Requirement',
    types: [REQ_TYPE.SOFTWARE, REQ_TYPE.HARDWARE],
  },
  {
    key: 'test-acceptance',
    entityType: 'testcase',
    model: 'TestCase',
    types: [TEST_TYPE.ACCEPTANCE],
  },
  { key: 'test-system', entityType: 'testcase', model: 'TestCase', types: [TEST_TYPE.SYSTEM] },
  { key: 'test-subsystem', entityType: 'testcase', model: 'TestCase', types: [TEST_TYPE.SUBSYSTEM] },
];

// ===========================================================================
//  DURUM (cascade): gereksinim durumu <- bagli testlerin sonuclari
//    bagli test yok              -> 'In Review'
//    en az bir test 'Rejected'   -> 'Rejected'
//    tum testler 'Approved'      -> 'Approved'
//    aksi                        -> 'In Review'
// ===========================================================================

/**
 * Sadece durumu degisecek gereksinimleri tek SQL'de hesaplar.
 * @returns {Promise<{id,text_id,from,to}[]>}
 */
async function computeStatusChanges(prisma, pid) {
  const rows = await prisma.$queryRaw`
    WITH link_agg AS (
      SELECT l."fromId" AS id,
             COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE t."status" = 'Rejected')::int AS rejected,
             COUNT(*) FILTER (WHERE t."status" = 'Approved')::int AS approved
      FROM "TraceabilityLink" l
      JOIN "TestCase" t
        ON t."id" = l."toId" AND t."projectId" = l."projectId"
      WHERE l."projectId" = ${pid} AND l."type" = 'Verifies'
      GROUP BY l."fromId"
    ),
    linked AS (
      SELECT r."id" AS id,
             r."text_id" AS text_id,
             r."status" AS "from",
             CASE
               WHEN la.rejected > 0 THEN 'Rejected'
               WHEN la.approved = la.cnt THEN 'Approved'
               ELSE 'In Review'
             END AS "to"
      FROM "Requirement" r
      JOIN link_agg la ON la.id = r."id"
      WHERE r."projectId" = ${pid}
    ),
    unlinked AS (
      SELECT r."id" AS id,
             r."text_id" AS text_id,
             r."status" AS "from",
             'In Review' AS "to"
      FROM "Requirement" r
      WHERE r."projectId" = ${pid}
        AND r."status" <> 'In Review'
        AND NOT EXISTS (
          SELECT 1 FROM "TraceabilityLink" l
          WHERE l."projectId" = ${pid} AND l."type" = 'Verifies' AND l."fromId" = r."id"
        )
    )
    SELECT id, text_id, "from", "to" FROM linked WHERE "from" IS DISTINCT FROM "to"
    UNION ALL
    SELECT id, text_id, "from", "to" FROM unlinked`;
  return rows.map((r) => ({ id: r.id, text_id: r.text_id, from: r.from, to: r.to }));
}

/**
 * Degisiklikleri hedef duruma gore gruplayarak toplu yazar + toplu audit.
 */
async function applyStatusChanges(prisma, pid, changes) {
  if (changes.length === 0) return;
  const byTarget = new Map();
  for (const c of changes) {
    if (!byTarget.has(c.to)) byTarget.set(c.to, []);
    byTarget.get(c.to).push(c.id);
  }
  await prisma.$transaction([
    ...[...byTarget.entries()].map(([status, ids]) =>
      prisma.requirement.updateMany({
        where: { projectId: pid, id: { in: ids } },
        data: { status },
      }),
    ),
    prisma.auditLog.createMany({
      data: changes.map((c) => ({
        projectId: pid,
        action: 'AUTO_STATUS',
        entityType: 'requirement',
        entityId: c.id,
        textId: c.text_id,
        field: 'status',
        oldValue: c.from,
        newValue: c.to,
        message: `Durum otomatik guncellendi: ${c.from} -> ${c.to}.`,
      })),
    }),
  ]);
}

/**
 * Bir projedeki tum gereksinim durumlarini TOPLU yeniden hesaplar.
 * Donus: degisen gereksinim sayisi (eski cascade() ile ayni sozlesme).
 */
export async function recomputeStatusesBulk(prisma, pid) {
  const changes = await computeStatusChanges(prisma, pid);
  await applyStatusChanges(prisma, pid, changes);
  return changes.length;
}

// ===========================================================================
//  ONAY (consensus): approvalStatus/locked <- PM + yetkili personel oylari
//  Gerekli oy verenler = PM + rolunde bu bilesen icin approve izni olanlar.
//  Hepsi oy verdiyse Approved+locked; degilse Pending+unlocked.
// ===========================================================================

/**
 * Her bilesen icin gerekli oy veren id listesi (PM her zaman dahil).
 */
function requiredVotersFor(personnel, componentKey) {
  const voters = ['PM'];
  for (const p of personnel) {
    const perm = p.role?.permissions?.approve;
    if (perm && perm.enabled && Array.isArray(perm.components) && perm.components.includes(componentKey)) {
      voters.push(p.id);
    }
  }
  return voters;
}

export async function recomputeApprovalsBulk(prisma, pid) {
  // Oy veren havuzu projede TEK SEFERDE okunur (eskisi N kez okuyordu).
  const personnel = await prisma.personnel.findMany({
    where: { projectId: pid },
    include: { role: true },
  });

  for (const comp of COMPONENT_TYPES) {
    const voters = requiredVotersFor(personnel, comp.key);
    const table = Prisma.raw(`"${comp.model}"`);
    // Eksik oyu olanlar -> Pending (sadece su an farkli olanlara yazar)
    await prisma.$executeRaw`
      UPDATE ${table}
      SET "approvalStatus" = 'Pending', "locked" = false, "updatedAt" = now()
      WHERE "projectId" = ${pid}
        AND "type" = ANY(${comp.types}::text[])
        AND ("approvalStatus" IS DISTINCT FROM 'Pending' OR "locked" IS DISTINCT FROM false)
        AND "id" NOT IN (
          SELECT a."entityId" FROM "Approval" a
          WHERE a."projectId" = ${pid}
            AND a."entityType" = ${comp.entityType}
            AND a."voterId" = ANY(${voters}::text[])
          GROUP BY a."entityId"
          HAVING COUNT(DISTINCT a."voterId") = ${voters.length}
        )`;
    // Tum gerekli oylar tamamlanmis olanlar -> Approved+locked
    await prisma.$executeRaw`
      UPDATE ${table}
      SET "approvalStatus" = 'Approved', "locked" = true, "updatedAt" = now()
      WHERE "projectId" = ${pid}
        AND "type" = ANY(${comp.types}::text[])
        AND ("approvalStatus" IS DISTINCT FROM 'Approved' OR "locked" IS DISTINCT FROM true)
        AND "id" IN (
          SELECT a."entityId" FROM "Approval" a
          WHERE a."projectId" = ${pid}
            AND a."entityType" = ${comp.entityType}
            AND a."voterId" = ANY(${voters}::text[])
          GROUP BY a."entityId"
          HAVING COUNT(DISTINCT a."voterId") = ${voters.length}
        )`;
  }
}
