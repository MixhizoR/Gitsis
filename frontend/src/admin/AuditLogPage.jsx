// ============================================================================
//  AuditLogPage.jsx — Admin konsolu: sistem denetim kayıtları (Issue #90).
//  /api/admin/audit-logs — sifre/token ASLA içermez (backend #88 garantisı).
//  Proje içi gereksinim geçmişi (immutable history) burada DEĞİL, proje
//  ekranlarındaki Audit sayfasında tutulur.
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useLang } from '../context/LanguageContext.jsx'
import { listAuditLogs } from '../services/adminService.js'

export default function AuditLogPage() {
  const { t } = useLang()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setLogs(await listAuditLogs({ limit: 200 }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card text-sm text-slate-500">{t('admin.loading')}</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">{t('admin.date')}</th>
                <th className="px-4 py-3">{t('admin.action')}</th>
                <th className="px-4 py-3">{t('admin.user')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={3}>
                    {t('admin.noLogs')}
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-200">
                    {l.action}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {l.metadata?.username || l.metadata?.targetUsername || l.userId || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
