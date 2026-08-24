// ============================================================================
//  Requirements.jsx  —  Gereksinim Yonetimi sayfasi.
//  Filtre + tablo + olustur/duzenle/sil + bag yonetimi.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import RequirementFilters from '../components/requirements/RequirementFilters.jsx'
import RequirementsTable from '../components/requirements/RequirementsTable.jsx'
import RequirementForm from '../components/requirements/RequirementForm.jsx'
import LinkManager from '../components/traceability/LinkManager.jsx'
import { IconPlus } from '../components/common/Icons.jsx'
import { getCoveredRequirementIds } from '../utils/coverage.js'
import { COVERABLE_TYPES } from '../utils/constants.js'

const EMPTY_FILTERS = { q: '', type: '', category: '', status: '', priority: '', dal_level: '', uncovered: false }

export default function Requirements({ injectedFilters = null, onFiltersConsumed }) {
  const { requirements, links, removeRequirement } = useApp()
  const { can } = useAuth()
  const { t } = useLang()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [linkTarget, setLinkTarget] = useState(null)

  const coveredIds = useMemo(() => getCoveredRequirementIds(links), [links])

  // AI Asistan'dan gelen filtreleri tek seferlik uygula (uzerine yaz).
  useEffect(() => {
    if (injectedFilters) {
      setFilters({ ...EMPTY_FILTERS, ...injectedFilters })
      onFiltersConsumed?.()
    }
  }, [injectedFilters, onFiltersConsumed])

  const linkCountFor = (id) => links.filter((l) => l.fromId === id || l.toId === id).length

  const isUncovered = (r) => COVERABLE_TYPES.includes(r.type) && !coveredIds.has(r.id)

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return requirements
      .filter((r) => {
        if (filters.type && r.type !== filters.type) return false
        if (filters.category && r.category !== filters.category) return false
        if (filters.status && r.status !== filters.status) return false
        if (filters.priority && r.priority !== filters.priority) return false
        if (filters.dal_level && r.dal_level !== filters.dal_level) return false
        // "Testi eksik" (kapsam disi) filtresi: kapsanabilir ama kapsanmamis.
        if (filters.uncovered && !(COVERABLE_TYPES.includes(r.type) && !coveredIds.has(r.id))) return false
        if (q) {
          const hay = `${r.text_id} ${r.title} ${r.description}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => a.text_id.localeCompare(b.text_id, undefined, { numeric: true }))
  }, [requirements, filters, coveredIds])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (r) => {
    setEditing(r)
    setFormOpen(true)
  }
  const handleDelete = async (r) => {
    if (window.confirm(t('req.deleteConfirm', { id: r.text_id, title: r.title }))) {
      await removeRequirement(r.id)
    }
  }

  return (
    <div className="space-y-4">
      {/* Ust eylem cubugu */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-bold text-slate-800 dark:text-slate-100">{filtered.length}</span> /{' '}
          {requirements.length} {t('req.shownSuffix')}
        </div>
        <button onClick={openCreate} className="btn-primary">
          <IconPlus size={18} /> {t('req.new')}
        </button>
      </div>

      <RequirementFilters filters={filters} onChange={setFilters} />

      <RequirementsTable
        rows={filtered}
        linkCountFor={linkCountFor}
        isUncovered={isUncovered}
        onEdit={openEdit}
        onDelete={handleDelete}
        onManageLinks={setLinkTarget}
        canManageLinks={can('link:manage')}
        canDelete={can('requirement:delete')}
      />

      <RequirementForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      <LinkManager open={Boolean(linkTarget)} onClose={() => setLinkTarget(null)} requirement={linkTarget} />
    </div>
  )
}
