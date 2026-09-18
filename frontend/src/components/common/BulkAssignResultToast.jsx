// ============================================================================
//  BulkAssignResultToast.jsx  —  Issue #120: toplu atama SONUCU bildirimi.
//
//  Toplu atamada bazi kayitlar backend'de ATLANIR (onaylanmis/kilitli olanlar,
//  clearance seviyesi yuzunden gorulemeyenler) ve bazilari zaten istenen
//  haldedir. Bu sessizce yutulmamalidir: islem bitince "N kayit guncellendi,
//  M kayit kilitli oldugu icin atlandi" ozeti gosterilir.
//
//  UndoToast ile ayni yerlesim/stil (ekran alti orta snackbar); geri sayim
//  yoktur — kullanici kapatana kadar durur.
// ============================================================================
import { IconUsers, IconClose } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function BulkAssignResultToast({ result, onClose }) {
  const { t } = useLang()
  if (!result) return null

  const { updated = 0, unchanged = 0, skippedLocked = 0, skippedHidden = 0 } = result
  // Ikincil satir yalnizca soylenecek bir sey varsa yazilir.
  const notes = []
  if (skippedLocked > 0) notes.push(t('bulk.assign.result.locked', { n: skippedLocked }))
  if (skippedHidden > 0) notes.push(t('bulk.assign.result.hidden', { n: skippedHidden }))
  if (unchanged > 0) notes.push(t('bulk.assign.result.unchanged', { n: unchanged }))

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4">
      <div
        data-testid="bulk-assign-result"
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-white shadow-2xl ring-1 ring-black/20 dark:border-slate-600"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
            <IconUsers size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {t('bulk.assign.result.updated', { n: updated })}
            </p>
            {notes.length > 0 && <p className="text-xs text-slate-300">{notes.join(' · ')}</p>}
          </div>
          <button
            onClick={onClose}
            title={t('bulk.clear')}
            className="inline-flex shrink-0 items-center rounded-lg bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
          >
            <IconClose size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
