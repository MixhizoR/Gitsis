// ============================================================================
//  dataService.js  —  Proje-bazli (project-isolated) veri servisi.
//  UI/context bu imzalari cagirir; HTTP detaylari apiClient icinde gizlidir.
//  Backend cascade durum hesabini KENDISI yapar; mutasyon sonrasi yalnizca
//  ilgili koleksiyonlari yeniden cekmek (refresh) yeterlidir.
// ============================================================================
import * as api from './apiClient.js'

// --- Projeler ---------------------------------------------------------------
export const listProjects = () => api.get('/projects')
export const createProject = (name, description) => api.post('/projects', { name, description })
export const getProject = (pid) => api.get(`/projects/${pid}`)
export const updateProject = (pid, data) => api.patch(`/projects/${pid}`, data)
export const deleteProject = (pid) => api.del(`/projects/${pid}`)

// --- Dinamik Alanlar (Field / Disiplin) ------------------------------------
export const listFields = (pid) => api.get(`/projects/${pid}/fields`)
export const addField = (pid, name) => api.post(`/projects/${pid}/fields`, { name })
export const deleteField = (pid, id) => api.del(`/projects/${pid}/fields/${id}`)

// --- Modular Oznitelikler (Priority / DAL Level / ozel alanlar) ------------
//  entityType: 'requirement' | 'testcase' | 'both'
export const listAttributes = (pid, entityType) =>
  api.get(`/projects/${pid}/attributes${entityType ? `?entityType=${entityType}` : ''}`)
export const createAttribute = (pid, payload) => api.post(`/projects/${pid}/attributes`, payload)
export const updateAttribute = (pid, id, payload) =>
  api.patch(`/projects/${pid}/attributes/${id}`, payload)
export const deleteAttribute = (pid, id) => api.del(`/projects/${pid}/attributes/${id}`)

// --- Gereksinimler ----------------------------------------------------------
export const listRequirements = (pid) => api.get(`/projects/${pid}/requirements`)
export const createRequirement = (pid, data) => api.post(`/projects/${pid}/requirements`, data)
export const updateRequirement = (pid, id, data) =>
  api.put(`/projects/${pid}/requirements/${id}`, data)
export const deleteRequirement = (pid, id) => api.del(`/projects/${pid}/requirements/${id}`)
export const bulkDeleteRequirements = (pid, ids) =>
  api.post(`/projects/${pid}/requirements/batch-delete`, { ids })

// --- Test Senaryolari -------------------------------------------------------
export const listTestCases = (pid) => api.get(`/projects/${pid}/testcases`)
export const createTestCase = (pid, data) => api.post(`/projects/${pid}/testcases`, data)
export const updateTestCase = (pid, id, data) => api.put(`/projects/${pid}/testcases/${id}`, data)
export const deleteTestCase = (pid, id) => api.del(`/projects/${pid}/testcases/${id}`)
export const bulkDeleteTestCases = (pid, ids) =>
  api.post(`/projects/${pid}/testcases/batch-delete`, { ids })

// --- Izlenebilirlik baglari -------------------------------------------------
export const listLinks = (pid) => api.get(`/projects/${pid}/links`)
export const createLink = (pid, body) => api.post(`/projects/${pid}/links`, body)
export const bulkCreateLinks = (pid, body) => api.post(`/projects/${pid}/links/batch`, body)
export const deleteLink = (pid, id) => api.del(`/projects/${pid}/links/${id}`)

// --- Sozluk (Glossary) ------------------------------------------------------
export const listGlossary = (pid) => api.get(`/projects/${pid}/glossary`)
export const createGlossary = (pid, data) => api.post(`/projects/${pid}/glossary`, data)
export const updateGlossary = (pid, id, data) => api.put(`/projects/${pid}/glossary/${id}`, data)
export const deleteGlossary = (pid, id) => api.del(`/projects/${pid}/glossary/${id}`)
export const bulkDeleteGlossary = (pid, ids) =>
  api.post(`/projects/${pid}/glossary/batch-delete`, { ids })

// --- Roller (dinamik roller + 12 kademeli izin) -----------------------------
export const listRoles = (pid) => api.get(`/projects/${pid}/roles`)
export const createRole = (pid, data) => api.post(`/projects/${pid}/roles`, data)
export const updateRole = (pid, id, data) => api.put(`/projects/${pid}/roles/${id}`, data)
export const deleteRole = (pid, id) => api.del(`/projects/${pid}/roles/${id}`)

// --- Personel (passcode ile giren atanmis kisiler) --------------------------
export const listPersonnel = (pid) => api.get(`/projects/${pid}/personnel`)
export const createPersonnel = (pid, data) => api.post(`/projects/${pid}/personnel`, data)
export const deletePersonnel = (pid, id) => api.del(`/projects/${pid}/personnel/${id}`)

// --- Onay (consensus onay + kilitleme) --------------------------------------
export const listApprovals = (pid) => api.get(`/projects/${pid}/approvals`)
export const voteApproval = (pid, body) => api.post(`/projects/${pid}/approvals/vote`, body)
export const unlockApproval = (pid, body) => api.post(`/projects/${pid}/approvals/unlock`, body)
export const approvalMatrix = (pid, entityType, entityId) =>
  api.get(`/projects/${pid}/approvals/matrix?entityType=${entityType}&entityId=${entityId}`)

// --- Audit ------------------------------------------------------------------
export const listAudit = (pid) => api.get(`/projects/${pid}/audit`)

// --- Cascade durum yeniden hesabi (manuel tetik) ---------------------------
export const recompute = (pid) => api.post(`/projects/${pid}/recompute`)

// --- ReqIF Integration ------------------------------------------------------
export const importReqIF = (pid, xmlContent) =>
  api.post(`/projects/${pid}/traceability/import/reqif`, { xmlContent })

// --- Etki Analizi (Issue #46) -----------------------------------------------
// Backend Recursive CTE ile hesaplanan etki agaci; buyuk veri setlerinde
// tarayiciyi kilitlemeden agaci server-side kurar.
export const getImpact = (pid, reqId) => api.get(`/projects/${pid}/impact`, { reqId })

// --- Snapshots (Issue #8) ----------------------------------------------------
// Sürüm / baseline altyapısı: snapshot olusturma, listeleme, detay, silme.
export const listSnapshots = (pid) => api.get(`/projects/${pid}/snapshots`)
export const createSnapshot = (pid, name) => api.post(`/projects/${pid}/snapshots`, { name })
export const getSnapshot = (pid, snapshotId) => api.get(`/projects/${pid}/snapshots/${snapshotId}`)
export const deleteSnapshot = (pid, snapshotId) =>
  api.del(`/projects/${pid}/snapshots/${snapshotId}`)
