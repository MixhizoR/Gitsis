// ============================================================================
//  ViewBar.jsx  —  Kayitli Gorunum (Saved View) secim ve duzenleme cubugu.
//
//  Filtre cubugunun (FilterBar) yaninda durur ve UC seyi yonetir:
//    1) Gorunum secimi  — kaydedilmis bir duzeni tek tiklamayla uygular
//    2) Sutun duzeni    — hangi sutun gorunur (ALAN / BAG / ISLEMLER ...) ve
//                         hangi sirada (yukari/asagi tasima)
//    3) Satir duzeni    — sayfa basina kayit + siralama olcutu/yonu
//
//  Bu bilesen SUNUM katmanidir: durum ve kalicilik hooks/useEntityViews.js
//  icindedir (FilterBar ile useEntityFilters iliskisinin aynisi).
//
//  Kaydedilmemis degisiklik (dirty) secim kutusunda "•" ile isaretlenir ve
//  "Guncelle" butonu etkinlesir — kullanici neyi kaydetmedigini gorur.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import { IconList, IconChevron, IconTrash, IconCheck } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import {
  PAGE_SIZES,
  moveColumn,
  toggleColumn,
  sortOptionsFromCatalog,
} from '../../utils/viewConfig.js'

export default function ViewBar({
  views = [],
  selected = null,
  selectedId = '',
  onSelect,
  dirty = false,
  catalog = [],
  columnLayout = [],
  onColumnLayout,
  rowLayout,
  onRowLayout,
  onSave, // secili gorunumu guncelle
  onSaveAs, // (name, { scope, isDefault }) => Promise
  onMakeDefault,
  onDelete,
  canShare = false, // proje geneli (paylasilan) gorunum olusturabilir mi (PM)
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState('user')
  const [makeDefault, setMakeDefault] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const panelRef = useRef(null)

  // Menu disina tiklaninca / Esc'e basilinca kapan (FilterBar ile ayni kural).
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

  const labelOf = (c) => catalog.find((x) => x.key === c.key)?.label || c.key
  const lockedOf = (c) => Boolean(catalog.find((x) => x.key === c.key)?.locked)
  const sortOptions = sortOptionsFromCatalog(catalog, t)

  const run = async (fn) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      return true
    } catch (e) {
      setErr(e?.message || t('sv.error'))
      return false
    } finally {
      setBusy(false)
    }
  }

  const openSaveAs = () => {
    setName(selected ? `${selected.name} (2)` : '')
    setScope('user')
    setMakeDefault(false)
    setErr(null)
    setSaveOpen(true)
  }

  const submitSaveAs = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const ok = await run(() => onSaveAs(name.trim(), { scope, isDefault: makeDefault }))
    if (ok) setSaveOpen(false)
  }

  const personal = views.filter((v) => v.scope !== 'project')
  const shared = views.filter((v) => v.scope === 'project')
  const option = (v) => (
    <option key={v.id} value={v.id}>
      {v.isDefault ? '★ ' : ''}
      {v.name}
    </option>
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="view-select">
        {t('sv.label')}
      </label>
      <select
        id="view-select"
        className="input !w-auto !py-1.5 text-sm"
        value={selectedId || ''}
        onChange={(e) => onSelect(e.target.value)}
        data-testid="view-select"
        aria-label={t('sv.label')}
      >
        <option value="">{t('sv.none')}</option>
        {personal.length > 0 && <optgroup label={t('sv.mine')}>{personal.map(option)}</optgroup>}
        {shared.length > 0 && <optgroup label={t('sv.shared')}>{shared.map(option)}</optgroup>}
      </select>

      {dirty && (
        <span
          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          data-testid="view-dirty"
        >
          {t('sv.unsaved')}
        </span>
      )}

      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
          data-testid="view-toggle"
          className={`btn-secondary !py-1.5 text-sm ${open ? 'ring-2 ring-brand-400' : ''}`}
        >
          <IconList size={16} />
          {t('sv.layout')}
          <IconChevron size={13} className={open ? '-rotate-90' : 'rotate-90'} />
        </button>

        {open && (
          <div
            data-testid="view-panel"
            role="group"
            aria-label={t('sv.layout')}
            className="absolute right-0 z-30 mt-2 max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            {/* --- Sutunlar: gorunurluk + sira --- */}
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('sv.columns')}
            </p>
            <ul className="space-y-1">
              {columnLayout.map((c, i) => (
                <li
                  key={c.key}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-brand-600 disabled:opacity-40 dark:border-slate-600"
                    checked={c.visible !== false}
                    disabled={lockedOf(c)}
                    onChange={() => onColumnLayout(toggleColumn(columnLayout, c.key, catalog))}
                    aria-label={labelOf(c)}
                    data-testid={`view-col-${c.key}`}
                  />
                  <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                    {labelOf(c)}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost !px-1.5 !py-0.5 disabled:opacity-30"
                    disabled={i === 0}
                    onClick={() => onColumnLayout(moveColumn(columnLayout, c.key, -1))}
                    title={t('sv.moveUp')}
                    aria-label={`${labelOf(c)} — ${t('sv.moveUp')}`}
                    data-testid={`view-col-up-${c.key}`}
                  >
                    <IconChevron size={13} className="-rotate-90" />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-1.5 !py-0.5 disabled:opacity-30"
                    disabled={i === columnLayout.length - 1}
                    onClick={() => onColumnLayout(moveColumn(columnLayout, c.key, 1))}
                    title={t('sv.moveDown')}
                    aria-label={`${labelOf(c)} — ${t('sv.moveDown')}`}
                    data-testid={`view-col-down-${c.key}`}
                  >
                    <IconChevron size={13} className="rotate-90" />
                  </button>
                </li>
              ))}
            </ul>

            {/* --- Satir duzeni: sayfa boyutu + siralama --- */}
            <p className="mb-1.5 mt-3 border-t border-slate-200 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t('sv.rows')}
            </p>
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {t('sv.pageSize')}
                </span>
                <select
                  className="input !py-1.5 text-sm"
                  value={rowLayout.pageSize}
                  onChange={(e) => onRowLayout({ ...rowLayout, pageSize: Number(e.target.value) })}
                  data-testid="view-page-size"
                  aria-label={t('sv.pageSize')}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? t('sv.allRows') : n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {t('sv.sortBy')}
                </span>
                <select
                  className="input !py-1.5 text-sm"
                  value={rowLayout.sortBy}
                  onChange={(e) => onRowLayout({ ...rowLayout, sortBy: e.target.value })}
                  data-testid="view-sort-by"
                  aria-label={t('sv.sortBy')}
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {t('sv.sortDir')}
                </span>
                <select
                  className="input !py-1.5 text-sm"
                  value={rowLayout.sortDir}
                  onChange={(e) => onRowLayout({ ...rowLayout, sortDir: e.target.value })}
                  data-testid="view-sort-dir"
                  aria-label={t('sv.sortDir')}
                >
                  <option value="asc">{t('sv.asc')}</option>
                  <option value="desc">{t('sv.desc')}</option>
                </select>
              </label>
            </div>

            {/* --- Gorunum eylemleri --- */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2.5 dark:border-slate-700">
              <button
                type="button"
                className="btn-primary !py-1 text-sm disabled:opacity-40"
                onClick={openSaveAs}
                disabled={busy}
                data-testid="view-save-as"
              >
                {t('sv.saveAs')}
              </button>
              <button
                type="button"
                className="btn-secondary !py-1 text-sm disabled:opacity-40"
                onClick={() => run(onSave)}
                disabled={!selected || !dirty || busy}
                data-testid="view-save"
              >
                {t('sv.save')}
              </button>
              <button
                type="button"
                className="btn-ghost !py-1 text-sm disabled:opacity-40"
                onClick={() => run(onMakeDefault)}
                disabled={!selected || selected.isDefault || busy}
                data-testid="view-make-default"
              >
                <IconCheck size={14} /> {t('sv.makeDefault')}
              </button>
              <button
                type="button"
                className="btn-ghost !py-1 text-sm text-rose-500 disabled:opacity-40"
                onClick={() => run(onDelete)}
                disabled={!selected || busy}
                data-testid="view-delete"
              >
                <IconTrash size={14} /> {t('sv.delete')}
              </button>
            </div>
            {err && <p className="mt-2 text-xs text-rose-500">{err}</p>}
          </div>
        )}
      </div>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={t('sv.saveTitle')}
        subtitle={t('sv.saveSub')}
        maxWidth="max-w-md"
      >
        <form onSubmit={submitSaveAs} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300">
              {t('sv.name')}
            </span>
            <input
              className="input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={t('sv.namePh')}
              data-testid="view-name"
            />
          </label>
          {canShare && (
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300">
                {t('sv.scope')}
              </span>
              <select
                className="input"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                data-testid="view-scope"
              >
                <option value="user">{t('sv.scopeUser')}</option>
                <option value="project">{t('sv.scopeProject')}</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-brand-600 dark:border-slate-600"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
              data-testid="view-default-check"
            />
            {t('sv.makeDefault')}
          </label>
          {err && <p className="text-xs text-rose-500">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setSaveOpen(false)}>
              {t('common.close')}
            </button>
            <button
              type="submit"
              className="btn-primary disabled:opacity-40"
              disabled={!name.trim() || busy}
              data-testid="view-save-confirm"
            >
              {t('sv.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Sayfalama cubugu — satir duzenindeki `pageSize` ile birlikte calisir.
//  pageSize=0 (tumu) secildiginde hic gosterilmez.
// ---------------------------------------------------------------------------
export function TablePager({ page, pageCount, total, onPage }) {
  const { t } = useLang()
  if (!pageCount || pageCount <= 1) return null
  return (
    <div
      className="flex items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400"
      data-testid="table-pager"
    >
      <span>{t('sv.pageOf', { page, pageCount, total })}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn-secondary !py-1 text-sm disabled:opacity-40"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          data-testid="pager-prev"
        >
          <IconChevron size={14} className="rotate-180" />
          {t('sv.prev')}
        </button>
        <button
          type="button"
          className="btn-secondary !py-1 text-sm disabled:opacity-40"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          data-testid="pager-next"
        >
          {t('sv.next')}
          <IconChevron size={14} />
        </button>
      </div>
    </div>
  )
}
