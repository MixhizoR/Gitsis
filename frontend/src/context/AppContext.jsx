// ============================================================================
//  AppContext.jsx  —  Aktif proje icin merkezi durum (state) yonetimi.
//  UI bilesenleri yalnizca bu context'in actigi action'lari cagirir; bu context
//  de veri servisini (dataService) cagirir:
//      UI  ->  AppContext  ->  services/dataService  ->  apiClient  ->  /api  ->  Prisma  ->  Postgres
//
//  ONEMLI: Cascade durum hesabini BACKEND yapar. Bu nedenle her mutasyon
//  sonrasi yalnizca ilgili koleksiyonlari yeniden cekmek (refresh) yeterlidir;
//  istemci tarafinda durum yeniden hesabi YAPILMAZ.
//
//  Tum veri AKTIF PROJE (ProjectContext) kapsaminda cekilir. Aktif proje yoksa
//  koleksiyonlar bostur ve veri cekilmez.
// ============================================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useProject } from './ProjectContext.jsx'
import * as data from '../services/dataService.js'

const AppContext = createContext(null)

const EMPTY = []

export function AppProvider({ children }) {
  const { activeProjectId } = useProject()

  const [requirements, setRequirements] = useState(EMPTY)
  const [testCases, setTestCases] = useState(EMPTY)
  const [links, setLinks] = useState(EMPTY)
  const [glossary, setGlossary] = useState(EMPTY)
  const [fields, setFields] = useState(EMPTY)
  const [auditLog, setAuditLog] = useState(EMPTY)
  const [roles, setRoles] = useState(EMPTY)
  const [personnel, setPersonnel] = useState(EMPTY)
  const [approvals, setApprovals] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // --- Tema (dark/light) ----------------------------------------------------
  const [theme, setTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('ehsim_theme') || 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('ehsim_theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  // --- Aktif projenin tum koleksiyonlarini tazele ---------------------------
  const refresh = useCallback(async () => {
    if (!activeProjectId) {
      setRequirements(EMPTY); setTestCases(EMPTY); setLinks(EMPTY)
      setGlossary(EMPTY); setFields(EMPTY); setAuditLog(EMPTY)
      setRoles(EMPTY); setPersonnel(EMPTY); setApprovals(EMPTY)
      return
    }
    const pid = activeProjectId
    const [reqs, tcs, lnks, glo, flds, audit, rls, prs, apps] = await Promise.all([
      data.listRequirements(pid),
      data.listTestCases(pid),
      data.listLinks(pid),
      data.listGlossary(pid),
      data.listFields(pid),
      data.listAudit(pid),
      data.listRoles(pid),
      data.listPersonnel(pid),
      data.listApprovals(pid),
    ])
    setRequirements(reqs)
    setTestCases(tcs)
    setLinks(lnks)
    setGlossary(glo)
    setFields(flds)
    setAuditLog(audit)
    setRoles(rls)
    setPersonnel(prs)
    setApprovals(apps)
  }, [activeProjectId])

  // Aktif proje degistiginde veriyi yeniden yukle.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!activeProjectId) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        await refresh()
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Veri yüklenemedi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [activeProjectId, refresh])

  // --- Action'lar (UI bunlari cagirir) --------------------------------------
  //  Backend cascade hesabini kendisi yapar; her mutasyon sonrasi yalnizca
  //  refresh cagrilir. Tum action'lar aktif proje kapsaminda calisir.
  const pid = activeProjectId

  const actions = {
    // Gereksinimler ---------------------------------------------------------
    async addRequirement(payload) {
      const r = await data.createRequirement(pid, payload)
      await refresh()
      return r
    },
    async editRequirement(id, updates) {
      const r = await data.updateRequirement(pid, id, updates)
      await refresh()
      return r
    },
    async removeRequirement(id) {
      await data.deleteRequirement(pid, id)
      await refresh()
    },
    async bulkRemoveRequirements(ids) {
      if (!ids || ids.length === 0) return
      await data.bulkDeleteRequirements(pid, ids)
      await refresh()
    },

    // Test senaryolari ------------------------------------------------------
    async addTestCase(payload) {
      const t = await data.createTestCase(pid, payload)
      await refresh()
      return t
    },
    async editTestCase(id, updates) {
      const t = await data.updateTestCase(pid, id, updates)
      await refresh()
      return t
    },
    async removeTestCase(id) {
      await data.deleteTestCase(pid, id)
      await refresh()
    },
    async bulkRemoveTestCases(ids) {
      if (!ids || ids.length === 0) return
      await data.bulkDeleteTestCases(pid, ids)
      await refresh()
    },

    // Sozluk ----------------------------------------------------------------
    async addGlossary(payload) {
      const g = await data.createGlossary(pid, payload)
      await refresh()
      return g
    },
    async editGlossary(id, updates) {
      const g = await data.updateGlossary(pid, id, updates)
      await refresh()
      return g
    },
    async removeGlossary(id) {
      await data.deleteGlossary(pid, id)
      await refresh()
    },
    async bulkRemoveGlossary(ids) {
      if (!ids || ids.length === 0) return
      await data.bulkDeleteGlossary(pid, ids)
      await refresh()
    },

    // Dinamik alanlar (Field / disiplin) -----------------------------------
    async addField(name) {
      const f = await data.addField(pid, name)
      await refresh()
      return f
    },
    async removeField(id) {
      await data.deleteField(pid, id)
      await refresh()
    },

    // Izlenebilirlik baglari ------------------------------------------------
    //  body: { fromId, toId, type, testStatus? }
    async link(body) {
      const l = await data.createLink(pid, body)
      await refresh()
      return l
    },
    async unlink(linkId) {
      await data.deleteLink(pid, linkId)
      await refresh()
    },
    // Toplu bag: { type, targetId, sourceIds, testStatus? }
    async bulkLink(body) {
      const r = await data.bulkCreateLinks(pid, body)
      await refresh()
      return r
    },

    // Roller ----------------------------------------------------------------
    async addRole(payload) {
      const r = await data.createRole(pid, payload)
      await refresh()
      return r
    },
    async editRole(id, updates) {
      const r = await data.updateRole(pid, id, updates)
      await refresh()
      return r
    },
    async removeRole(id) {
      await data.deleteRole(pid, id)
      await refresh()
    },

    // Personel --------------------------------------------------------------
    async addPersonnel(payload) {
      const p = await data.createPersonnel(pid, payload)
      await refresh()
      return p
    },
    async removePersonnel(id) {
      await data.deletePersonnel(pid, id)
      await refresh()
    },

    // Onay (consensus) ------------------------------------------------------
    //  body: { entityType, entityId, voterId, voterName, personnelId? }
    async voteApproval(body) {
      const r = await data.voteApproval(pid, body)
      await refresh()
      return r
    },
    async unlockApproval(body) {
      const r = await data.unlockApproval(pid, body)
      await refresh()
      return r
    },
    async getApprovalMatrix(entityType, entityId) {
      return data.approvalMatrix(pid, entityType, entityId)
    },

    // Manuel cascade tetigi (nadiren gerekir) -------------------------------
    async recompute() {
      await data.recompute(pid)
      await refresh()
    },

    refresh,
  }

  const value = {
    // aktif proje kimligi (kolaylik icin)
    projectId: activeProjectId,
    // koleksiyonlar
    requirements,
    testCases,
    links,
    glossary,
    fields,
    auditLog,
    roles,
    personnel,
    approvals,
    // durum
    loading,
    error,
    // tema
    theme,
    toggleTheme,
    // aksiyonlar
    ...actions,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp yalnizca <AppProvider> icinde kullanilabilir.')
  return ctx
}
