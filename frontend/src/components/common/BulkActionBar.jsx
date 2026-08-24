// ============================================================================
//  BulkActionBar.jsx  —  Birden fazla satir secildiginde tablonun hemen ustunde
//  beliren "Toplu Islemler" paneli. Secim sayisini gosterir; Toplu Sil ve
//  (destekleniyorsa) Toplu Linkle eylemlerini sunar.
// ============================================================================
import { IconTrash, IconLink, IconClose } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function BulkActionBar({ count, onDelete, onLink, onClear, canLink = true }) {
  const { t } = useLang()
  if (!count || count < 2) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3 shadow-sm dark:border-brand-900/50 dark:bg-brand-950/30">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-brand-600 px-2 text-sm font-bold text-white">
          {count}
        </span>
        <div className="text-sm">
          <div className="font-bold text-brand-800 dark:text-brand-200">{t('bulk.title')}</div>
          <div className="text-xs text-brand-600 dark:text-brand-300">
            {t('bulk.selected', { count })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canLink && onLink && (
          <button onClick={onLink} className="btn-secondary !py-1.5">
            <IconLink size={16} /> {t('bulk.linkBtn')}
          </button>
        )}
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-rose-700"
        >
          <IconTrash size={16} /> {t('bulk.deleteBtn')}
        </button>
        <button onClick={onClear} className="btn-ghost !px-2 !py-1.5" title={t('bulk.clear')}>
          <IconClose size={16} />
        </button>
      </div>
    </div>
  )
}
