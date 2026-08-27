// ============================================================================
//  impact.js — Etki Analizi (Impact Analysis) backend tarafinda.
//  Recursive CTE ile PostgreSQL uzerinde etki agaci (Issue #46).
// ============================================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Bir gereksinim icin etki agacini Recursive CTE ile sorgular.
 * @param {string} projectId
 * @param {string} reqId
 * @returns {Promise<{root: object, parents: Array, tests: Array, summary: object}>}
 */
export async function getImpactTree(projectId, reqId) {
  const root = await prisma.requirement.findUnique({
    where: { id: reqId, projectId },
  });
  if (!root) return null;

  // Recursive CTE: Satisfies baglari uzerinden UST gereksinimlere cik (upstream)
  const upstreamIds = await prisma.$queryRawUnsafe(`
    WITH RECURSIVE upstream AS (
      SELECT tl."fromId" AS req_id, 1 AS depth
      FROM "TraceabilityLink" tl
      WHERE tl."projectId" = '${projectId}'
        AND tl.type = 'Satisfies'
        AND tl."toId" = '${reqId}'
      UNION ALL
      SELECT tl."fromId", u.depth + 1
      FROM "TraceabilityLink" tl
      INNER JOIN upstream u ON tl."toId" = u.req_id
      WHERE tl."projectId" = '${projectId}'
        AND tl.type = 'Satisfies'
    )
    SELECT req_id FROM upstream WHERE depth <= 5;
  `);

  const parentIds = upstreamIds.map((r) => r.req_id).filter(Boolean);
  const parents =
    parentIds.length > 0 ? await prisma.requirement.findMany({ where: { projectId, id: { in: parentIds } } }) : [];

  // Verifies ile bagli testler
  const verifies = await prisma.traceabilityLink.findMany({
    where: { projectId, fromId: reqId, type: 'Verifies' },
    include: { toTestCase: true },
  });
  const tests = verifies.map((l) => l.toTestCase).filter(Boolean);

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
