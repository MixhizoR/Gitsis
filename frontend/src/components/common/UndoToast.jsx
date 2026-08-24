// ============================================================================
//  UndoToast.jsx  —  Silme sonrasi ekranin alt-ortasinda beliren, 5 sn geri
//  sayimli "Geri Al" bildirimi (snackbar). Sayac dolunca kendiliginden kapanir
//  (gercek silme cagiran tarafta tetiklenir).
// ============================================================================
import { IconReset, IconTrash } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function UndoToast({ open, count = 1, secondsLeft = 5, total = 5, onUndo }) {
  const { t } = useLang()
  if (!open) return null

  const pct = Math.max(0, Math.min(100, (secondsLeft / total) * 100))

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-white shadow-2xl ring-1 ring-black/20 dark:border-slate-600">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-300">
            <IconTrash size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {t('bulk.undo.deleted', { count })}
            </p>
            <p className="text-xs text-slate-300">
              {t('bulk.undo.hint', { s: secondsLeft })}
            </p>
          </div>
          <button
            onClick={onUndo}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-white/20"
          >
            <IconReset size={16} /> {t('bulk.undo.btn')}
          </button>
        </div>
        {/* geri sayim cubugu */}
        <div className="h-1 w-full bg-slate-700">
          <div
            className="h-full bg-rose-400 transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
