// ============================================================================
//  dataService.js  —  Proje-bazli (project-isolated) veri servisi.
//  UI/context bu imzalari cagirir; HTTP detaylari apiClient icinde gizlidir.
//  Backend cascade durum hesabini KENDISI yapar; mutasyon sonrasi yalnizca
//  ilgili koleksiyonlari yeniden cekmek (refresh) yeterlidir.
// ============================================================================
import * as api from './apiClient.js'

// --- Projeler ---------------------------------------------------------------
export const listProjects = () => api.get('/projects')
//  codePrefix: text_id onegi (orn. EH-KAHVE-TİD). Bos birakilirsa backend
//  varsayilani kullanilir.
export const createProject = (name, description, codePrefix) =>
  api.post('/projects', { name, description, codePrefix })
export const getProject = (pid) => api.get(`/projects/${pid}`)
export const updateProject = (pid, data) => api.patch(`/projects/${pid}`, data)
export const deleteProject = (pid, reason) => api.del(`/projects/${pid}`, { reason })
//  Silinen projelerin gerekce gecmisi (yalnizca PM, proje kapsami disinda).
export const listProjectDeletions = () => api.get('/project-deletions')
//  text_id kod onegini degistirir. migrateExisting=true ise MEVCUT
//  gereksinim/test/sozluk kodlari da yeni onege tasinir (numaralar korunur).
export const setCodePrefix = (pid, codePrefix, migrateExisting) =>
  api.post(`/projects/${pid}/code-prefix`, { codePrefix, migrateExisting })

// --- Dinamik Alanlar (Field / Disiplin) ------------------------------------
export const listFields = (pid) => api.get(`/projects/${pid}/fields`)
export const addField = (pid, name) => api.post(`/projects/${pid}/fields`, { name })
export const deleteField = (pid, id, reason) => api.del(`/projects/${pid}/fields/${id}`, { reason })

// --- Modular Oznitelikler (Priority / DAL Level / ozel alanlar) ------------
//  entityType: 'requirement' | 'testcase' | 'both'
export const listAttributes = (pid, entityType) =>
  api.get(`/projects/${pid}/attributes${entityType ? `?entityType=${entityType}` : ''}`)
export const createAttribute = (pid, payload) => api.post(`/projects/${pid}/attributes`, payload)
export const updateAttribute = (pid, id, payload) =>
  api.patch(`/projects/${pid}/attributes/${id}`, payload)
export const deleteAttribute = (pid, id, reason) =>
  api.del(`/projects/${pid}/attributes/${id}`, { reason })

// --- Gereksinimler ----------------------------------------------------------
export const listRequirements = (pid) => api.get(`/projects/${pid}/requirements`)
export const createRequirement = (pid, data) => api.post(`/projects/${pid}/requirements`, data)
export const updateRequirement = (pid, id, data) =>
  api.put(`/projects/${pid}/requirements/${id}`, data)
export const deleteRequirement = (pid, id, reason) =>
  api.del(`/projects/${pid}/requirements/${id}`, { reason })
export const bulkDeleteRequirements = (pid, ids, reason) =>
  api.post(`/projects/${pid}/requirements/batch-delete`, { ids, reason })

// --- PBS (Urun Agaci) — lazy-load hiyerarsi (Issue #9) ----------------------
//  Tum agac TEK seferde cekilmez: yalnizca kok dugumler, kullanici expand
//  ettikce alt seviyeler dinamik gelir. `parentId` yoksa kok dugumler doner.
export const listTreeChildren = (pid, parentId) =>
  api.get(`/projects/${pid}/requirements/tree`, parentId ? { parentId } : undefined)
export const getAncestors = (pid, id) => api.get(`/projects/${pid}/requirements/${id}/ancestors`)
//  Tasima: dongusel tasima / tip uyumsuzlugu 400, kilitli kayit 403 doner.
//  parentId = null => koke tasi.
export const moveRequirement = (pid, id, parentId) =>
  api.patch(`/projects/${pid}/requirements/${id}/move`, { parentId })
//  Bolme: orijinalin text_id'si ve tum baglari/testleri KORUNUR; yeni parcalar
//  ayni ust dugume baglanir ama Verifies/Assigned-To bagsiz baslar.
export const splitRequirement = (pid, id, newTitles) =>
  api.post(`/projects/${pid}/requirements/${id}/split`, { newTitles })
//  Birlestirme: en eski (createdAt) gereksinim hayatta kalir; digerlerinin tum
//  baglari + cocuklari ona aktarilir, sonra SILINIRLER (yikici islem).
export const mergeRequirements = (pid, ids) =>
  api.post(`/projects/${pid}/requirements/merge`, { ids })

