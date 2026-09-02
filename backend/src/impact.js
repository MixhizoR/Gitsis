// ============================================================================
//  impact.js — Etki Analizi (Impact Analysis) backend tarafinda.
//  Recursive CTE ile PostgreSQL uzerinde etki agaci (Issue #46).
//  Guvenlik: projectId/reqId UUID formatinda olmali (SQL injection guard).
//  Döngü koruması: Recursive CTE'de depth limit (MAX_DEPTH=50) ile sonsuz
//  döngü engellenir (Issue #46 acceptance criteria: dongude sonsuz donguye
//  girmez).
// ============================================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DEPTH = 50;

function assertUuid(name, value) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`invalid ${name}: must be UUID`);
  }
}

/**
 * Bir gereksinim icin etki agacini Recursive CTE ile sorgular.
 * @param {string} projectId
 * @param {string} reqId
 * @returns {Promise<{root: object, parents: Array, tests: Array, summary: object}>}
 */
export async function getImpactTree(projectId, reqId) {
  assertUuid('projectId', projectId);
  assertUuid('reqId', reqId);

  const root = await prisma.requirement.findUnique({
    where: { id: reqId },
  });
  if (!root || root.projectId !== projectId) return null;
  // Recursive CTE: Satisfies ile UST zincir. depth kolonu ile cycle guard.
  // MAX_DEPTH asilmadan recursive adimlar sinirli; mutual Satisfies baglari
  // sonsuz donguye sokmaz.
  const upstreamIds = await prisma.$queryRaw`
    WITH RECURSIVE upstream AS (
      SELECT tl."fromId" AS req_id, 0 AS depth
      FROM "TraceabilityLink" tl
      WHERE tl."projectId" = ${projectId}::text
        AND tl.type = 'Satisfies'
        AND tl."toId" = ${reqId}::text
      UNION ALL
      SELECT tl."fromId", u.depth + 1
      FROM "TraceabilityLink" tl
      INNER JOIN upstream u ON tl."toId" = u.req_id
      WHERE tl."projectId" = ${projectId}::text
        AND tl.type = 'Satisfies'
        AND u.depth < ${MAX_DEPTH}
    )
    SELECT req_id FROM upstream;
  `;

  const parentIds = upstreamIds.map((r) => r.req_id).filter(Boolean);
  const parents =
    parentIds.length > 0 ? await prisma.requirement.findMany({ where: { projectId, id: { in: parentIds } } }) : [];

  // Verifies ile bagli testler — TraceabilityLink.toTestCase relation yok,
  // toId uzerinden ayri sorgu ile TestCase'leri cekiyoruz.
  const verifies = await prisma.traceabilityLink.findMany({
    where: { projectId, fromId: reqId, type: 'Verifies' },
    select: { toId: true },
  });
  const testIds = verifies.map((l) => l.toId).filter(Boolean);
  const tests = testIds.length > 0 ? await prisma.testCase.findMany({ where: { id: { in: testIds } } }) : [];

  return {
    root,
    parents: parents.map((r) => ({
      requirement: r,
      tests: [],
      documents: r.relatedDocuments || [],
    })),
    tests,
    summary: {
      testCount: tests.length,
      parentCount: parents.length,
      documentCount: (root.relatedDocuments || []).length,
    },
  };
}
