// ============================================================================
//  TraceabilityMatrix.jsx  —  Tek bir matris tablosunu cizen yeniden
//  kullanilabilir bilesen. Satir = kaynak gereksinimler, Sutun = hedefler.
//  Dolu hucre = aralarinda bag var.
// ============================================================================
import { IconCheck } from '../common/Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function TraceabilityMatrix({ title, description, rows, cols, hasLink, accent = 'brand' }) {
  const { t } = useLang()
  const accentText = {
    brand: 'text-brand-600 dark:text-brand-400',
    violet: 'text-violet-600 dark:text-violet-400',
  }[accent]

  const accentCell = {
    brand: 'bg-brand-500',
    violet: 'bg-violet-500',
  }[accent]

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
        <h3 className={`text-sm font-bold ${accentText}`}>{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>

      {rows.length === 0 || cols.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-slate-400">
          {t('mtx.insufficient')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[200px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                  {t('mtx.sourceTarget')}
                </th>
                {cols.map((c) => (
                  <th
                    key={c.id}
                    className="border-b border-slate-200 bg-slate-50 px-2 py-3 align-bottom dark:border-slate-800 dark:bg-slate-800/60"
                    title={c.title}
                  >
                    <div className="mx-auto whitespace-nowrap font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300 [writing-mode:vertical-rl] rotate-180">
                      {c.text_id}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {r.text_id}
                      </span>
                      <span className="max-w-[180px] truncate text-xs text-slate-700 dark:text-slate-200">
                        {r.title}
                      </span>
                    </div>
                  </td>
                  {cols.map((c) => {
                    const linked = hasLink(r, c)
                    return (
                      <td
                        key={c.id}
                        className="border-b border-slate-100 px-2 py-2.5 text-center dark:border-slate-800/60"
                      >
                        {linked ? (
                          <span
                            className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md ${accentCell} text-white`}
                            title={`${r.text_id} ↔ ${c.text_id}`}
                          >
                            <IconCheck size={15} />
                          </span>
                        ) : (
                          <span className="text-slate-200 dark:text-slate-700">·</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
