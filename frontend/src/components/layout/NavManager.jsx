// ============================================================================
//  NavManager.jsx  —  Sol menu duzeni yonetimi (Issue #9 / Adim 6).
//  Grup ekle / yeniden adlandir / sil ve sayfalari gruplar arasinda tasi.
//
//  KRITIK: Kullanici YALNIZCA gruplama yapar. Sayfa listesi sabittir
//  (backend navDefaults.js NAV_PAGE_KEYS); yeni gereksinim/test TIPI
//  yaratilamaz — DO-178C hiyerarsi kurallari ve 12 kademeli izin matrisi
//  bundan etkilenmez. Grup silinince sayfalari kaybolmaz, grupsuz seviyeye
//  duser.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { IconPlus, IconTrash, IconEdit } from '../common/Icons.jsx'
import { PAGE_LABEL_KEYS } from './Sidebar.jsx'

export default function NavManager({ open, onClose }) {
  const { nav, materializeNav, addNavGroup, renameNavGroup, removeNavGroup, assignNavItem } =
    useApp()
  const { t } = useLang()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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

  const handleRename = (g) => {
    const next = window.prompt(t('navmgr.renamePrompt'), groupLabel(g))
    if (!next || next.trim() === groupLabel(g)) return
    run(() => renameNavGroup(g.id, next.trim()))
  }

  const handleDelete = (g) => {
    if (!window.confirm(t('navmgr.deleteConfirm', { name: groupLabel(g) }))) return
    run(() => removeNavGroup(g.id))
  }

  // Tum sayfalar (gruplu + grupsuz) tek listede; her biri icin hedef grup secilir.
  const allPages = [
    ...groups.flatMap((g) => g.items.map((i) => ({ pageKey: i.pageKey, groupId: g.id }))),
    ...ungrouped.map((i) => ({ pageKey: i.pageKey, groupId: null })),
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
          {groups.map((g, gi) => (
            <div
              key={g.id || `default-${gi}`}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <span className="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {groupLabel(g)}
              </span>
              <span className="text-xs text-slate-400">
                {t('navmgr.pageCount', { n: g.items.length })}
              </span>
              {/* Varsayilan (heniz DB'ye yazilmamis) gruplar once bir
                  ozellestirme ile materialize olur; o yuzden id'siz gruplarda
                  yeniden adlandir/sil kapalidir. */}
              <button
                onClick={() => handleRename(g)}
                disabled={busy || !g.id}
                title={t('navmgr.rename')}
                className="btn-ghost !px-2 disabled:opacity-40"
              >
                <IconEdit size={15} />
              </button>
              <button
                onClick={() => handleDelete(g)}
                disabled={busy || !g.id}
                title={t('navmgr.delete')}
                className="btn-ghost !px-2 text-rose-600 disabled:opacity-40"
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>

        {/* Sayfa -> grup atamasi */}
        <div className="space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {t('navmgr.pages')}
          </div>
          {allPages.map((p) => (
            <div
              key={p.pageKey}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                {t(PAGE_LABEL_KEYS[p.pageKey] || p.pageKey)}
              </span>
              <select
                value={p.groupId || ''}
                disabled={busy}
                onChange={(e) => run(() => assignNavItem(p.pageKey, e.target.value || null))}
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
