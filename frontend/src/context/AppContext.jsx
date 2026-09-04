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
  const [attributeDefs, setAttributeDefs] = useState(EMPTY)
  const [auditLog, setAuditLog] = useState(EMPTY)
  const [roles, setRoles] = useState(EMPTY)
  const [personnel, setPersonnel] = useState(EMPTY)
  const [approvals, setApprovals] = useState(EMPTY)
  const [snapshots, setSnapshots] = useState(EMPTY)
  // Sol menu duzeni (gruplar + sayfa yerlesimi) — Issue #9 / Adim 6
  const [nav, setNav] = useState(null)
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
      setRequirements(EMPTY)
      setTestCases(EMPTY)
      setLinks(EMPTY)
      setGlossary(EMPTY)
      setFields(EMPTY)
      setAttributeDefs(EMPTY)
      setAuditLog(EMPTY)
      setRoles(EMPTY)
      setPersonnel(EMPTY)
      setApprovals(EMPTY)
      setSnapshots(EMPTY)
      setNav(null)
      return
    }
    const pid = activeProjectId
    const [reqs, tcs, lnks, glo, flds, attrDefs, audit, rls, prs, apps, snaps, navLayout] =
      await Promise.all([
        data.listRequirements(pid),
        data.listTestCases(pid),
        data.listLinks(pid),
        data.listGlossary(pid),
        data.listFields(pid),
        data.listAttributes(pid),
        data.listAudit(pid),
        data.listRoles(pid),
        data.listPersonnel(pid),
        data.listApprovals(pid),
        data.listSnapshots(pid),
        data.getNav(pid),
      ])
    setRequirements(reqs)
    setTestCases(tcs)
    setLinks(lnks)
    setGlossary(glo)
    setFields(flds)
    setAttributeDefs(attrDefs)
    setAuditLog(audit)
    setRoles(rls)
    setPersonnel(prs)
    setApprovals(apps)
    // Snapshots endpoint paginated: { data, total, take, skip }
    setSnapshots(snaps?.data || EMPTY)
    setNav(navLayout)
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
    return () => {
      cancelled = true
    }
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

    // Sol menu duzeni (Issue #9 / Adim 6) — yalnizca GRUPLAMA; sayfa
    // anahtarlari sabittir, kullanici yeni sayfa/tip yaratamaz.
    // PM "Menuyu duzenle"yi actiginda: varsayilan duzeni DB'ye yazar ki
    // varsayilan gruplar da id kazanip hedef olarak secilebilsin (idempotent).
    async materializeNav() {
      await data.materializeNav(pid)
      await refresh()
    },
    async addNavGroup(name) {
      const g = await data.createNavGroup(pid, name)
      await refresh()
      return g
    },
    async renameNavGroup(id, name) {
      await data.updateNavGroup(pid, id, { name })
      await refresh()
    },
    async removeNavGroup(id) {
      const res = await data.deleteNavGroup(pid, id)
      await refresh()
      return res
    },
    // Sayfa ekleme/guncelleme/kaldirma (menu ogeleri, id bazli).
    async addNavItem(body) {
      const it = await data.addNavItem(pid, body)
      await refresh()
      return it
    },
    async updateNavItem(id, body) {
      await data.updateNavItem(pid, id, body)
      await refresh()
    },
    async removeNavItem(id) {
      await data.deleteNavItem(pid, id)
      await refresh()
    },

    // Modular Oznitelikler (Priority / DAL Level / ozel alanlar) -----------
    async addAttribute(payload) {
      const a = await data.createAttribute(pid, payload)
      await refresh()
      return a
    },
    async editAttribute(id, updates) {
      const a = await data.updateAttribute(pid, id, updates)
      await refresh()
      return a
    },
    async removeAttribute(id) {
      await data.deleteAttribute(pid, id)
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

    // Snapshots (Issue #8) ----------------------------------------------------
    async createSnapshot(name) {
      if (!pid) throw new Error('Aktif proje yok')
      const s = await data.createSnapshot(pid, name)
      await refresh()
      return s
    },
    async deleteSnapshot(snapshotId) {
      if (!pid) throw new Error('Aktif proje yok')
      await data.deleteSnapshot(pid, snapshotId)
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
    attributeDefs,
    auditLog,
    roles,
    personnel,
    approvals,
    snapshots,
    nav,
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

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp yalnizca <AppProvider> icinde kullanilabilir.')
  return ctx
}
