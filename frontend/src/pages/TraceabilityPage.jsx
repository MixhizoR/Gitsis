// TraceabilityPage.jsx
import { useParams } from 'react-router-dom'
import { MatrixView } from '../components/traceability/MatrixView'
import { useProject } from '../context/ProjectContext.jsx' // Context import edildi

export function TraceabilityPage({ projectId: propProjectId }) {
  // 1. URL parametresini al
  const { projectId: routeProjectId } = useParams()

  // 2. Global ProjectContext'ten aktif proje ID'sini al
  const { activeProjectId } = useProject()

  // Öncelik sırası: Prop -> URL Parametresi -> Active Project Context
  const effectiveProjectId = propProjectId || routeProjectId || activeProjectId

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Traceability Matrix</h1>
      {/* Artık undefined kalma şansı yok! */}
      <MatrixView projectId={effectiveProjectId} />
    </div>
  )
}
