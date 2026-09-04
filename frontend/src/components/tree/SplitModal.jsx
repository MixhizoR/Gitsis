// ============================================================================
//  SplitModal.jsx — Bir gereksinimi yeni kardeslere boler (Issue #9 / Adim 7).
//
//  Semantik (backend treeOps.js ile ayni): orijinalin text_id'si ve TUM
//  baglari/testleri korunur; yeni parcalar ayni ust gereksinime baglanir
//  (yapisal Satisfies) ama Verifies/Assigned-To bagsiz baslar.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { IconPlus, IconTrash } from '../common/Icons.jsx'

export default function SplitModal({ open, node, onClose, onSubmit }) {
  const { t } = useLang()
  const [titles, setTitles] = useState([''])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setTitles([''])
      setError('')
    }
  }, [open])

  if (!node) return null

  const setAt = (i, value) => setTitles((prev) => prev.map((tt, k) => (k === i ? value : tt)))
  const addRow = () => setTitles((prev) => [...prev, ''])
  const removeRow = (i) => setTitles((prev) => prev.filter((_, k) => k !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Bos basliklar gonderilmez (backend de filtreler, ama once burada).
    const clean = titles.map((tt) => tt.trim()).filter(Boolean)
    if (clean.length === 0) {
      setError(t('split.needTitle'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit(clean)
      onClose()
    } catch (err) {
      setError(err?.message || t('form.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('split.title')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
          <div className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">
            {node.text_id}
          </div>
          <div className="truncate text-sm text-slate-800 dark:text-slate-100">{node.title}</div>
        </div>

        {/* Semantigi kullaniciya ACIKCA anlat */}
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {t('split.info')}
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {t('split.newParts')}
          </div>
          {titles.map((tt, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={tt}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder={t('split.partPlaceholder')}
                className="input flex-1"
                disabled={busy}
                data-testid={`split-title-${i}`}
              />
              {titles.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={busy}
                  className="btn-ghost !px-2 text-rose-600"
                  aria-label={t('split.removePart')}
                >
                  <IconTrash size={15} />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addRow} disabled={busy} className="btn-secondary !py-1.5">
            <IconPlus size={14} /> {t('split.addPart')}
          </button>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>
            {t('form.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {t('split.submit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
