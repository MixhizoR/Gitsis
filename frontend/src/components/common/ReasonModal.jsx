// ============================================================================
//  ReasonModal.jsx  —  Silme ONCESI zorunlu gerekce (izlenebilirlik) formu.
//  DO-178C degisiklik yonetimi: veriyi GERCEKTEN silen her islem "neden
//  silindi" gerekcesini ister; bu metin backend'de Degisiklik Tarihcesi'ne
//  (AuditLog.reason) yazilir. UI/menu duzeni gibi veri SILMEYEN islemler
//  (nav grubu/sayfasi kaldirma) bu modali KULLANMAZ.
//
//  Kullanim: `onConfirm(reason)` silme cagrisini kendisi yapar (asenkron);
//  hata firlatirsa modal acik kalir ve hatayi gosterir, basarili olursa
//  cagiran taraf modali kapatir (genelde onConfirm sonunda onClose cagirilir).
//  Sunucu tarafi dogrulamasi ESAS olandir (bkz. backend requireReason) —
//  buradaki dogrulama yalnizca UX icindir.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

const MIN_LEN = 3
const MAX_LEN = 500

export default function ReasonModal({ open, onClose, onConfirm, title, itemLabel, warning }) {
  const { t } = useLang()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setReason('')
    setError('')
    setBusy(false)
  }, [open])

  const submit = async () => {
    const clean = reason.trim()
    if (clean.length < MIN_LEN) {
      setError(t('delreason.tooShort', { n: MIN_LEN }))
      return
    }
    setBusy(true)
    setError('')
    try {
      await onConfirm(clean)
    } catch (err) {
      setError(err?.message || t('form.saveError'))
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title || t('delreason.title')}>
      <div className="space-y-3">
        {itemLabel && (
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{itemLabel}</p>
        )}
        {warning && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            {warning}
          </div>
        )}
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {t('delreason.hint')}
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !busy) onClose?.()
          }}
          rows={3}
          maxLength={MAX_LEN}
          placeholder={t('delreason.placeholder')}
          disabled={busy}
          data-testid="reason-modal-textarea"
          className="input"
        />
        {error && (
          <div
            data-testid="reason-modal-error"
            className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
          >
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-secondary"
            data-testid="reason-modal-cancel"
          >
            {t('form.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || reason.trim().length < MIN_LEN}
            className="btn-danger"
            data-testid="reason-modal-confirm"
          >
            {t('delreason.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
