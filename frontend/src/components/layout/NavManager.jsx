// ============================================================================
//  NavManager.jsx  —  Sol menu duzeni yonetimi (Issue #9 / Adim 6).
//  Grup ekle / yeniden adlandir / sil ve sayfalari gruplar arasinda tasi.
//
//  Kullanici gruplara YENI SAYFA da ekleyebilir ("+" dugmesi). Yeni sayfa =
//  sabit bir TEMEL TIP (pageKey) + ozel ad + istege bagli Alan (disiplin)
//  filtresi. Gereksinim/test TIPLERI sabittir (backend navDefaults.js
//  NAV_PAGE_KEYS); yeni tip yaratilamaz — DO-178C hiyerarsi kurallari ve
//  12 kademeli izin matrisi bundan etkilenmez. Ayrisma Alan filtresiyle olur.
//  Grup silinince sayfalari kaybolmaz, grupsuz seviyeye duser. Sayfa
//  kaldirmak yalnizca MENU kaydini siler; gereksinim/test verisi durur.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { IconPlus, IconTrash, IconEdit } from '../common/Icons.jsx'
import { PAGE_LABEL_KEYS } from './Sidebar.jsx'

export default function NavManager({ open, onClose }) {
  const {
    nav,
    fields,
    materializeNav,
    addNavGroup,
    renameNavGroup,
    removeNavGroup,
    addNavItem,
    updateNavItem,
    removeNavItem,
  } = useApp()
  const { t } = useLang()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null) // satir ici yeniden adlandirma
  const [confirmDeleteId, setConfirmDeleteId] = useState(null) // satir ici silme onayi
  const [editName, setEditName] = useState('')
  // "+" ile acilan sayfa ekleme formu (hangi grup icin acildigi tutulur)
  const [addingToGroup, setAddingToGroup] = useState(null)
  const [newPage, setNewPage] = useState({ pageKey: 'req-user', label: '', fieldFilter: '' })
  const [itemEditId, setItemEditId] = useState(null)
  const [itemEditLabel, setItemEditLabel] = useState('')

  // Duzenleyici acildiginda varsayilan duzeni DB'ye yaz (idempotent): aksi
  // halde varsayilan gruplarin id'si olmadigi icin hedef olarak secilemezler.
  useEffect(() => {
    if (!open || !nav || nav.materialized) return
    let cancelled = false
    ;(async () => {
      try {
        await materializeNav()
      } catch (err) {
        if (!cancelled) setError(err?.message || t('form.saveError'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, nav, materializeNav, t])

  const groups = nav?.groups || []
  const ungrouped = nav?.ungrouped || []
  const groupLabel = (g) => (g.nameKey ? t(g.nameKey) : g.name)
  const navItemLabel = (item) => item.label || t(PAGE_LABEL_KEYS[item.pageKey] || item.pageKey)

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err?.message || t('form.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    await run(async () => {
      await addNavGroup(name.trim())
      setName('')
    })
  }

  // Yeniden adlandirma ve silme onayi SATIR ICINDE yapilir.
  // window.prompt()/confirm() kullanilmaz: gomulu tarayicilarda prompt()
  // "not supported" hatasi firlatir, confirm() ise sessizce false doner —
  // yani her iki islem de sessizce calismaz hale gelirdi.
  const startRename = (g) => {
    setConfirmDeleteId(null)
    setEditingId(g.id)
    setEditName(groupLabel(g))
  }

  const submitRename = async (g) => {
    const next = editName.trim()
    if (!next || next === groupLabel(g)) {
      setEditingId(null)
      return
    }
    await run(async () => {
      await renameNavGroup(g.id, next)
      setEditingId(null)
    })
  }

  const openAddPage = (g) => {
    setEditingId(null)
    setConfirmDeleteId(null)
    setAddingToGroup(g.id)
    setNewPage({ pageKey: 'req-user', label: '', fieldFilter: '' })
  }

  const submitAddPage = async (g) => {
    await run(async () => {
      await addNavItem({
        groupId: g.id,
        pageKey: newPage.pageKey,
        label: newPage.label.trim() || null,
        fieldFilter: newPage.fieldFilter || null,
      })
      setAddingToGroup(null)
    })
  }

  const submitItemRename = async (item) => {
    const next = itemEditLabel.trim()
    await run(async () => {
      await updateNavItem(item.id, { label: next || null })
      setItemEditId(null)
    })
  }

  const handleDelete = async (g) => {
    await run(async () => {
      await removeNavGroup(g.id)
      setConfirmDeleteId(null)
    })
  }

  // Tum sayfalar (gruplu + grupsuz) tek listede; her biri icin hedef grup secilir.
  const allPages = [
    ...groups.flatMap((g) => g.items.map((i) => ({ ...i, groupId: g.id }))),
    ...ungrouped.map((i) => ({ ...i, groupId: null })),
  ]

  return (
    <Modal open={open} onClose={onClose} title={t('navmgr.title')}>
      <div className="space-y-5">
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {t('navmgr.hint')}
        </p>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Yeni grup ekle */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('navmgr.newGroupPlaceholder')}
            className="input flex-1"
            disabled={busy}
          />
          <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
            <IconPlus size={15} /> {t('navmgr.addGroup')}
          </button>
        </form>

        {/* Mevcut gruplar */}
        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {t('navmgr.groups')}
          </div>
          {groups.length === 0 && (
            <div className="text-sm text-slate-500">{t('navmgr.noGroups')}</div>
          )}
          {groups.map((g, gi) => {
            const isEditing = editingId === g.id
            const isConfirming = confirmDeleteId === g.id
            return (
              <div
                key={g.id || `default-${gi}`}
                data-testid={`nav-group-${groupLabel(g)}`}
                className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
              >
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(g)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                      disabled={busy}
                      data-testid="nav-group-rename-input"
                      className="input flex-1 !py-1 text-sm"
                    />
                  ) : (
                    <span className="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {groupLabel(g)}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-slate-400">
                    {t('navmgr.pageCount', { n: g.items.length })}
                  </span>
                  {!isEditing && (
                    <button
                      onClick={() => openAddPage(g)}
                      disabled={busy || !g.id}
                      title={t('navmgr.addPage')}
                      aria-label={`${groupLabel(g)} ${t('navmgr.addPage')}`}
                      data-testid={`nav-group-addpage-${groupLabel(g)}`}
                      className="btn-ghost !px-2 text-brand-600 disabled:opacity-40"
                    >
                      <IconPlus size={15} />
                    </button>
                  )}

                  {isEditing ? (
                    <>
                      <button
                        onClick={() => submitRename(g)}
                        disabled={busy}
                        className="btn-primary !px-2 !py-1 text-xs"
                      >
                        {t('navmgr.save')}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        disabled={busy}
                        className="btn-secondary !px-2 !py-1 text-xs"
                      >
                        {t('form.cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Varsayilan (heniz DB'ye yazilmamis) gruplarda id yoktur;
                          modal acilisinda materialize edilir, o yuzden normalde
                          burada her zaman id bulunur. */}
                      <button
                        onClick={() => startRename(g)}
                        disabled={busy || !g.id}
                        title={t('navmgr.rename')}
                        aria-label={`${groupLabel(g)} ${t('navmgr.rename')}`}
                        className="btn-ghost !px-2 disabled:opacity-40"
                      >
                        <IconEdit size={15} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null)
                          setConfirmDeleteId(g.id)
                        }}
                        disabled={busy || !g.id}
                        title={t('navmgr.delete')}
                        aria-label={`${groupLabel(g)} ${t('navmgr.delete')}`}
                        className="btn-ghost !px-2 text-rose-600 disabled:opacity-40"
                      >
                        <IconTrash size={15} />
                      </button>
                    </>
                  )}
                </div>

                {/* "+" ile acilan sayfa ekleme formu */}
                {addingToGroup === g.id && (
                  <div
                    data-testid="nav-add-page-form"
                    className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60"
                  >
                    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {t('navmgr.addPageHint')}
                    </p>
                    <label className="block text-xs font-semibold text-slate-500">
                      {t('navmgr.pageType')}
                      <select
                        value={newPage.pageKey}
                        onChange={(e) => setNewPage((v) => ({ ...v, pageKey: e.target.value }))}
                        disabled={busy}
                        data-testid="nav-add-page-type"
                        className="input mt-1 w-full !py-1 text-sm"
                      >
                        {Object.keys(PAGE_LABEL_KEYS).map((k) => (
                          <option key={k} value={k}>
                            {t(PAGE_LABEL_KEYS[k])}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-500">
                      {t('navmgr.pageName')}
                      <input
                        value={newPage.label}
                        onChange={(e) => setNewPage((v) => ({ ...v, label: e.target.value }))}
                        placeholder={t('navmgr.pageNamePlaceholder')}
                        disabled={busy}
                        data-testid="nav-add-page-name"
                        className="input mt-1 w-full !py-1 text-sm"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-500">
                      {t('navmgr.pageFilter')}
                      <select
                        value={newPage.fieldFilter}
                        onChange={(e) => setNewPage((v) => ({ ...v, fieldFilter: e.target.value }))}
                        disabled={busy}
                        data-testid="nav-add-page-filter"
                        className="input mt-1 w-full !py-1 text-sm"
                      >
                        <option value="">{t('navmgr.noFilter')}</option>
                        {(fields || []).map((f) => (
                          <option key={f.id} value={f.name}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => submitAddPage(g)}
                        disabled={busy}
                        data-testid="nav-add-page-submit"
                        className="btn-primary !px-3 !py-1 text-xs"
                      >
                        {t('navmgr.addPage')}
                      </button>
                      <button
                        onClick={() => setAddingToGroup(null)}
                        disabled={busy}
                        className="btn-secondary !px-3 !py-1 text-xs"
                      >
                        {t('form.cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Gruptaki sayfalar: ozel ad duzenleme + menuden kaldirma */}
                {g.items.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {g.items.map((item) => (
                      <div
                        key={item.id}
                        data-testid={`nav-item-${item.id}`}
                        className="flex items-center gap-2 rounded border border-slate-100 px-2 py-1 dark:border-slate-800"
                      >
                        {itemEditId === item.id ? (
                          <>
                            <input
                              value={itemEditLabel}
                              onChange={(e) => setItemEditLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') submitItemRename(item)
                                if (e.key === 'Escape') setItemEditId(null)
                              }}
                              autoFocus
                              disabled={busy}
                              data-testid="nav-item-rename-input"
                              className="input flex-1 !py-0.5 text-xs"
                            />
                            <button
                              onClick={() => submitItemRename(item)}
                              disabled={busy}
                              className="btn-primary !px-2 !py-0.5 text-[11px]"
                            >
                              {t('navmgr.save')}
                            </button>
                            <button
                              onClick={() => setItemEditId(null)}
                              disabled={busy}
                              className="btn-secondary !px-2 !py-0.5 text-[11px]"
                            >
                              {t('form.cancel')}
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 truncate text-xs text-slate-600 dark:text-slate-300">
                              {navItemLabel(item)}
                              {item.fieldFilter && (
                                <span className="ml-1 text-[11px] text-slate-400">
                                  · {item.fieldFilter}
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => {
                                setItemEditId(item.id)
                                setItemEditLabel(navItemLabel(item))
                              }}
                              disabled={busy}
                              title={t('navmgr.rename')}
                              aria-label={`${navItemLabel(item)} ${t('navmgr.rename')}`}
                              className="btn-ghost !px-1.5 !py-0.5"
                            >
                              <IconEdit size={13} />
                            </button>
                            <button
                              onClick={() => run(() => removeNavItem(item.id))}
                              disabled={busy}
                              title={t('navmgr.removePage')}
                              aria-label={`${navItemLabel(item)} ${t('navmgr.removePage')}`}
                              className="btn-ghost !px-1.5 !py-0.5 text-rose-600"
                            >
                              <IconTrash size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Satir ici silme onayi (window.confirm gomulu tarayicida
                    calismadigi icin) */}
                {isConfirming && (
                  <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-900/30">
                    <p className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
                      {t('navmgr.deleteConfirm', { name: groupLabel(g) })}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => handleDelete(g)}
                        disabled={busy}
                        data-testid="nav-group-delete-confirm"
                        className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {t('navmgr.delete')}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={busy}
                        className="btn-secondary !px-3 !py-1 text-xs"
                      >
                        {t('form.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Sayfa -> grup atamasi */}
        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {t('navmgr.pages')}
          </div>
          {allPages.map((p) => (
            <div
              key={p.id || p.pageKey}
              data-testid={`nav-page-row-${p.id || p.pageKey}`}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                {navItemLabel(p)}
                {p.fieldFilter && (
                  <span className="ml-1 text-xs text-slate-400">· {p.fieldFilter}</span>
                )}
              </span>
              <select
                value={p.groupId || ''}
                disabled={busy || !p.id}
                aria-label={`${navItemLabel(p)} grup`}
                onChange={(e) =>
                  run(() => updateNavItem(p.id, { groupId: e.target.value || null }))
                }
                className="input !w-44 !py-1 text-xs"
              >
                <option value="">{t('navmgr.ungrouped')}</option>
                {groups.map((g, gi) => (
                  <option key={g.id || `default-${gi}`} value={g.id || ''}>
                    {groupLabel(g)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
