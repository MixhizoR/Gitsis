// ============================================================================
//  Dashboard.jsx  —  Gosterge Paneli. Genel metrikler + kapsam skoru + kirilimlar.
// ============================================================================
import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { StatCard, BreakdownBar, ScoreRing } from '../components/common/StatCard.jsx'
import { computeCoverage, computeSatisfyCoverage, countByField } from '../utils/coverage.js'
import {
  IconList,
  IconLink,
  IconShield,
  IconAlert,
  IconTarget,
  IconChevron,
} from '../components/common/Icons.jsx'
import { REQ_TYPE, STATUS, DAL, CATEGORY_BAR } from '../utils/constants.js'
import { formatDateTime } from '../utils/format.js'

// Bar renkleri (dagilim cubuklari icin sade tonlar).
const STATUS_BAR = {
  [STATUS.DRAFT]: 'bg-slate-400',
  [STATUS.IN_REVIEW]: 'bg-amber-500',
  [STATUS.APPROVED]: 'bg-emerald-500',
  [STATUS.REJECTED]: 'bg-rose-500',
}
const TYPE_BAR = {
  [REQ_TYPE.USER]: 'bg-amber-500',
  [REQ_TYPE.SYSTEM]: 'bg-violet-500',
  [REQ_TYPE.SOFTWARE]: 'bg-brand-500',
  [REQ_TYPE.HARDWARE]: 'bg-teal-500',
  [REQ_TYPE.TEST_CASE]: 'bg-fuchsia-500',
}
const DAL_BAR = {
  [DAL.A]: 'bg-rose-500',
  [DAL.B]: 'bg-orange-500',
  [DAL.C]: 'bg-amber-500',
  [DAL.D]: 'bg-emerald-500',
  [DAL.E]: 'bg-slate-400',
}

export default function Dashboard({ onNavigate }) {
  const { requirements, testCases, links, auditLog } = useApp()
  const { t } = useLang()

  const cov = useMemo(() => computeCoverage(requirements, links), [requirements, links])
  const sat = useMemo(() => computeSatisfyCoverage(requirements, links), [requirements, links])
  const byType = useMemo(() => countByField(requirements, 'type'), [requirements])
  // Gereksinimlerde manuel durum kalktı; anlamlı "durum" testlerin sonucudur.
  const byTestStatus = useMemo(() => countByField(testCases, 'status'), [testCases])
  const byDal = useMemo(() => countByField(requirements, 'dal_level'), [requirements])
  const byCategory = useMemo(() => countByField(requirements, 'field'), [requirements])

  const testCaseCount = testCases.length
  const recentAudit = auditLog.slice(0, 6)

  return (
    <div className="space-y-6">
      {/* Ust metrik kartlari */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dash.totalReq')}
          value={requirements.length}
          sub={t('dash.totalReq.sub', {
            usr: byType[REQ_TYPE.USER] || 0,
            sys: byType[REQ_TYPE.SYSTEM] || 0,
            sw: byType[REQ_TYPE.SOFTWARE] || 0,
            hw: byType[REQ_TYPE.HARDWARE] || 0,
          })}
          icon={<IconList size={18} />}
          accent="brand"
        />
        <StatCard
          label={t('dash.links')}
          value={links.length}
          sub={t('dash.links.sub', { tc: testCaseCount })}
          icon={<IconLink size={18} />}
          accent="violet"
        />
        <StatCard
          label={t('dash.coverage')}
          value={`%${cov.score}`}
          sub={t('dash.coverage.sub', { covered: cov.coveredCount, total: cov.total })}
          icon={<IconShield size={18} />}
          accent={cov.score >= 80 ? 'emerald' : cov.score >= 50 ? 'amber' : 'rose'}
        />
        <StatCard
          label={t('dash.satisfy')}
          value={sat.openCount}
          sub={t('dash.satisfy.sub', { linked: sat.satisfiedCount, total: sat.total })}
          icon={<IconLink size={18} />}
          accent={sat.openCount > 0 ? 'rose' : 'emerald'}
        />
      </div>

      {/* Kapsam skoru + uyari */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card flex flex-col items-center justify-center gap-3 p-6">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            <IconTarget size={18} /> {t('dash.scoreTitle')}
          </div>
          <ScoreRing score={cov.score} />
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            {t('dash.scoreDesc')}
          </p>
        </div>

        <div className="card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <IconAlert size={18} className="text-rose-500" /> {t('dash.critTitle')}
            </h3>
            <button
              onClick={() => onNavigate('coverage')}
              className="btn-ghost text-xs text-brand-600 dark:text-brand-400"
            >
              {t('dash.fullReport')} <IconChevron size={14} />
            </button>
          </div>

          {cov.uncovered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              <IconShield size={28} />
              <p className="font-semibold">{t('dash.allCovered')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {cov.uncovered.slice(0, 5).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/20"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                      {r.text_id}
                    </span>
                    <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                      {r.title}
                    </span>
                  </div>
                  <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {r.dal_level}
                  </span>
                </li>
              ))}
              {cov.uncovered.length > 5 && (
                <li className="pt-1 text-center text-xs text-slate-500 dark:text-slate-400">
                  {t('dash.moreCrit', { n: cov.uncovered.length - 5 })}
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Satisfy (ust izlenebilirlik) acigi paneli */}
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2">
          <IconLink size={18} className="text-brand-500" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {t('dash.satisfyTitle')}
          </h3>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{t('dash.satisfyDesc')}</p>

        {sat.open.length === 0 ? (
          <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <IconShield size={26} />
            <p className="font-semibold">{t('dash.allSatisfied')}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sat.open.slice(0, 8).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/20"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                    {r.text_id}
                  </span>
                  <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                    {r.title}
                  </span>
                </div>
                <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {r.dal_level}
                </span>
              </li>
            ))}
            {sat.open.length > 8 && (
              <li className="col-span-full pt-1 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('dash.moreSat', { n: sat.open.length - 8 })}
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Kirilim cubuklari */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BreakdownBar title={t('dash.byType')} data={byType} colorMap={TYPE_BAR} />
        <BreakdownBar title={t('dash.byTestStatus')} data={byTestStatus} colorMap={STATUS_BAR} />
        <BreakdownBar title={t('dash.byDal')} data={byDal} colorMap={DAL_BAR} />
      </div>

      {/* Alan (disiplin) kirilimi — UI / Donanim / Veritabani / Sunucu ... */}
      <div className="grid grid-cols-1 gap-4">
        <BreakdownBar title={t('dash.byCategory')} data={byCategory} colorMap={CATEGORY_BAR} />
      </div>

      {/* Son aktiviteler */}
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">
          {t('dash.recent')}
        </h3>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {recentAudit.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {e.action}
                </span>
                <span className="truncate text-slate-700 dark:text-slate-200">{e.message}</span>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{formatDateTime(e.timestamp)}</span>
            </li>
          ))}
          {recentAudit.length === 0 && (
            <li className="py-3 text-sm text-slate-400">{t('dash.noActivity')}</li>
          )}
        </ul>
      </div>
    </div>
  )
}
