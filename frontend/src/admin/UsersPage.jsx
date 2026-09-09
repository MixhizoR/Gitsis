// ============================================================================
//  UsersPage.jsx — Admin konsolu: kullanıcı yönetimi (Issue #90).
//  AdminLayout altında çalışır; /api/admin/users uçlarını kullanır.
//  Proje ekranlarından tamamen ayrıktır (admin persona ayrımı).
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import {
  createUser,
  listUsers,
  unlockUser,
  updateUser,
  deleteUser,
  listSystemRoles,
} from '../services/adminService.js'

// Issue #101: rol `<select>` sabit ROLE_OPTIONS yerine aktif SystemRole
// listesinden beslenir; backend `roleKey`'den display adi turettigi icin
// forma ayrica `role` gonderilmez.
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
//  Issue #101: rol secimi SystemRole listesinden beslenir; forma `roleKey`
//  gonderilir, backend display `role` adini kendisi tureter.
function UserForm({ mode, user, roles, onClose, onSaved }) {
  const { t } = useLang()
  const isEdit = mode === 'edit'
  const activeRoles = (roles || []).filter((r) => r.isActive)
  const defaultRoleKey = activeRoles[0]?.key || user?.roleKey || 'system_engineer'
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    name: user?.name || '',
    roleKey: user?.roleKey || defaultRoleKey,
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
        roleKey: form.roleKey,
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
              value={form.roleKey}
              onChange={(e) => set('roleKey', e.target.value)}
            >
              {[
                ...new Set([
                  ...(roles || []).filter((r) => r.isActive).map((r) => r.key),
                  form.roleKey,
                ]),
              ]
                .filter(Boolean)
                .map((k) => {
                  const found = (roles || []).find((r) => r.key === k)
                  return (
                    <option key={k} value={k}>
                      {found ? found.name : k}
                    </option>
                  )
                })}
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

// ---- Kullanici tablosu ------------------------------------------------------
export default function UsersPage() {
  const { t } = useLang()
  const { currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null) // { mode, user }

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [u, r] = await Promise.all([listUsers(), listSystemRoles()])
      setUsers(u)
      setRoles(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const onUnlock = async (id) => {
    try {
      await unlockUser(id)
      await reload()
    } catch (e) {
      setError(e.message)
    }
  }

  // Aktif <-> devre disi gecisi (backend PATCH isActive).
  const onToggleActive = async (u) => {
    try {
      await updateUser(u.id, { isActive: !u.isActive })
      await reload()
    } catch (e) {
      setError(e.message)
    }
  }

  // Kalici silme — kendi hesabi ve ADMIN'ler korumali (backend da korur).
  const onDelete = async (u) => {
    if (!window.confirm(t('admin.deleteConfirm', { username: u.username }))) return
    try {
      await deleteUser(u.id)
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

      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setModal({ mode: 'create', user: null })}>
          {t('admin.newUser')}
        </button>
      </div>

      {loading ? (
        <div className="card text-sm text-slate-500">{t('admin.loading')}</div>
      ) : (
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
              {users.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={7}>
                    {t('admin.noLogs')}
                  </td>
                </tr>
              )}
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
                    <div className="flex flex-wrap gap-2">
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
                      {u.systemRole !== 'ADMIN' && (
                        <button
                          className="btn-secondary !px-2.5 !py-1 text-xs"
                          onClick={() => onToggleActive(u)}
                        >
                          {u.isActive ? t('admin.deactivate') : t('admin.activate')}
                        </button>
                      )}
                      {u.systemRole !== 'ADMIN' && u.id !== currentUser?.id && (
                        <button
                          className="btn-ghost !px-2.5 !py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                          onClick={() => onDelete(u)}
                        >
                          {t('admin.delete')}
                        </button>
                      )}
                    </div>
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
          roles={roles}
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
