// ============================================================================
//  FilterBar.jsx  —  Gereksinim / Test / PBS sayfalarinin ORTAK filtre cubugu.
//  Arama + Tip + Alan + Durum + projede tanimli select-tipi oznitelikler.
//
//  Secenekler cagiran taraftan gelir: Alan listesi projeye gore dinamiktir
//  (useApp().fields), oznitelikler runtime'da eklenip silinebildigi icin
//  (useApp().attributeDefs) sabit bir liste tutulamaz, Durum ise sayfaya gore
//  farkli anlamlidir (test sonucu vs. dogrulanma durumu — bkz. useEntityFilters).
//  `types` / `fields` null verilirse o filtre HIC gosterilmez: sayfa zaten tek
//  tipe kilitliyse (cfg.lockedType) tabloda tip sutunu da gosterilmez, ozel bir
//  sayfa tek Alan'a sabitlenmisse (navItem.fieldFilter) de secenek kalmaz —
//  ikisinde de filtre gereksizdir.
// ============================================================================
import { IconSearch } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function FilterBar({
  filters,
  onSet,
  onSetAttr,
  onClear,
  types = null,
  fields = null,
  statusOptions = [],
  attrDefs = [],
  activeCount = 0,
}) {
  const { t } = useLang()

  const select = (testId, label, value, onChange, options) => (
    <select
      key={testId}
      className="input !py-1.5 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      data-testid={testId}
    >
      <option value="">{t('filt.allOf', { label })}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
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
          onChange={(e) => onSet('q', e.target.value)}
          data-testid="filter-search"
        />
      </div>

      {types &&
        select(
          'filter-type',
          t('filt.type'),
          filters.type,
          (v) => onSet('type', v),
          types.map((ty) => ({ value: ty, label: ty })),
        )}

      {fields &&
        select(
          'filter-field',
          t('filt.field'),
          filters.field,
          (v) => onSet('field', v),
          fields.map((f) => ({ value: f.name, label: f.name })),
        )}

      {statusOptions.length > 0 &&
        select(
          'filter-status',
          t('filt.status'),
          filters.status,
          (v) => onSet('status', v),
          statusOptions,
        )}

      {attrDefs.map((d) =>
        select(
          `filter-attr-${d.key}`,
          d.label,
          filters.attrs?.[d.key] || '',
          (v) => onSetAttr(d.key, v),
          (d.options || []).map((o) => ({ value: o.value, label: o.label })),
        ),
      )}

      {activeCount > 0 && (
        <button className="btn-ghost text-sm" onClick={onClear} data-testid="filter-clear">
          {t('filt.clear')}
        </button>
      )}
    </div>
  )
}

// Sayfa basligindaki kayit sayaci — filtre aktifken kac olcutun uygulandigini
// da gosterir, boylece "liste neden bu kadar kisa?" sorusu ekranda yanitlanir.
export function FilterSummary({ count, label, activeCount = 0 }) {
  const { t } = useLang()
  return (
    <>
      <span className="font-bold text-slate-800 dark:text-slate-100">{count}</span> {label}
      {activeCount > 0 && (
        <span
          className="ml-2 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-300 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800/60"
          data-testid="filter-active-badge"
        >
          {t('filt.active', { n: activeCount })}
        </span>
      )}
    </>
  )
}
