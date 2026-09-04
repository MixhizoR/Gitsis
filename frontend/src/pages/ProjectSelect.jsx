// ============================================================================
//  ProjectSelect.jsx  —  Proje Secim / Yonetim ekrani.
//  Girisin ardindan dogrudan Dashboard yerine bu ekran gelir. Iki bolum:
//    - Kayitli Projeler  : DB'den gelen projeler (tiklaninca o projenin
//      kapsaminda calisma alanina girilir).
//    - Proje Olustur     : ad + kisa aciklama ile yeni proje (Enter ile kaydet).
//  Her proje kendi ID kapsaminda izole veri tutar.
// ============================================================================
import { useState } from 'react'
import { useProject } from '../context/ProjectContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import Logo from '../components/common/Logo.jsx'
import Modal from '../components/common/Modal.jsx'
import { DEFAULT_CODE_PREFIX } from '../utils/constants.js'
import { IconPlus, IconTrash, IconChevron } from '../components/common/Icons.jsx'

function CreateModal({ open, onClose }) {
  const { createProject } = useProject()
  const { t } = useLang()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // text_id onegi: <codePrefix>-<TIP>-<NNN> (orn. EH-KAHVE-TİD-USR-001)
  const [codePrefix, setCodePrefix] = useState(DEFAULT_CODE_PREFIX)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError(t('proj.nameRequired'))
    setSaving(true)
    setError('')
    try {
      await createProject(name.trim(), description.trim(), codePrefix.trim())
      setName('')
      setDescription('')
      setCodePrefix(DEFAULT_CODE_PREFIX)
      onClose()
    } catch (err) {
      setError(err.message || t('form.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('proj.newTitle')}
      subtitle={t('proj.newSub')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('form.cancel')}
          </button>
          <button
            type="submit"
            form="proj-form"
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? t('form.saving') : t('proj.create')}
          </button>
        </>
      }
    >
      <form id="proj-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}
        <div>
          <label className="label">{t('proj.name')}</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('proj.namePh')}
            autoFocus
          />
        </div>
        <div>
          <label className="label">{t('proj.desc')}</label>
          <textarea
            className="input min-h-[80px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('proj.descPh')}
          />
        </div>
        <div>
          <label className="label">{t('proj.codePrefix')}</label>
          <input
            className="input font-mono"
            value={codePrefix}
            onChange={(e) => setCodePrefix(e.target.value)}
            placeholder={DEFAULT_CODE_PREFIX}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('proj.codePrefixHint', { ornek: `${codePrefix || DEFAULT_CODE_PREFIX}-USR-001` })}
          </p>
        </div>
      </form>
    </Modal>
  )
}

export default function ProjectSelect() {
  const { projects, loading, error, openProject, removeProject } = useProject()
  const { currentUser, logout, can } = useAuth()
  const { t, lang, toggleLang } = useLang()
  const [createOpen, setCreateOpen] = useState(false)
  const canManageProjects = can('manage_projects')

  const handleDelete = async (e, p) => {
    e.stopPropagation()
    if (window.confirm(t('proj.deleteConfirm', { name: p.name }))) await removeProject(p.id)
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Ust bar */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-3.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div className="leading-tight">
            <div className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('app.name')}
            </div>
            <div className="text-[11px] text-slate-400">{t('proj.pickToStart')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleLang} className="btn-secondary !px-2.5 text-xs font-bold">
            {lang === 'tr' ? 'TR' : 'EN'}
          </button>
          <span className="hidden text-sm text-slate-500 sm:inline dark:text-slate-400">
            {currentUser?.name}
          </span>
          <button onClick={logout} className="btn-ghost text-sm">
            {t('topbar.logout')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('proj.savedTitle')}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('proj.savedSub')}</p>
          </div>
          {canManageProjects && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary">
              <IconPlus size={18} /> {t('proj.new')}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {t('proj.loadError')}: {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
          </div>
        ) : projects.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-base font-semibold text-slate-600 dark:text-slate-300">
              {t('proj.empty')}
            </p>
            <p className="max-w-md text-sm text-slate-400">{t('proj.emptySub')}</p>
            {canManageProjects && (
              <button onClick={() => setCreateOpen(true)} className="btn-primary mt-2">
                <IconPlus size={18} /> {t('proj.new')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const c = p._count || {}
              return (
                <button
                  key={p.id}
                  onClick={() => openProject(p.id)}
                  className="card group flex flex-col gap-3 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-400">
                      {p.name}
                    </h3>
                    {canManageProjects && (
                      <span
                        onClick={(e) => handleDelete(e, p)}
                        className="btn-ghost shrink-0 cursor-pointer rounded-lg !px-2 !py-1 text-rose-400 opacity-0 transition-opacity hover:bg-rose-50 group-hover:opacity-100 dark:hover:bg-rose-950/40"
                        title={t('tbl.delete')}
                      >
                        <IconTrash size={15} />
                      </span>
                    )}
                  </div>
                  <p className="min-h-[40px] flex-1 text-sm text-slate-500 dark:text-slate-400">
                    {p.description || t('proj.noDesc')}
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                      {c.requirements ?? 0} {t('proj.stat.reqs')}
                    </span>
                    <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300">
                      {c.testCases ?? 0} {t('proj.stat.tests')}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {c.links ?? 0} {t('proj.stat.links')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-brand-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brand-400">
                    {t('proj.open')} <IconChevron size={14} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
