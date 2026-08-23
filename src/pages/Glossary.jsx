// ============================================================================
//  Glossary.jsx  —  Sozluk (Glossary) sayfasi.
//  Terimler projeye ozeldir. 'Assigned To' bagi ile User / System / Sub-system
//  gereksinimlerine esnek sekilde atanabilir (LinkManager).
//  Toplu islem: coklu secim + 5 sn geri alinabilir toplu silme + toplu atama.
// ============================================================================
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import GlossaryForm from '../components/glossary/GlossaryForm.jsx'
import LinkManager from '../components/traceability/LinkManager.jsx'
import BulkActionBar from '../components/common/BulkActionBar.jsx'
import BulkLinkModal from '../components/common/BulkLinkModal.jsx'
import UndoToast from '../components/common/UndoToast.jsx'
import { IconPlus, IconEdit, IconTrash, IconLink } from '../components/common/Icons.jsx'
import { LINK_TYPE } from '../utils/constants.js'
import { useBulkSelection } from '../hooks/useBulkSelection.js'
import { useUndoableDelete } from '../hooks/useUndoableDelete.js'

export default function Glossary() {
  const { glossary, links, bulkRemoveGlossary } = useApp()
  const { t } = useLang()
  const { can } = useAuth()
  const canAssign = can('link_assigned')
  const [q, setQ] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [linkTarget, setLinkTarget] = useState(null)
  const [bulkLinkOpen, setBulkLinkOpen] = useState(false)

  const del = useUndoableDelete(bulkRemoveGlossary)
  const pendingSet = useMemo(() => new Set(del.pendingIds), [del.pendingIds])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return glossary
      .filter((g) => (!needle ? true : `${g.text_id} ${g.term} ${g.definition}`.toLowerCase().includes(needle)))
      .sort((a, b) => (a.term || '').localeCompare(b.term || '', 'tr'))
  }, [glossary, q])

  const visibleRows = useMemo(() => rows.filter((g) => !pendingSet.has(g.id)), [rows, pendingSet])
  const visibleIds = useMemo(() => visibleRows.map((g) => g.id), [visibleRows])
  const sel = useBulkSelection(visibleIds)

  const assignCount = (id) => links.filter((l) => l.type === LINK_TYPE.ASSIGNED_TO && l.toId === id).length

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (g) => { setEditing(g); setFormOpen(true) }

  const handleDelete = (g) => { del.schedule([g.id]) }
  const handleBulkDelete = () => {
    if (sel.count === 0) return
    const ids = sel.selectedIds
    sel.clear()
    del.schedule(ids)
  }

  const selectedRows = useMemo(
    () => visibleRows.filter((g) => sel.selectedSet.has(g.id)),
    [visibleRows, sel.selectedSet]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('nav.glossary')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-bold text-slate-800 dark:text-slate-100">{visibleRows.length}</span> {t('glo.records')}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <IconPlus size={18} /> {t('glo.add')}
        </button>
      </div>

      <input className="input !py-1.5 text-sm" placeholder={t('filt.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />

      {visibleRows.length > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-brand-600 dark:border-slate-600"
            checked={sel.allSelected}
            ref={(el) => { if (el) el.indeterminate = sel.someSelected }}
            onChange={sel.toggleAll}
          />
          {t('bulk.selectAll')}
        </label>
      )}

      <BulkActionBar
        count={sel.count}
        onDelete={handleBulkDelete}
        onLink={canAssign ? () => setBulkLinkOpen(true) : undefined}
        onClear={sel.clear}
        canLink={canAssign}
      />

      {visibleRows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-base font-semibold text-slate-600 dark:text-slate-300">{t('tbl.noResult')}</p>
          <p className="text-sm text-slate-400">{t('glo.emptySub')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map((g) => {
            const checked = sel.selectedSet.has(g.id)
            return (
              <div key={g.id} className={`card flex flex-col gap-2 p-4 ${checked ? 'ring-2 ring-brand-400 dark:ring-brand-500' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600 dark:border-slate-600"
                      checked={checked}
                      onChange={() => sel.toggleRow(g.id)}
                    />
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] font-bold text-brand-600 dark:text-brand-400">{g.text_id}</div>
                      <div className="text-base font-bold text-slate-900 dark:text-white">{g.term}</div>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-bold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300" title={t('glo.assignedCount')}>
                    {assignCount(g.id)} {t('glo.assigned')}
                  </span>
                </div>
                <p className="flex-1 text-sm text-slate-600 dark:text-slate-300">{g.definition || '—'}</p>
                <div className="flex items-center justify-end gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {canAssign && (
                    <button onClick={() => setLinkTarget(g)} className="btn-ghost !px-2 !py-1.5 text-brand-600 dark:text-brand-400" title={t('glo.manageAssign')}>
                      <IconLink size={16} />
                    </button>
                  )}
                  <button onClick={() => openEdit(g)} className="btn-ghost !px-2 !py-1.5" title={t('tbl.edit')}>
                    <IconEdit size={16} />
                  </button>
                  <button onClick={() => handleDelete(g)} className="btn-ghost !px-2 !py-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" title={t('tbl.delete')}>
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <GlossaryForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      <LinkManager open={Boolean(linkTarget)} onClose={() => setLinkTarget(null)} subject={linkTarget} subjectKind="glossary" />
      <BulkLinkModal
        open={bulkLinkOpen}
        onClose={() => setBulkLinkOpen(false)}
        subjectKind="glossary"
        sources={selectedRows}
        onDone={sel.clear}
      />
      <UndoToast
        open={del.isPending}
        count={del.pendingIds.length}
        secondsLeft={del.secondsLeft}
        onUndo={del.undo}
      />
    </div>
  )
}
