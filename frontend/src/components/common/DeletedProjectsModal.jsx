// ============================================================================
//  DeletedProjectsModal.jsx  —  Silinen projelerin gerekce gecmisi (yalnizca
//  PM). Proje silinince kendi AuditLog'u da CASCADE ile gittigi icin, bu
//  kayitlar AYRI, projeye FK ile BAGLI OLMAYAN bir tabloda tutulur
//  (backend ProjectDeletionLog) — boylece proje gittikten SONRA da izlenebilir.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { listProjectDeletions } from '../../services/dataService.js'

export default function DeletedProjectsModal({ open, onClose }) {
  const { t } = useLang()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    listProjectDeletions()
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || t('form.saveError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, t])

  return (
    <Modal open={open} onClose={onClose} title={t('proj.deletedLog')} maxWidth="max-w-2xl">
      <div className="space-y-2">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400 dark:bg-slate-800/50">
            {t('proj.deletedEmpty')}
          </p>
        )}
        {!loading &&
          rows.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {r.projectName}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(r.deletedAt).toLocaleString()}
                  {r.actor ? ` · ${r.actor}` : ''}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{r.reason}</p>
            </div>
          ))}
      </div>
    </Modal>
  )
}
