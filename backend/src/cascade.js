// ============================================================================
//  cascade.js  —  Issue #15: Toplu (bulk) durum ve onay yeniden hesabi.
//  N+1 yerine sabit sayida sorgu: durum icin 1 okuma + <=3 updateMany + 1 audit;
//  onay icin 1 user okuma + 12 parametrik bulk UPDATE (6 bilesen x 2).
//  Sadece degeri DEGISEN satirlar yazilir ("sadece etkilenenler").
//  Issue #97: Onay havuzu tamamen USER tabanlidir — Personnel/Role kalkti.
//  Gerekli oy verenler = PM'ler + projeye atanmis (User.projectId) ve o
//  bilesen icin approve izni olan kullanicilar (roleKey -> SystemRole).
// ============================================================================
import { Prisma } from '@prisma/client';
import { REQ_TYPE, TEST_TYPE, PM_ROLE } from './constants.js';

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
//  ONAY (consensus): approvalStatus/locked <- PM + yetkili uye oylari
//  Gerekli oy verenler = PM'ler + projede approve izni olan atanmis uyeler.
//  Hepsi oy verdiyse Approved+locked; degilse Pending+unlocked.
// ===========================================================================
/**
 * Issue #103: Oy veren havuzu = PM'ler + projenin AKTIF uyeleri.
 *  - PM'ler (isPMRole) her bilesen icin GEREKLI oy verendir (PM oyu sart).
 *  - ProjectMember uzerinden projenin uyeleri arasinda approve izni olanlar
 *    (roleKey -> SystemRole) GEREKLI oy verendir.
 *  - Projeden cikarilan uye havuzdan otomatik düşer (kayit silindigi icin);
 *    eski Approval kayitlari ise kalir (gecmis — matrix 'departed' gösterir).
 * @returns {Promise<Array<{id,name,roleName}>>} gerekli oy verenler
 */
export async function getRequiredVoters(prisma, pid, componentKey) {
  // Issue #103: PM'ler ProjectMember kaydi TUTMAZ (Karar #1) — bu yuzden havuz
  // PM kullanicilarini AYRI sorguyla toplar: her bahanede "PM oyu sart" (spec 4.3).
  // 3 sorgu (N+1 yok): uyeler(+user) + tum sistem rolleri + PM kullanicilari.
  // PM tespiti token 'pm' roleKey'i veya eski verilerde serbest-metin PM_ROLE.
  const [members, roles, pmUsers] = await Promise.all([
    prisma.projectMember.findMany({ where: { projectId: pid }, include: { user: true } }),
    prisma.systemRole.findMany({ where: { isActive: true } }),
    prisma.user.findMany({
      where: { isActive: true, OR: [{ roleKey: 'pm' }, { role: PM_ROLE }] },
      select: { id: true, name: true, roleKey: true, role: true, isActive: true },
    }),
  ]);
  const roleByKey = new Map(roles.map((r) => [r.key, r]));
  const voters = [];
  const push = (v) => {
    if (!voters.some((x) => x.id === v.id)) voters.push(v);
  };
  // 1) PM'ler — zaten her projeye erisirler; uyelik kaydindan bagimsiz.
  for (const u of pmUsers) {
    push({ id: u.id, name: u.name, roleName: u.roleKey || u.role });
  }
  // 2) ProjectMember uyeleri: PM'ler (kaydi varsa yinelenmez) + approve izinliler.
  for (const m of members) {
    const u = m.user;
    if (!u || !u.isActive) continue;
    const isPM = u.roleKey === 'pm' || u.role === PM_ROLE;
    if (isPM) {
      push({ id: u.id, name: u.name, roleName: u.roleKey || u.role });
      continue;
    }
    // roleKey yoksa (eski veri) izin cozumlemesi yapilamaz -> oy havuzuna giremez.
    if (!u.roleKey) continue;
    const sr = roleByKey.get(u.roleKey);
    if (!sr) continue;
    const perm = (sr.permissions || {}).approve || {};
    if (perm.enabled && Array.isArray(perm.components) && perm.components.includes(componentKey)) {
      voters.push({ id: u.id, name: u.name, roleName: sr.name });
    }
  }
  return voters;
}

export async function recomputeApprovalsBulk(prisma, pid) {
  // Oy veren havuzu projede TEK SEFERDE bilesen basina okunur (eskisi N kez okuyordu).
  for (const comp of COMPONENT_TYPES) {
    const voters = await getRequiredVoters(prisma, pid, comp.key);
    const voterIds = voters.map((v) => v.id);
    const table = Prisma.raw(`"${comp.model}"`);
    // Oy veren havuzu bos olabilir (proje uyesi yok) -> hicbir kayit Approved olamaz.
    if (voterIds.length === 0) continue;
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
            AND a."voterId" = ANY(${voterIds}::text[])
          GROUP BY a."entityId"
          HAVING COUNT(DISTINCT a."voterId") = ${voterIds.length}
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
            AND a."voterId" = ANY(${voterIds}::text[])
          GROUP BY a."entityId"
          HAVING COUNT(DISTINCT a."voterId") = ${voterIds.length}
        )`;
  }
}