// --- Sol menu duzeni (gruplar + sayfa yerlesimi, Issue #9 / Adim 6) --------
//  Okuma herkese acik; degisiklikler yalnizca PM'e (backend requirePM).
//  Sayfa anahtarlari SABIT — kullanici yalnizca gruplama yapar.
export const getNav = (pid) => api.get(`/projects/${pid}/nav`)
export const materializeNav = (pid) => api.post(`/projects/${pid}/nav/materialize`)
export const createNavGroup = (pid, name) => api.post(`/projects/${pid}/nav/groups`, { name })
export const updateNavGroup = (pid, id, data) =>
  api.patch(`/projects/${pid}/nav/groups/${id}`, data)
export const deleteNavGroup = (pid, id) => api.del(`/projects/${pid}/nav/groups/${id}`)
//  Sayfa ekleme: sabit temel tip (pageKey) + istege bagli ozel ad ve Alan
//  filtresi. Ayni tipten birden fazla sayfa eklenebilir.
export const addNavItem = (pid, data) => api.post(`/projects/${pid}/nav/items`, data)
export const updateNavItem = (pid, id, data) => api.patch(`/projects/${pid}/nav/items/${id}`, data)
//  Menuden kaldirir; gereksinim/test VERILERINE dokunmaz.
export const deleteNavItem = (pid, id) => api.del(`/projects/${pid}/nav/items/${id}`)

// --- Test Senaryolari -------------------------------------------------------
export const listTestCases = (pid) => api.get(`/projects/${pid}/testcases`)
export const createTestCase = (pid, data) => api.post(`/projects/${pid}/testcases`, data)
export const updateTestCase = (pid, id, data) => api.put(`/projects/${pid}/testcases/${id}`, data)
export const deleteTestCase = (pid, id, reason) =>
  api.del(`/projects/${pid}/testcases/${id}`, { reason })
export const bulkDeleteTestCases = (pid, ids, reason) =>
  api.post(`/projects/${pid}/testcases/batch-delete`, { ids, reason })

// --- Izlenebilirlik baglari -------------------------------------------------
export const listLinks = (pid) => api.get(`/projects/${pid}/links`)
export const createLink = (pid, body) => api.post(`/projects/${pid}/links`, body)
export const bulkCreateLinks = (pid, body) => api.post(`/projects/${pid}/links/batch`, body)
export const deleteLink = (pid, id, reason) => api.del(`/projects/${pid}/links/${id}`, { reason })

// --- Sozluk (Glossary) ------------------------------------------------------
export const listGlossary = (pid) => api.get(`/projects/${pid}/glossary`)
export const createGlossary = (pid, data) => api.post(`/projects/${pid}/glossary`, data)
export const updateGlossary = (pid, id, data) => api.put(`/projects/${pid}/glossary/${id}`, data)
export const deleteGlossary = (pid, id, reason) =>
  api.del(`/projects/${pid}/glossary/${id}`, { reason })
export const bulkDeleteGlossary = (pid, ids, reason) =>
  api.post(`/projects/${pid}/glossary/batch-delete`, { ids, reason })

// --- Roller (dinamik roller + 12 kademeli izin) -----------------------------
export const listRoles = (pid) => api.get(`/projects/${pid}/roles`)
export const createRole = (pid, data) => api.post(`/projects/${pid}/roles`, data)
export const updateRole = (pid, id, data) => api.put(`/projects/${pid}/roles/${id}`, data)
export const deleteRole = (pid, id, reason) => api.del(`/projects/${pid}/roles/${id}`, { reason })

// --- Personel (passcode ile giren atanmis kisiler) --------------------------
export const listPersonnel = (pid) => api.get(`/projects/${pid}/personnel`)
export const createPersonnel = (pid, data) => api.post(`/projects/${pid}/personnel`, data)
export const deletePersonnel = (pid, id, reason) =>
  api.del(`/projects/${pid}/personnel/${id}`, { reason })

// --- Onay (consensus onay + kilitleme) --------------------------------------
export const listApprovals = (pid) => api.get(`/projects/${pid}/approvals`)
export const voteApproval = (pid, body) => api.post(`/projects/${pid}/approvals/vote`, body)
export const unlockApproval = (pid, body) => api.post(`/projects/${pid}/approvals/unlock`, body)
// Test senaryosunu DERHAL "Failed" yapar (tek yetkili yeterli, tam konsensus gerekmez).
export const rejectApproval = (pid, body) => api.post(`/projects/${pid}/approvals/reject`, body)
export const approvalMatrix = (pid, entityType, entityId) =>
  api.get(`/projects/${pid}/approvals/matrix?entityType=${entityType}&entityId=${entityId}`)

// --- Audit ------------------------------------------------------------------
export const listAudit = (pid) => api.get(`/projects/${pid}/audit`)

// --- Issue #57: Versiyon Gecmisi (SCD4) + Suspect baglar -------------------
//  Gereksinimin versiyon gecmisi (salt okunur; desc sirali).
export const getRequirementHistory = (pid, requirementId) =>
  api.get(`/projects/${pid}/requirements/${requirementId}/history`)
