// ============================================================================
//  ApprovalMatrixModal.jsx  —  PM'e ozel "Onay Detayi" modali (consensus matris).
//  getApprovalMatrix(entityType, entityId) ile her yetkilinin oyunu listeler.
//  Kayit kilitliyse PM "Kilidi Aç" ile kendi onayini geri ceker (durum Beklemede).
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { IconCheckCircle, IconUnlock } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function ApprovalMatrixModal({ open, entityType, row, onClose, onFetch, onUnlock }) {
  const { t } = useLang()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (open && row) {
      setLoading(true)
      setData(null)
      ;(async () => {
        try {
          const res = await onFetch?.(entityType, row.id)
          if (!cancelled) setData(res)
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }
    return () => {
      cancelled = true
    }
  }, [open, row, entityType, onFetch])

  if (!row) return null

  const locked = data?.locked ?? row.locked
  const voters = data?.voters || []

  const handleUnlock = async () => {
    setUnlocking(true)
    try {
      await onUnlock?.(entityType, row.id)
      onClose?.()
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${row.text_id} — ${t('apm.title')}`}
      subtitle={t('apm.subtitle')}
      maxWidth="max-w-xl"
      footer={
        locked ? (
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            className="btn-primary disabled:opacity-60"
          >
            <IconUnlock size={16} /> {unlocking ? t('apm.unlocking') : t('apm.unlock')}
          </button>
        ) : (
          <button onClick={onClose} className="btn-secondary">
            {t('view.close')}
          </button>
        )
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">…</div>
      ) : (
        <>
          <div
            className={`mb-4 rounded-lg px-3 py-2 text-sm font-medium ${
              locked
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
            }`}
          >
            {locked ? t('apm.locked') : t('apm.pending')}
          </div>

          {voters.length <= 1 && <p className="mb-3 text-xs text-slate-400">{t('apm.noVoters')}</p>}

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t('apm.voter')}</th>
                  <th className="px-4 py-2.5 font-semibold">{t('apm.role')}</th>
                  <th className="px-4 py-2.5 font-semibold text-center">{t('apm.state')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {voters.map((v) => (
                  <tr key={v.voterId} className="text-slate-700 dark:text-slate-200">
                    <td className="px-4 py-2.5 font-semibold">{v.name}</td>
                    <td className="px-4 py-2.5">{v.role}</td>
                    <td className="px-4 py-2.5 text-center">
                      {v.voted ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <IconCheckCircle size={16} /> {t('apm.voted')}
                        </span>
                      ) : (
                        <span className="text-amber-500">{t('apm.notVoted')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
