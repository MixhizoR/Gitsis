// ============================================================================
//  RequirementFilters.jsx  —  Arama + tip/durum/oncelik/DAL filtre cubugu.
// ============================================================================
import { IconSearch } from '../common/Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { REQ_TYPES, PRIORITIES, STATUSES, DAL_LEVELS, CATEGORIES } from '../../utils/constants.js'

export default function RequirementFilters({ filters, onChange }) {
  const { t } = useLang()
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value })

  const select = (key, label, options) => (
    <select className="input !py-1.5 text-sm" value={filters[key]} onChange={set(key)} aria-label={label}>
      <option value="">{t('filt.allOf', { label })}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  )

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[220px] flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <IconSearch size={17} />
        </span>
        <input
          className="input !py-1.5 pl-9 text-sm"
          placeholder={t('filt.searchPh')}
          value={filters.q}
          onChange={set('q')}
        />
      </div>
      {select('type', t('filt.type'), REQ_TYPES)}
      {select('category', t('filt.category'), CATEGORIES)}
      {select('status', t('filt.status'), STATUSES)}
      {select('priority', t('filt.priority'), PRIORITIES)}
      {select('dal_level', t('filt.dal'), DAL_LEVELS)}
      {filters.uncovered && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/60">
          {t('filt.uncoveredBadge')}
        </span>
      )}
      {(filters.q || filters.type || filters.category || filters.status || filters.priority || filters.dal_level || filters.uncovered) && (
        <button
          className="btn-ghost text-sm"
          onClick={() => onChange({ q: '', type: '', category: '', status: '', priority: '', dal_level: '', uncovered: false })}
        >
          {t('filt.clear')}
        </button>
      )}
    </div>
  )
}
