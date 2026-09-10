// ============================================================================
//  FilterBar.jsx  —  Gereksinim / Test / PBS sayfalarinin ORTAK filtre cubugu.
//
//  Cubukta yalnizca ARAMA kutusu ve TEK BIR "Filtreler" butonu durur; butona
//  basilinca acilan menude olcutlerin TAMAMI bulunur: Tip + Alan + Durum +
//  Atanan Kisi + projede tanimli TUM oznitelikler. Boylece proje buyudukce
//  (her yeni oznitelik bir kutu daha demekti) cubuk tasmaz.
//
//  ONEMLI: Filtreleme ALTYAPISI degismedi — durum/kalicilik hala
//  useEntityFilters, eslesme hala matchesFilters. Burasi yalnizca sunum
//  katmanidir.
//
//  OZNITELIKLER: artik yalnizca 'select' tipindekiler degil, HER TIP filtre
//  uretir (bkz. utils/filterOptions.js filterableAttrDefs):
//    select  -> secenek listesi
//    boolean -> Evet / Hayir
//    number  -> tam eslesme (sayisal)
//    date    -> gun eslesmesi
//    text    -> icinde gecen (buyuk/kucuk harf duyarsiz)
//  Yeni bir oznitelik eklenir eklenmez menude belirir (attributeDefs her
//  mutasyondan sonra tazelenir — bkz. AppContext.refresh).
//
//  Secenekler cagiran taraftan gelir: Alan listesi projeye gore dinamiktir
//  (useApp().fields), oznitelikler runtime'da eklenip silinebilir, Durum ise
//  sayfaya gore farkli anlamlidir (test sonucu vs. dogrulanma durumu — bkz.
//  useEntityFilters). `types` / `fields` null verilirse o filtre HIC
//  gosterilmez: sayfa zaten tek tipe kilitliyse (cfg.lockedType) tabloda tip
//  sutunu da gosterilmez, ozel bir sayfa tek Alan'a sabitlenmisse
//  (navItem.fieldFilter) de secenek kalmaz — ikisinde de filtre gereksizdir.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { IconSearch, IconFilter, IconChevron } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { UNASSIGNED } from '../../hooks/useEntityFilters.js'
import { personnelName } from '../../utils/format.js'

export default function FilterBar({
  filters,
  onSet,
  onSetAttr,
  onClear,
  types = null,
  fields = null,
  statusOptions = [],
  assignees = null,
  attrDefs = [],
  activeCount = 0,
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  // Menu disina tiklaninca / Esc'e basilinca kapan — acik menu sayfanin
  // geri kalanini kapatmasin.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const row = (testId, label, control) => (
    <label key={testId} className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {control}
    </label>
  )

  const select = (testId, label, value, onChange, options, allLabel = null) =>
    row(
      testId,
      label,
      <select
        className="input !py-1.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        data-testid={testId}
      >
        <option value="">{allLabel || t('filt.allOf', { label })}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>,
    )

  const input = (testId, label, value, onChange, type, placeholder) =>
    row(
      testId,
      label,
      <input
        className="input !py-1.5 text-sm"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        data-testid={testId}
      />,
    )

  // Bir oznitelik tanimindan (dataType'ina gore) uygun girdi alanini uretir.
  const attrControl = (d) => {
    const testId = `filter-attr-${d.key}`
    const value = filters.attrs?.[d.key] || ''
    const onChange = (v) => onSetAttr(d.key, v)
    switch (d.dataType) {
      case 'select':
        return select(
          testId,
          d.label,
          value,
          onChange,
          (d.options || []).map((o) => ({ value: o.value, label: o.label })),
        )
      case 'boolean':
        return select(testId, d.label, value, onChange, [
          { value: 'true', label: t('filt.yes') },
          { value: 'false', label: t('filt.no') },
        ])
      case 'number':
        return input(testId, d.label, value, onChange, 'number', t('filt.numberPh'))
      case 'date':
        return input(testId, d.label, value, onChange, 'date', '')
      default:
        return input(testId, d.label, value, onChange, 'text', t('filt.textPh'))
    }
  }

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

      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
          data-testid="filter-toggle"
          className={`btn-secondary !py-1.5 text-sm ${open ? 'ring-2 ring-brand-400' : ''}`}
        >
          <IconFilter size={16} />
          {t('filt.button')}
          {activeCount > 0 && (
            <span
              className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold tabular-nums text-white"
              data-testid="filter-toggle-count"
            >
              {activeCount}
            </span>
          )}
          <IconChevron size={13} className={open ? '-rotate-90' : 'rotate-90'} />
        </button>

        {open && (
          <div
            data-testid="filter-panel"
            role="group"
            aria-label={t('filt.button')}
            className="absolute right-0 z-30 mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="space-y-3">
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

              {assignees &&
                select(
                  'filter-assignee',
                  t('filt.assignee'),
                  filters.assignee,
                  (v) => onSet('assignee', v),
                  [
                    { value: UNASSIGNED, label: t('filt.unassigned') },
                    ...assignees.map((p) => ({ value: p.id, label: personnelName(p) })),
                  ],
                )}

              {attrDefs.map((d) => attrControl(d))}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5 dark:border-slate-700">
              <button
                type="button"
                className="btn-ghost text-sm disabled:opacity-40"
                onClick={onClear}
                disabled={activeCount === 0}
                data-testid="filter-clear"
              >
                {t('filt.clear')}
              </button>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => setOpen(false)}
                data-testid="filter-close"
              >
                {t('filt.done')}
              </button>
            </div>
          </div>
        )}
      </div>
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
