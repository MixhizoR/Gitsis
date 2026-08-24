// ============================================================================
//  StatCard.jsx  —  Dashboard metrik karti + yardimci gostergeler.
// ============================================================================
import { useLang } from '../../context/LanguageContext.jsx'

export function StatCard({ label, value, sub, icon, accent = 'brand' }) {
  const accents = {
    brand: 'text-brand-600 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-300',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300',
    rose: 'text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300',
    violet: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-300',
  }
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accents[accent]}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
        {value}
      </div>
      {sub && <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  )
}

/** Yatay dagilim cubugu (durum/tip kirilimlari icin). */
export function BreakdownBar({ title, data, colorMap }) {
  const { t } = useLang()
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
      <div className="space-y-3">
        {entries.map(([key, count]) => (
          <div key={key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-300">{key}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                {count} · %{Math.round((count / total) * 100)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full ${colorMap?.[key] || 'bg-brand-500'}`}
                style={{ width: `${(count / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-slate-400">{t('stat.noData')}</p>
        )}
      </div>
    </div>
  )
}

/** Dairesel kapsam skoru gostergesi. */
export function ScoreRing({ score, size = 132 }) {
  const { t } = useLang()
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color =
    score >= 80 ? 'stroke-emerald-500' : score >= 50 ? 'stroke-amber-500' : 'stroke-rose-500'
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={`${color} transition-all duration-700`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
          %{score}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {t('stat.coverage')}
        </span>
      </div>
    </div>
  )
}
