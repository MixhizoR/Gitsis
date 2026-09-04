// ============================================================================
//  App.jsx  —  Uygulama kabugu. Uc kapi:
//    1) Giris yoksa           -> <Login/>
//    2) Aktif proje secilmemis -> <ProjectSelect/>
//    3) Aksi halde             -> Sidebar + Topbar + sayfa yonlendirmesi.
//  Sayfa anahtarlari: dashboard, req-user, req-system, req-subsystem,
//  test-acceptance, test-system, test-subsystem, glossary, coverage,
//  traceability, documents, audit.
// ============================================================================
import { useState, useEffect } from 'react'
import { useApp } from './context/AppContext.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { useProject } from './context/ProjectContext.jsx'
import { useLang } from './context/LanguageContext.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import Topbar from './components/layout/Topbar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Hierarchy from './pages/Hierarchy.jsx'
import TestCases from './pages/TestCases.jsx'
import Glossary from './pages/Glossary.jsx'
import Roles from './pages/Roles.jsx'
import Traceability from './pages/Traceability.jsx'
import CoverageReport from './pages/CoverageReport.jsx'
import DocumentAnalysis from './pages/DocumentAnalysis.jsx'
import AuditLogPage from './pages/AuditLog.jsx'
import SnapshotsPage from './pages/Snapshots.jsx'
import SuspectPage from './pages/SuspectPage.jsx'
import ProjectSelect from './pages/ProjectSelect.jsx'
import Login from './pages/Login.jsx'
import AIAssistant from './components/common/AIAssistant.jsx'
import { TraceabilityPage } from './pages/TraceabilityPage'
import { TraceabilityImportPage } from './pages/TraceabilityImportPage'

const REQ_KEYS = ['req-user', 'req-system', 'req-subsystem']
const TEST_KEYS = ['test-acceptance', 'test-system', 'test-subsystem']

export default function App() {
  const { loading } = useApp()
  const { currentUser } = useAuth()
  const { activeProjectId, openProject } = useProject()
  const { t } = useLang()
  const [page, setPage] = useState('dashboard')
  // Issue #57: suspect gostergesinden gelindiginde vurgulanacak kayit id'si.
  const [suspectFocusId, setSuspectFocusId] = useState(null)

  // Personel oturumu: her zaman atandigi projeye kilitlenir (proje secim yok).
  const forcedProjectId = currentUser?.kind === 'personnel' ? currentUser.projectId : null
  useEffect(() => {
    if (forcedProjectId && activeProjectId !== forcedProjectId) openProject(forcedProjectId)
  }, [forcedProjectId, activeProjectId, openProject])

  // 1) Giris kapisi
  if (!currentUser) return <Login />

  // 2) Proje secim kapisi — YALNIZCA PM icin. Personel dogrudan projesine gider.
  if (!activeProjectId || (forcedProjectId && activeProjectId !== forcedProjectId)) {
    if (currentUser.isPM) return <ProjectSelect />
    // Personel projesi baglaniyor
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    )
  }

  // Sayfa degisiminde suspect vurgusunu sifirla (sidebar tiklamasiyla).
  const navigate = (key) => {
    setSuspectFocusId(null)
    setPage(key)
  }
  // Suspect gostergesine tiklayinca: vurgu hedefini ayarla + sayfaya git.
  const openSuspect = (row) => {
    setSuspectFocusId(row?.id ?? null)
    setPage('suspect')
  }

  // 3) Calisma alani
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
          <span className="text-sm font-medium">{t('app.loading')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={page} onNavigate={navigate} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar active={page} />
        <main className="flex-1 overflow-y-auto p-6">
          {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
          {page === 'roles' && <Roles />}
          {REQ_KEYS.includes(page) && (
            <Hierarchy key={page} pageKey={page} onOpenSuspect={openSuspect} />
          )}
          {TEST_KEYS.includes(page) && (
            <TestCases key={page} pageKey={page} onOpenSuspect={openSuspect} />
          )}
          {page === 'glossary' && <Glossary />}
          {page === 'traceability' && <Traceability projectId={activeProjectId} />}
          {page === 'traceability-export' && <TraceabilityPage projectId={activeProjectId} />}
          {page === 'traceability-import' && <TraceabilityImportPage projectId={activeProjectId} />}
          {page === 'coverage' && <CoverageReport onNavigate={setPage} />}
          {page === 'documents' && <DocumentAnalysis />}
          {page === 'audit' && <AuditLogPage />}
          {page === 'snapshots' && <SnapshotsPage />}
          {page === 'suspect' && <SuspectPage focusId={suspectFocusId} />}
        </main>
      </div>
      <AIAssistant onNavigate={setPage} />
    </div>
  )
}
