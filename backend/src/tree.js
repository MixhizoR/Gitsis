// ============================================================================
//  tree.js — PBS (Urun Agaci) hiyerarsisi: lazy-load cocuk sorgusu + Recursive
//  CTE ile ust-zincir (ancestor path). Issue #9 / Adim 2.
//  Kaynak: Requirement.parentId (adjacency list, Issue #9 / Adim 1'de eklendi).
//  Guvenlik: impact.js ile ayni desen — projectId/reqId UUID formatinda olmali
//  (SQL injection guard), Recursive CTE'de depth limit (MAX_DEPTH) ile sonsuz
//  dongu engellenir.
// ============================================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_DEPTH = 50;

export function assertUuid(name, value) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`invalid ${name}: must be UUID`);
  }
}

/**
 * Bir dugumun DOGRUDAN cocuklarini dondurur (lazy-load — tum agac degil).
 * parentId=null ise kok dugumleri (User Requirement'lar) dondurur.
 * @param {string} projectId
 * @param {string|null} parentId
 * @returns {Promise<Array<{id, text_id, title, type, status, attributes, assigneeIds, hasChildren}>>}
 */
export async function getTreeChildren(projectId, parentId, clearanceLevel) {
  assertUuid('projectId', projectId);
  if (parentId != null) assertUuid('parentId', parentId);

  // ABAC (#87): kullanici yalnizca kendi clearance seviyesine esit veya ondan
  // dusuk cocuklari gorur. clearanceLevel token'da yoksa (guvenli varsayilan)
  // en dusuk seviye (1) kabul edilir — aksi halde gereksinimlerle ayni kural.
  const cl = clearanceLevel ?? 1;

  // hasChildren: ayri N+1 sorgusuna dusmemek icin EXISTS alt sorgusu tek
  // sorguda cozulur (child'larin kendi cocuklari var mi). parentId=null
  // (kok) ve parentId=<uuid> durumlari ayri sorgular olarak yazilir —
  // $queryRaw fragment kompozisyonu yerine (Prisma.sql gerektirir) net ve
  // guvenli iki ayri parametrize sorgu tercih edildi.
  const rows =
    parentId === null
      ? await prisma.$queryRaw`
          SELECT r.id, r.text_id, r.title, r.description, r.type, r.field, r.status, r.attributes, r.locked, r."approvalStatus", r."createdAt", r."parentId", r."clearanceLevel",
                 r."sourceDocumentId", r."sourceDocumentName", r."sourceStart", r."sourceEnd", r."sourceQuote", r."assigneeId",
                 COALESCE((
                   SELECT array_agg(ra."userId" ORDER BY ra."order" ASC, ra."createdAt" ASC)
                   FROM "RequirementAssignee" ra WHERE ra."requirementId" = r.id
                 ), ARRAY[]::text[]) AS "assigneeIds",
                 EXISTS (
                   SELECT 1 FROM "Requirement" gc
                   WHERE gc."projectId" = ${projectId}::text AND gc."parentId" = r.id
                 ) AS "hasChildren"
          FROM "Requirement" r
          WHERE r."projectId" = ${projectId}::text AND r."parentId" IS NULL
            AND r."clearanceLevel" <= ${cl}::int
          ORDER BY r.text_id ASC;
        `
      : await prisma.$queryRaw`
          SELECT r.id, r.text_id, r.title, r.description, r.type, r.field, r.status, r.attributes, r.locked, r."approvalStatus", r."createdAt", r."parentId", r."clearanceLevel",
                 r."sourceDocumentId", r."sourceDocumentName", r."sourceStart", r."sourceEnd", r."sourceQuote", r."assigneeId",
                 COALESCE((
                   SELECT array_agg(ra."userId" ORDER BY ra."order" ASC, ra."createdAt" ASC)
                   FROM "RequirementAssignee" ra WHERE ra."requirementId" = r.id
                 ), ARRAY[]::text[]) AS "assigneeIds",
                 EXISTS (
                   SELECT 1 FROM "Requirement" gc
                   WHERE gc."projectId" = ${projectId}::text AND gc."parentId" = r.id
                 ) AS "hasChildren"
          FROM "Requirement" r
          WHERE r."projectId" = ${projectId}::text AND r."parentId" = ${parentId}::text
            AND r."clearanceLevel" <= ${cl}::int
          ORDER BY r.text_id ASC;
        `;
  return rows;
}

/**
 * Bir dugumun KOKE kadar olan ust zincirini (breadcrumb) Recursive CTE ile
 * dondurur. Sonuc kokten hedefe siralidir (depth azalan -> ilk eleman kok).
 * @param {string} projectId
 * @param {string} reqId
 * @returns {Promise<Array<{id, text_id, title, type, depth}>|null>} null: bulunamadi
 */
export async function getTreeAncestorPath(projectId, reqId, clearanceLevel) {
  assertUuid('projectId', projectId);
  assertUuid('reqId', reqId);
  // ABAC (#87): breadcrumb yalnizca kullanicinin gorebildigi seviyeleri icerir.
  const cl = clearanceLevel ?? 1;

  const root = await prisma.requirement.findUnique({ where: { id: reqId, projectId } });
  if (!root) return null;

  const rows = await prisma.$queryRaw`
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId", text_id, title, type, "clearanceLevel", 0 AS depth
      FROM "Requirement"
      WHERE id = ${reqId}::text AND "projectId" = ${projectId}::text
        AND "clearanceLevel" <= ${cl}::int
      UNION ALL
      SELECT r.id, r."parentId", r.text_id, r.title, r.type, r."clearanceLevel", a.depth + 1
      FROM "Requirement" r
      INNER JOIN ancestors a ON r.id = a."parentId"
      WHERE r."projectId" = ${projectId}::text
        AND r."clearanceLevel" <= ${cl}::int
        AND a.depth < ${MAX_DEPTH}
    )
    SELECT id, text_id, title, type, depth FROM ancestors ORDER BY depth DESC;
  `;
  return rows;
}
