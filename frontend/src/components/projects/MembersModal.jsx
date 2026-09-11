// ============================================================================
//  MembersModal.jsx — Issue #103: PM proje uyeliklerini yonetir.
//  Mevcut uyeler tablosu + aktif, PM-olmayan kullanicilar arasindan arama ve
//  ekleme/cikarma. Yetki backend'te requirePM ile cift kilitlidir.
// ============================================================================
import { useEffect, useState, useMemo } from 'react'
import Modal from '../common/Modal.jsx'
import { IconSearch, IconPlus, IconTrash } from '../common/Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { clearanceDisplay } from '../../utils/clearance.js'
import {
  listMembers,
  addMember,
  removeMember,
  listUserDirectory,
} from '../../services/dataService.js'

export default function MembersModal({ open, project, onClose }) {
  const { t } = useLang()
  const [members, setMembers] = useState([])
  const [directory, setDirectory] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const refresh = async () => {
    if (!project) return
    setLoading(true)
    setError('')
    try {
      const [m, d] = await Promise.all([listMembers(project.id), listUserDirectory()])
      setMembers(m)
      setDirectory(d)
    } catch (err) {
      setError(err.message || t('member.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !project) return
    setSearch('')
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id])

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId || m.id)), [members])
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = directory.filter((u) => !memberIds.has(u.id))
    if (!q) return rows
    return rows.filter((u) =>
      [u.name, u.username, u.roleName, u.roleKey]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [directory, memberIds, search])

  const handleAdd = async (u) => {
    setBusyId(u.id)
    setError('')
    try {
      await addMember(project.id, u.id)
      await refresh()
    } catch (err) {
      setError(err.message || t('member.loadError'))
    } finally {
      setBusyId(null)
    }
  }

  const handleRemove = async (m) => {
    const name = m.name || m.username || m.userId
    if (!window.confirm(t('member.removeConfirm', { name }))) return
    setBusyId(m.userId || m.id)
    setError('')
    try {
      await removeMember(project.id, m.userId || m.id)
      await refresh()
    } catch (err) {
      setError(err.message || t('member.loadError'))
    } finally {
      setBusyId(null)
    }
  }

  const joinedDate = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    return isNaN(d) ? '-' : d.toLocaleDateString()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('member.title')}
      subtitle={project ? `${project.name} — ${t('member.subtitle')}` : t('member.subtitle')}
      footer={
        <button type="button" onClick={onClose} className="btn-primary">
          {t('form.cancel')}
        </button>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('member.members')}
            </h4>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {members.length}
            </span>
          </div>
          {loading && members.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
            </div>
          ) : members.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
              {t('member.noMembers')}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t('member.user')}</th>
                    <th className="px-3 py-2 font-semibold">{t('member.role')}</th>
                    <th className="px-3 py-2 font-semibold">{t('member.clearance')}</th>
                    <th className="px-3 py-2 font-semibold">{t('member.joined')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {members.map((m) => (
                    <tr key={m.userId || m.id} className="text-slate-700 dark:text-slate-200">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{m.name || '-'}</div>
                        <div className="text-xs text-slate-400">@{m.username}</div>
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold">
                        {m.roleName || m.roleKey || '-'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 font-bold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                          {clearanceDisplay(m.clearanceLevel ?? 1, t)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">{joinedDate(m.joinedAt)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemove(m)}
                          disabled={busyId === (m.userId || m.id)}
                          className="btn-ghost !px-2 !py-1 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title={t('member.remove')}
                        >
                          <IconTrash size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('member.addUser')}
            </h4>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {candidates.length}
            </span>
          </div>
          <div className="relative mb-3">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input !pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('member.searchPh')}
            />
          </div>
          {candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 py-4 text-center text-sm text-slate-400 dark:border-slate-700">
              {t('member.noCandidates')}
            </p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {candidates.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {u.name || '-'}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      @{u.username} · {u.roleName || u.roleKey || '-'} ·{' '}
                      {clearanceDisplay(u.clearanceLevel ?? 1, t)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdd(u)}
                    disabled={busyId === u.id}
                    className="btn-secondary !px-2.5 !py-1.5 text-xs"
                  >
                    <IconPlus size={14} /> {t('member.add')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
