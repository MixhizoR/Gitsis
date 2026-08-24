// ============================================================================
//  ProjectContext.jsx  —  Aktif proje baglami ve proje listesi yonetimi.
//  Tum veri artik PROJE bazli izole edildiginden, hangi projede calisildigini
//  bu context tutar. Aktif proje ID'si localStorage'da saklanir; boylece sayfa
//  yenilense de kullanici ayni projede kalir. AppContext bu context'e bagli
//  calisir (aktif proje yoksa veri cekilmez).
//
//    Login  ->  ProjectSelect (bu context)  ->  Workspace (AppContext)
// ============================================================================
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  listProjects,
  createProject as apiCreateProject,
  updateProject as apiUpdateProject,
  deleteProject as apiDeleteProject,
} from '../services/dataService.js'

const ACTIVE_KEY = 'ehsim_active_project'
const ProjectContext = createContext(null)

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([])
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY) || null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // --- Proje listesini backend'den tazele -----------------------------------
  const refreshProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listProjects()
      setProjects(rows)
      return rows
    } catch (e) {
      setError(e?.message || 'Projeler yüklenemedi.')
      setProjects([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  // Aktif proje ID'sini kalici tut.
  useEffect(() => {
    try {
      if (activeProjectId) localStorage.setItem(ACTIVE_KEY, activeProjectId)
      else localStorage.removeItem(ACTIVE_KEY)
    } catch {
      /* yoksay */
    }
  }, [activeProjectId])

  // --- Aksiyonlar -----------------------------------------------------------
  const openProject = useCallback((pid) => setActiveProjectId(pid), [])
  const closeProject = useCallback(() => setActiveProjectId(null), [])

  const createProject = useCallback(
    async (name, description) => {
      const p = await apiCreateProject(name, description)
      await refreshProjects()
      return p
    },
    [refreshProjects]
  )

  const renameProject = useCallback(
    async (pid, data) => {
      const p = await apiUpdateProject(pid, data)
      await refreshProjects()
      return p
    },
    [refreshProjects]
  )

  const removeProject = useCallback(
    async (pid) => {
      await apiDeleteProject(pid)
      if (pid === activeProjectId) setActiveProjectId(null)
      await refreshProjects()
    },
    [activeProjectId, refreshProjects]
  )

  const activeProject = projects.find((p) => p.id === activeProjectId) || null

  const value = {
    projects,
    activeProjectId,
    activeProject,
    loading,
    error,
    refreshProjects,
    openProject,
    closeProject,
    createProject,
    renameProject,
    removeProject,
  }

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

 
export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject yalnizca <ProjectProvider> icinde kullanilabilir.')
  return ctx
}
