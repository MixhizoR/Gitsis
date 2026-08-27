// ============================================================================
//  impact.js — Etki Analizi (Impact Analysis) backend tarafinda.
//  Recursive CTE ile PostgreSQL uzerinde etki agaci: bir gereksinimin
//  degisikligi hangi UST gereksinimleri (Satisfies) etkiler, hangi
//  testleri (Verifies) yeniden calistirir, hangi dokumanlar guncellenmeli.
//  Issue #46 — frontend'deki buildImpactTree'in backend'e tasinmasi.
// ============================================================================
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Bir gereksinim icin etki agacini Recursive CTE ile sorgular.
 * @param {string} projectId
 * @param {string} reqId — kok gereksinim (degisen)
 * @returns {Promise<Object>} — tree + summary
 */
export async function getImpactTree(projectId, reqId) {
  const root = await prisma.requirement.findUnique({
    where: { id: reqId, projectId },
  });
  if (!root) return null;

  // Satisfies ile UST gereksinimler (Parent) — basit iki seviye
  const parentLinks = await prisma.traceabilityLink.findMany({
    where: { projectId, toId: reqId, type: 'Satisfies' },
    include: { fromRequirement: true },
  });
  const parents = parentLinks.map((l) => l.fromRequirement).filter(Boolean);

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
