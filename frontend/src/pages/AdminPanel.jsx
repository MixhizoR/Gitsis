// ============================================================================
//  AdminPanel.jsx — Issue #90: Admin paneli (kullanici yonetimi + denetim).
//  Yalnizca systemRole='ADMIN' oturumunda gorunur/erisilebilir. Backend #88
//  API'lerini (users CRUD, unlock, audit-logs) kullanir.
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import {
  listUsers,
  createUser,
  updateUser,
  unlockUser,
  listAuditLogs,
} from '../services/adminService.js'

const ROLE_OPTIONS = ['System Engineer', 'Developer', 'Proje Yöneticisi']
const SYSTEM_ROLES = ['USER', 'ADMIN']

function statusOf(u) {
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) return 'locked'
  if (!u.isActive) return 'inactive'
  return 'active'
}

function StatusBadge({ u, t }) {
  const s = statusOf(u)
  const cls =
    s === 'locked'
      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
      : s === 'inactive'
        ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
  const label =
    s === 'locked' ? t('admin.locked') : s === 'inactive' ? t('admin.inactive') : t('admin.active')
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>
}

// ---- Kullanici olusturma/duzenleme formu (modal) ---------------------------
function UserForm({ mode, user, onClose, onSaved }) {
  const { t } = useLang()
  const isEdit = mode === 'edit'
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    name: user?.name || '',
    role: user?.role || ROLE_OPTIONS[0],
    systemRole: user?.systemRole || 'USER',
    clearanceLevel: user?.clearanceLevel ?? 1,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        role: form.role,
        systemRole: form.systemRole,
        clearanceLevel: Number(form.clearanceLevel),
      }
      if (form.password) body.password = form.password
      if (isEdit) {
        await updateUser(user.id, body)
      } else {
        body.username = form.username.trim()
        body.password = form.password
        await createUser(body)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
          {isEdit ? t('admin.editTitle') : t('admin.createTitle')}
        </h2>
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}
        {!isEdit && (
          <div>
            <label className="label">{t('admin.username')}</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
              required
            />
          </div>
        )}
        <div>
          <label className="label">{t('admin.name')}</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">{t('admin.password')}</label>
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            required={!isEdit}
            autoComplete="new-password"
          />
          {isEdit && <p className="mt-1 text-[11px] text-slate-400">{t('admin.passwordHint')}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('admin.role')}</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
            >
              {[...new Set([...ROLE_OPTIONS, form.role])].filter(Boolean).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('admin.systemRole')}</label>
            <select
              className="input"
              value={form.systemRole}
              onChange={(e) => set('systemRole', e.target.value)}
            >
              {SYSTEM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">{t('admin.clearance')}</label>
          <input
            className="input"
            type="number"
            min="1"
            max="5"
            value={form.clearanceLevel}
            onChange={(e) => set('clearanceLevel', e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('admin.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {isEdit ? t('admin.save') : t('admin.create')}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---- Ana bilesen -----------------------------------------------------------
export default function AdminPanel() {
  const { currentUser } = useAuth()
  const { t } = useLang()
  const isAdmin = currentUser?.systemRole === 'ADMIN'
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null) // { mode, user }

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [u, l] = await Promise.all([listUsers(), listAuditLogs({ limit: 200 })])
      setUsers(u)
      setLogs(l)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) reload()
  }, [isAdmin, reload])

  if (!isAdmin) {
    return <div className="card text-sm font-medium text-slate-500">{t('admin.unauthorized')}</div>
  }

  const onUnlock = async (id) => {
    try {
      await unlockUser(id)
      await reload()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Sekmeler + yeni kullanici */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { key: 'users', label: t('admin.users') },
            { key: 'logs', label: t('admin.auditLogs') },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-all ${
                tab === key
                  ? 'bg-white shadow text-slate-900 dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'users' && (
          <button className="btn-primary" onClick={() => setModal({ mode: 'create', user: null })}>
            {t('admin.newUser')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="card text-sm text-slate-500">{t('admin.loading')}</div>
      ) : tab === 'users' ? (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">{t('admin.username')}</th>
                <th className="px-4 py-3">{t('admin.name')}</th>
                <th className="px-4 py-3">{t('admin.role')}</th>
                <th className="px-4 py-3">{t('admin.systemRole')}</th>
                <th className="px-4 py-3">{t('admin.clearance')}</th>
                <th className="px-4 py-3">{t('admin.status')}</th>
                <th className="px-4 py-3">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                    {u.username}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{u.name}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{u.role}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{u.systemRole}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {u.clearanceLevel}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge u={u} t={t} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary !px-2.5 !py-1 text-xs"
                        onClick={() => setModal({ mode: 'edit', user: u })}
                      >
                        {t('admin.edit')}
                      </button>
                      {statusOf(u) === 'locked' && (
                        <button
                          className="btn-secondary !px-2.5 !py-1 text-xs"
                          onClick={() => onUnlock(u.id)}
                        >
                          {t('admin.unlock')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">{t('admin.date')}</th>
                <th className="px-4 py-3">{t('admin.action')}</th>
                <th className="px-4 py-3">{t('admin.user')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={3}>
                    {t('admin.noLogs')}
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-200">
                    {l.action}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {l.metadata?.username || l.metadata?.targetUsername || l.userId || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <UserForm
          mode={modal.mode}
          user={modal.user}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            reload()
          }}
        />
      )}
    </div>
  )
}
