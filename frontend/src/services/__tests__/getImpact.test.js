// ============================================================================
//  getImpact.test.js — Frontend dataService helper regresyon (Issue #46 / #69).
//  Onceki dataService.test.js yalniz getImpact kapsiyordu; burada:
//    1. getImpact: dogru URL + reqId
//    2. dataService: bilinen CRUD helper'lari dogru HTTP verb'i kullaniyor mu?
//
//  apiClient mock'ludur; gercek HTTP yok.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../apiClient.js', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

import * as api from '../apiClient.js'
import {
  listProjects,
  createProject,
  listRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  listTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  listGlossary,
  createGlossary,
  updateGlossary,
  deleteGlossary,
  listRoles,
  createRole,
  listPersonnel,
  voteApproval,
  unlockApproval,
  listAudit,
  recompute,
  getImpact,
  listSnapshots,
  createSnapshot,
  deleteSnapshot,
} from '../dataService.js'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ items: [] })
  api.post.mockResolvedValue({ id: 'new' })
  api.put.mockResolvedValue({ id: 'updated' })
  api.patch.mockResolvedValue({ id: 'patched' })
  api.del.mockResolvedValue({ ok: true })
})

describe('getImpact (Issue #46)', () => {
  it('dogru URL + reqId ile backend etki agacini ceker', async () => {
    const pid = 'p-1'
    const reqId = 'r-99'
    await getImpact(pid, reqId)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith(`/projects/${pid}/impact`, { reqId })
  })
})

describe('dataService CRUD helperlari', () => {
  it('listProjects GET /projects', async () => {
    await listProjects()
    expect(api.get).toHaveBeenCalledWith('/projects')
  })

  it('createProject POST /projects', async () => {
    await createProject('P1', 'desc')
    expect(api.post).toHaveBeenCalledWith('/projects', { name: 'P1', description: 'desc' })
  })

  it('listRequirements GET /projects/:pid/requirements', async () => {
    await listRequirements('p-1')
    expect(api.get).toHaveBeenCalledWith('/projects/p-1/requirements')
  })

  it('createRequirement POST /projects/:pid/requirements', async () => {
    await createRequirement('p-1', { title: 'X' })
    expect(api.post).toHaveBeenCalledWith('/projects/p-1/requirements', { title: 'X' })
  })

  it('updateRequirement PUT /projects/:pid/requirements/:id', async () => {
    await updateRequirement('p-1', 'r-1', { title: 'Y' })
    expect(api.put).toHaveBeenCalledWith('/projects/p-1/requirements/r-1', { title: 'Y' })
  })

  it('deleteRequirement DELETE /projects/:pid/requirements/:id', async () => {
    await deleteRequirement('p-1', 'r-1')
    expect(api.del).toHaveBeenCalledWith('/projects/p-1/requirements/r-1')
  })

  it('listTestCases GET /projects/:pid/testcases', async () => {
    await listTestCases('p-1')
    expect(api.get).toHaveBeenCalledWith('/projects/p-1/testcases')
  })

  it('createTestCase POST /projects/:pid/testcases', async () => {
    await createTestCase('p-1', { title: 'TC' })
    expect(api.post).toHaveBeenCalledWith('/projects/p-1/testcases', { title: 'TC' })
  })

  it('updateTestCase PUT /projects/:pid/testcases/:id', async () => {
    await updateTestCase('p-1', 't-1', { title: 'T2' })
    expect(api.put).toHaveBeenCalledWith('/projects/p-1/testcases/t-1', { title: 'T2' })
  })

  it('deleteTestCase DELETE /projects/:pid/testcases/:id', async () => {
    await deleteTestCase('p-1', 't-1')
    expect(api.del).toHaveBeenCalledWith('/projects/p-1/testcases/t-1')
  })

  it('listGlossary GET /projects/:pid/glossary', async () => {
    await listGlossary('p-1')
    expect(api.get).toHaveBeenCalledWith('/projects/p-1/glossary')
  })

  it('createGlossary POST /projects/:pid/glossary', async () => {
    await createGlossary('p-1', { term: 'T' })
    expect(api.post).toHaveBeenCalledWith('/projects/p-1/glossary', { term: 'T' })
  })

  it('updateGlossary PUT /projects/:pid/glossary/:id', async () => {
    await updateGlossary('p-1', 'g-1', { term: 'T2' })
    expect(api.put).toHaveBeenCalledWith('/projects/p-1/glossary/g-1', { term: 'T2' })
  })

  it('deleteGlossary DELETE /projects/:pid/glossary/:id', async () => {
    await deleteGlossary('p-1', 'g-1')
    expect(api.del).toHaveBeenCalledWith('/projects/p-1/glossary/g-1')
  })

  it('listRoles GET /projects/:pid/roles', async () => {
    await listRoles('p-1')
    expect(api.get).toHaveBeenCalledWith('/projects/p-1/roles')
  })

  it('createRole POST /projects/:pid/roles', async () => {
    await createRole('p-1', { name: 'R' })
    expect(api.post).toHaveBeenCalledWith('/projects/p-1/roles', { name: 'R' })
  })

  it('listPersonnel GET /projects/:pid/personnel', async () => {
    await listPersonnel('p-1')
    expect(api.get).toHaveBeenCalledWith('/projects/p-1/personnel')
  })

  it('voteApproval POST /projects/:pid/approvals/vote', async () => {
    await voteApproval('p-1', { entityType: 'requirement', entityId: 'r-1' })
    expect(api.post).toHaveBeenCalledWith('/projects/p-1/approvals/vote', {
      entityType: 'requirement',
      entityId: 'r-1',
    })
  })

  it('unlockApproval POST /projects/:pid/approvals/unlock', async () => {
    await unlockApproval('p-1', { entityType: 'requirement', entityId: 'r-1' })
    expect(api.post).toHaveBeenCalledWith('/projects/p-1/approvals/unlock', {
      entityType: 'requirement',
      entityId: 'r-1',
    })
  })

  it('listAudit GET /projects/:pid/audit', async () => {
    await listAudit('p-1')
    expect(api.get).toHaveBeenCalledWith('/projects/p-1/audit')
  })

  it('recompute POST /projects/:pid/recompute', async () => {
    await recompute('p-1')
    expect(api.post).toHaveBeenCalledWith('/projects/p-1/recompute')
  })

  it('listSnapshots GET /projects/:pid/snapshots', async () => {
    await listSnapshots('p-1')
    expect(api.get).toHaveBeenCalledWith('/projects/p-1/snapshots')
  })

  it('createSnapshot POST /projects/:pid/snapshots (name ile)', async () => {
    await createSnapshot('p-1', 'v1')
    expect(api.post).toHaveBeenCalledWith('/projects/p-1/snapshots', { name: 'v1' })
  })

  it('deleteSnapshot DELETE /projects/:pid/snapshots/:sid', async () => {
    await deleteSnapshot('p-1', 's-1')
    expect(api.del).toHaveBeenCalledWith('/projects/p-1/snapshots/s-1')
  })
})
