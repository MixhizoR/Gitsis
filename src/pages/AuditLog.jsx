// ============================================================================
//  AuditLog.jsx  —  Degisiklik Tarihcesi (Audit Log) sayfasi.
//  Tum mutasyonlar: kim, ne zaman, hangi alan, eski -> yeni deger.
// ============================================================================
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { formatDateTime } from '../utils/format.js'
import { IconSearch, IconHistory } from '../components/common/Icons.jsx'

const ACTION_STYLES = {
  CREATE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  UPDATE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  DELETE: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  LINK: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  UNLINK: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  SEED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  RESET: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LINK', 'UNLINK']

export default function AuditLogPage() {
  const { auditLog } = useApp()
  const { t } = useLang()
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return auditLog.filter((e) => {
      if (action && e.action !== action) return false
      if (needle) {
        const hay = `${e.textId} ${e.message} ${e.user} ${e.field || ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [auditLog, q, action])

  return (
    <div className="space-y-4">
      {/* Filtre cubugu */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-bold text-slate-800 dark:text-slate-100">{filtered.length}</span> {t('audit.recordsSuffix')}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <IconSearch size={17} />
            </span>
            <input
              className="input !py-1.5 pl-9 text-sm"
              placeholder={t('audit.searchPh')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="input !py-1.5 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t('audit.allActions')}</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Zaman cizelgesi tablosu */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
            <IconHistory size={30} />
            <p className="text-sm font-medium">{t('audit.noMatch')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-4 py-3">{t('audit.th.datetime')}</th>
                  <th className="px-4 py-3">{t('audit.th.user')}</th>
                  <th className="px-4 py-3">{t('audit.th.action')}</th>
                  <th className="px-4 py-3">{t('audit.th.object')}</th>
                  <th className="px-4 py-3">{t('audit.th.detail')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(e.timestamp)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{e.user}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${ACTION_STYLES[e.action] || ACTION_STYLES.SEED}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                        {e.textId}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-slate-700 dark:text-slate-200">{e.message}</div>
                      {e.field && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {e.field}
                          </span>
                          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-600 line-through dark:bg-rose-950/30 dark:text-rose-400">
                            {String(e.oldValue ?? '—')}
                          </span>
                          <span className="text-slate-400">→</span>
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                            {String(e.newValue ?? '—')}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