//  Bir gereksinimin TUM supheli baglarini temizle (approve izni gerekir).
export const clearSuspectLinks = (pid, requirementId) =>
  api.post(`/projects/${pid}/requirements/${requirementId}/clear-suspect`)
//  TEK bir supheli bagi temizle (approve izni gerekir).
export const clearLinkSuspect = (pid, linkId) =>
  api.post(`/projects/${pid}/links/${linkId}/clear-suspect`)

// --- Cascade durum yeniden hesabi (manuel tetik) ---------------------------
export const recompute = (pid) => api.post(`/projects/${pid}/recompute`)

// --- ReqIF Integration ------------------------------------------------------
//  file: .reqif / .reqifz (ZIP) / .xml — ikili (binary) guvenli oldugu icin
//  multipart/form-data ile gonderilir (JSON govdesi .reqifz'i tasiyamaz).
//  importType: REQ_TYPE degerlerinden biri — dosyadaki TUM nesneler bu
//  gereksinim tipi olarak ice aktarilir (DOORS modulleri genelde tek bir
//  hiyerarsi seviyesini temsil eder).
export const importReqIF = (pid, file, importType) => {
  const formData = new FormData()
  formData.append('file', file)
  if (importType) formData.append('importType', importType)
  return api.upload(`/projects/${pid}/traceability/import/reqif`, formData)
}

// --- Etki Analizi (Issue #46) -----------------------------------------------
// Backend Recursive CTE ile hesaplanan etki agaci; buyuk veri setlerinde
// tarayiciyi kilitlemeden agaci server-side kurar.
export const getImpact = (pid, reqId) => api.get(`/projects/${pid}/impact`, { reqId })

// --- Snapshots (Issue #8) ----------------------------------------------------
// Sürüm / baseline altyapısı: snapshot olusturma, listeleme, detay, silme.
export const listSnapshots = (pid) => api.get(`/projects/${pid}/snapshots`)
export const createSnapshot = (pid, name) => api.post(`/projects/${pid}/snapshots`, { name })
export const getSnapshot = (pid, snapshotId) => api.get(`/projects/${pid}/snapshots/${snapshotId}`)
export const deleteSnapshot = (pid, snapshotId, reason) =>
  api.del(`/projects/${pid}/snapshots/${snapshotId}`, { reason })

// --- Dokuman Kutuphanesi (PDF / Excel) --------------------------------------
//  Belgeler backend'de (PostgreSQL) saklanir; bir kez yuklenen belge silinene
//  kadar listede kalir, yeni yuklemeler kutuphaneye eklenir.
export const listDocuments = (pid) => api.get(`/projects/${pid}/documents`)

/** Bilgisayardan secilen bir dosyayi (File) projenin kutuphanesine yukler. */
export const uploadDocument = (pid, file, description = '', onProgress) => {
  const form = new FormData()
  form.append('file', file)
  if (description) form.append('description', description)
  return api.upload(`/projects/${pid}/documents`, form, {
    // Buyuk PDF/Excel yuklemeleri varsayilan 20sn'yi asabilir.
    timeout: 120000,
    onUploadProgress: onProgress
      ? (e) => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
      : undefined,
  })
}

/** Belgeyi Blob olarak indirir (Authorization basligi gerektigi icin fetch degil). */
export const downloadDocument = (pid, id) =>
  api.downloadBlob(`/projects/${pid}/documents/${id}/download`, { timeout: 120000 })

export const deleteDocument = (pid, id, reason) =>
  api.del(`/projects/${pid}/documents/${id}`, { reason })

/** Excel belgesini sayfa-ici onizleme icin satir dizisine cevirtir (backend). */
export const previewDocument = (pid, id) => api.get(`/projects/${pid}/documents/${id}/preview`)

/**
 * Belgeden cikarilmis duz metni getirir. Kullanici bu metin uzerinde secim
 * yapip gereksinim olusturur; secimin karakter araligi kaynak olarak saklanir.
 */
export const getDocumentText = (pid, id) => api.get(`/projects/${pid}/documents/${id}/text`)

// --- Yorumlar (ana varliklar uzerinde ekip ici iletisim) -------------------
//  GENERIC: ayni uclar tum varlik tipleri icin kullanilir (entityType +
//  entityId). Yazar SUNUCUDA belirlenir; istemci authorId/authorName GONDERMEZ.
export const listComments = (pid, entityType, entityId) =>
  api.get(`/projects/${pid}/comments`, entityType ? { entityType, entityId } : undefined)
export const addComment = (pid, entityType, entityId, text) =>
  api.post(`/projects/${pid}/comments`, { entityType, entityId, text })
//  Silme MEVCUT "gerekce zorunlu" kuralina tabidir (bkz. ReasonModal).
export const deleteComment = (pid, commentId, reason) =>
  api.del(`/projects/${pid}/comments/${commentId}`, { reason })
