// ============================================================================
//  MergeModal.jsx — Kardes gereksinimleri birlestirir (Issue #9 / Adim 7).
//
//  YIKICI ISLEM: en eski (createdAt) gereksinim hayatta kalir; digerlerinin
//  tum baglari + alt gereksinimleri ona aktarilir ve kendileri SILINIR.
//  Silinen text_id'ler audit kara listesinde kalir (asla yeniden uretilmez).
//
//  Hayatta kalani UI da hesaplar (onizleme icin) ama KARAR BACKEND'INDIR;
//  yanit dondukten sonra gercek survivor cagiran tarafta gosterilir.
// ============================================================================
import { useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

// Backend ile ayni kural: en eski createdAt; esitlikte text_id (dogal sira).
export function predictSurvivor(nodes) {
  return [...nodes].sort(
    (a, b) =>
      new Date(a.createdAt || 0) - new Date(b.createdAt || 0) ||
      String(a.text_id).localeCompare(String(b.text_id), undefined, { numeric: true }),
  )[0]
}

export default function MergeModal({ open, nodes, onClose, onSubmit }) {
  const { t } = useLang()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!open || !nodes || nodes.length < 2) return null

  const survivor = predictSurvivor(nodes)
  const absorbed = nodes.filter((n) => n.id !== survivor.id)

  const handleSubmit = async () => {
    setBusy(true)
    setError('')
    try {
      await onSubmit(nodes.map((n) => n.id))
      onClose()
    } catch (err) {
      setError(err?.message || t('form.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('merge.title')}>
      <div className="space-y-4">
        {/* Yikici islem uyarisi */}
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          {t('merge.warning', { n: absorbed.length })}
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            {t('merge.survivor')}
          </div>
          <div
            data-testid="merge-survivor"
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-700 dark:bg-emerald-900/20"
          >
            <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">
              {survivor.text_id}
            </span>
            <span className="ml-2 text-sm text-slate-800 dark:text-slate-100">
              {survivor.title}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
            {t('merge.toDelete')}
          </div>
          {absorbed.map((n) => (
            <div
              key={n.id}
              className="rounded-lg border border-rose-200 px-3 py-2 dark:border-rose-800"
            >
              <span className="font-mono text-xs font-bold text-rose-700 line-through dark:text-rose-300">
                {n.text_id}
              </span>
              <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">{n.title}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>
            {t('form.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
          >
            {t('merge.submit')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
