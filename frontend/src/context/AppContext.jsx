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
  const [approvals, setApprovals] = useState(EMPTY)
  // Atanabilir kisiler (proje uyeleri) — Issue #97/A: Personnel yerine User.
  const [assignees, setAssignees] = useState(EMPTY)
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
      setApprovals(EMPTY)
      setAssignees(EMPTY)
      setSnapshots(EMPTY)
      setNav(null)
      return
    }
    const pid = activeProjectId
    const [reqs, tcs, lnks, glo, flds, attrDefs, audit, apps, people, snaps, navLayout] =
      await Promise.all([
        data.listRequirements(pid),
        data.listTestCases(pid),
        data.listLinks(pid),
        data.listGlossary(pid),
        data.listFields(pid),
        data.listAttributes(pid),
        data.listAudit(pid),
        data.listApprovals(pid),
        data.listAssignees(pid),
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
    setApprovals(apps)
    setAssignees(people)
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
    async removeRequirement(id, reason) {
      await data.deleteRequirement(pid, id, reason)
      await refresh()
    },
    async bulkRemoveRequirements(ids, reason) {
      if (!ids || ids.length === 0) return
      await data.bulkDeleteRequirements(pid, ids, reason)
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
    async removeTestCase(id, reason) {
      await data.deleteTestCase(pid, id, reason)
      await refresh()
    },
    async bulkRemoveTestCases(ids, reason) {
      if (!ids || ids.length === 0) return
      await data.bulkDeleteTestCases(pid, ids, reason)
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
    async removeGlossary(id, reason) {
      await data.deleteGlossary(pid, id, reason)
      await refresh()
    },
    async bulkRemoveGlossary(ids, reason) {
      if (!ids || ids.length === 0) return
      await data.bulkDeleteGlossary(pid, ids, reason)
      await refresh()
    },

    // Dinamik alanlar (Field / disiplin) -----------------------------------
    async addField(name) {
      const f = await data.addField(pid, name)
      await refresh()
      return f
    },
    async removeField(id, reason) {
      await data.deleteField(pid, id, reason)
      await refresh()
    },

    // Sol menu duzeni (Issue #9 / Adim 6) — yalnizca GRUPLAMA; sayfa
    // anahtarlari sabittir, kullanici yeni sayfa/tip yaratamaz.
    // PM "Menuyu duzenle"yi actiginda: varsayilan duzeni DB'ye yazar ki
    // varsayilan gruplar da id kazanip hedef olarak secilebilsin (idempotent).
    async materializeNav() {
      const layout = await data.materializeNav(pid)
      await refresh()
      return layout
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
    // Grup SIRASINI degistirir (yukari/asagi tasima). `updates`: [{ id, order }, ...]
    // — genelde iki grubun order degerlerini takas eder, tek refresh ile biter.
    async reorderNavGroups(updates) {
      await Promise.all(updates.map((u) => data.updateNavGroup(pid, u.id, { order: u.order })))
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
    // Bir grup icindeki sayfalarin SIRASINI degistirir (yukari/asagi tasima).
    // `updates`: [{ id, order }, ...] — genelde iki sayfanin order degerlerini
    // takas eder, tek refresh ile biter.
    async reorderNavItems(updates) {
      await Promise.all(updates.map((u) => data.updateNavItem(pid, u.id, { order: u.order })))
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
    async removeAttribute(id, reason) {
      await data.deleteAttribute(pid, id, reason)
      await refresh()
    },

    // Izlenebilirlik baglari ------------------------------------------------
    //  body: { fromId, toId, type, testStatus? }
    async link(body) {
      const l = await data.createLink(pid, body)
      await refresh()
      return l
    },
    async unlink(linkId, reason) {
      await data.deleteLink(pid, linkId, reason)
      await refresh()
    },
    // Toplu bag: { type, targetId, sourceIds, testStatus? }
    async bulkLink(body) {
      const r = await data.bulkCreateLinks(pid, body)
      await refresh()
      return r
    },

    // Onay (consensus) ------------------------------------------------------
    //  Issue #97: body: { entityType, entityId } — kimlik JWT'den alinir.
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
    //  body: { entityId } — yalnizca test senaryosu icin; tek yetkili yeterli.
    async rejectApproval(body) {
      const r = await data.rejectApproval(pid, body)
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

    // Issue #57: Versiyon gecmisi + supheli baglar -------------------------
    //  Gecmis on-demand cekilir (global koleksiyonlari sismez); mutasyon
    //  gerektirmez, bu yuzden refresh yok.
    async getRequirementHistory(requirementId) {
      if (!pid) throw new Error('Aktif proje yok')
      return data.getRequirementHistory(pid, requirementId)
    },
    //  Temizleme mutasyonudur; backend isSuspect kolonunu gunceller,
    //  sonrasinda link koleksiyonu yeniden cekilir.
    async clearSuspect(requirementId) {
      if (!pid) throw new Error('Aktif proje yok')
      const r = await data.clearSuspectLinks(pid, requirementId)
      await refresh()
      return r
    },
    async clearLinkSuspect(linkId) {
      if (!pid) throw new Error('Aktif proje yok')
      const r = await data.clearLinkSuspect(pid, linkId)
      await refresh()
      return r
    },

    // Snapshots (Issue #8) ----------------------------------------------------
    async createSnapshot(name) {
      if (!pid) throw new Error('Aktif proje yok')
      const s = await data.createSnapshot(pid, name)
      await refresh()
      return s
    },
    async deleteSnapshot(snapshotId, reason) {
      if (!pid) throw new Error('Aktif proje yok')
      await data.deleteSnapshot(pid, snapshotId, reason)
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
    approvals,
    // Issue #97/A: atanabilir kisiler = proje UYELERI (User). Personnel kalkti;
    // picker/gorunum/etiketler bu listeden beslenir. `personnel` adi eski
    // bilesenlerle uyumluluk icin ayni listeye baglanmistir (alias).
    assignees,
    personnel: assignees,
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
