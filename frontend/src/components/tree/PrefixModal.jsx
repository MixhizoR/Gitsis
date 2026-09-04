// ============================================================================
//  PrefixModal.jsx — Proje kod onegi (text_id) duzenleme.
//
//  Yapi: <codePrefix>-<TIP>-<NNN>   ornek: EH-KAHVE-TİD-HW-009
//  Tip segmenti (USR/SYS/SW/HW/TC-*/GLO) ve numara SABITTIR; kullanici
//  yalnizca bastaki proje onegini degistirir.
//
//  "Mevcut kayitlari da tasi" isaretlenirse backend tum gereksinim/test/
//  sozluk kodlarini yeni onege tasir — NUMARALAR KORUNUR ve eski kodlar
//  denetim kaydinda (audit) kara listede kalir, asla yeniden uretilmez.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function PrefixModal({ open, currentPrefix, sampleTextId, onClose, onSubmit }) {
  const { t } = useLang()
  const [value, setValue] = useState(currentPrefix || '')
  const [migrate, setMigrate] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(currentPrefix || '')
      setMigrate(true)
      setError('')
    }
  }, [open, currentPrefix])

  const clean = value.trim()
  const changed = clean && clean !== currentPrefix

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!changed) return onClose()
    setBusy(true)
    setError('')
    try {
      await onSubmit(clean, migrate)
      onClose()
    } catch (err) {
      setError(err?.message || t('form.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('prefix.title')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {t('prefix.hint')}
        </p>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div>
          <label className="label">{t('prefix.label')}</label>
          <input
            className="input font-mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={currentPrefix}
            data-testid="prefix-input"
            autoFocus
            disabled={busy}
          />
        </div>

        {/* Onizleme: mevcut bir kodun yeni hali */}
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
          <div className="text-slate-500 dark:text-slate-400">{t('prefix.preview')}</div>
          <div className="mt-1 font-mono">
            <span className="text-slate-400 line-through">{sampleTextId}</span>
            <span className="mx-2 text-slate-400">→</span>
            <span
              className="font-bold text-brand-700 dark:text-brand-300"
              data-testid="prefix-preview"
            >
              {sampleTextId && currentPrefix
                ? sampleTextId.replace(currentPrefix, clean || currentPrefix)
                : `${clean || currentPrefix}-HW-009`}
            </span>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={migrate}
            onChange={(e) => setMigrate(e.target.checked)}
            disabled={busy}
            data-testid="prefix-migrate"
            className="mt-0.5 accent-brand-600"
          />
          <span className="text-slate-700 dark:text-slate-200">
            {t('prefix.migrate')}
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              {t('prefix.migrateHint')}
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>
            {t('form.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !changed}>
            {t('prefix.submit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
