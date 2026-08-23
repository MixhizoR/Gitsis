// ============================================================================
//  CoverageReport.jsx  —  DO-178C "Kritik Guvenlik Acigi Raporu".
//  Test senaryosuna bagli olmayan sistem/yazilim gereksinimlerini listeler.
// ============================================================================
import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { computeCoverage } from '../utils/coverage.js'
import { ScoreRing } from '../components/common/StatCard.jsx'
import { StatusBadge, TypeBadge, DalBadge } from '../components/common/Badge.jsx'
import { IconShield, IconAlert, IconCheck } from '../components/common/Icons.jsx'
import { DAL } from '../utils/constants.js'

export default function CoverageReport() {
  const { requirements, links } = useApp()
  const { t } = useLang()
  const cov = useMemo(() => computeCoverage(requirements, links), [requirements, links])

  // DAL A/B kapsam disi olanlar ozellikle kritik.
  const criticalGaps = cov.uncovered.filter(
    (r) => r.dal_level === DAL.A || r.dal_level === DAL.B
  ).length

  return (
    <div className="space-y-5">
      {/* Ust ozet */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card flex flex-col items-center justify-center gap-2 p-6">
          <ScoreRing score={cov.score} />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {t('cov.scoreLabel')}
          </p>
        </div>

        <div className="card flex flex-col justify-center gap-3 p-6 lg:col-span-2">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{cov.total}</div>
              <div className="mt-1 text-xs font-medium uppercase text-slate-400">{t('cov.coverable')}</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{cov.coveredCount}</div>
              <div className="mt-1 text-xs font-medium uppercase text-slate-400">{t('cov.covered')}</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400">{cov.uncoveredCount}</div>
              <div className="mt-1 text-xs font-medium uppercase text-slate-400">{t('cov.uncovered')}</div>
            </div>
          </div>
          {criticalGaps > 0 && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              <IconAlert size={18} />
              {t('cov.criticalWarn', { n: criticalGaps })}
            </div>
          )}
        </div>
      </div>

      {/* Kritik acik listesi */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <IconAlert size={18} className="text-rose-500" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {t('cov.reportTitle')}
          </h3>
        </div>

        {cov.uncovered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-emerald-600 dark:text-emerald-400">
            <IconShield size={36} />
            <p className="text-base font-bold">{t('cov.allCoveredTitle')}</p>
            <p className="text-sm text-slate-400">{t('cov.allCoveredSub')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-4 py-3">{t('cov.th.code')}</th>
                  <th className="px-4 py-3">{t('cov.th.title')}</th>
                  <th className="px-4 py-3">{t('cov.th.type')}</th>
                  <th className="px-4 py-3">{t('cov.th.status')}</th>
                  <th className="px-4 py-3">{t('cov.th.dal')}</th>
                  <th className="px-4 py-3">{t('cov.th.risk')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cov.uncovered.map((r) => {
                  const critical = r.dal_level === DAL.A || r.dal_level === DAL.B
                  return (
                    <tr key={r.id} className="hover:bg-rose-50/40 dark:hover:bg-rose-950/10">
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                          {r.text_id}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{r.title}</div>
                        <div className="mt-0.5 max-w-md text-xs text-slate-500 dark:text-slate-400">
                          {r.description}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top"><TypeBadge value={r.type} /></td>
                      <td className="px-4 py-3 align-top"><StatusBadge value={r.status} /></td>
                      <td className="px-4 py-3 align-top"><DalBadge value={r.dal_level} /></td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ' +
                            (critical
                              ? 'bg-rose-600 text-white'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300')
                          }
                        >
                          {critical ? t('cov.riskHigh') : t('cov.riskMed')}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Kapsanan gereksinimler (bilgi amacli) */}
      {cov.covered.length > 0 && (
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            <IconCheck size={18} /> {t('cov.coveredList')} ({cov.covered.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {cov.covered.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                title={r.title}
              >
                <span className="font-mono">{r.text_id}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
