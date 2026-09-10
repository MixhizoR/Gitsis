// ============================================================================
//  RolesAdminPage.jsx — Admin konsolu: sistem rolleri + izin yönetimi (#101).
//  Sabit çekirdek roller (PM/SE/Dev/Admin) silinemez; pasifleştirilebilir.
//  Özel roller (isSystem=false) admin tarafından oluşturulabilir/silinebilir.
//  İzin düzenleme, proje tarafındaki 12 kademeli PermissionEditor ile yapılır.
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useLang } from '../context/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import PermissionEditor from '../components/roles/PermissionEditor.jsx'
import {
  createSystemRole,
  deleteSystemRole,
  listSystemRoles,
  updateSystemRole,
} from '../services/adminService.js'

function enabledCount(permissions) {
  if (!permissions) return 0
  return Object.values(permissions).filter((p) => p?.enabled).length
}

// ---- Yeni (ozel) rol olusturma modal'i --------------------------------------
function CreateRoleModal({ onClose, onCreated }) {
  const { t } = useLang()
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createSystemRole({ key: key.trim().toLowerCase(), name: name.trim() })
      onCreated()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
          {t('rolesAdmin.createTitle')}
        </h2>
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}
        <div>
          <label className="label">{t('rolesAdmin.key')}</label>
          <input
            className="input font-mono"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="qa_engineer"
            required
            pattern="[a-z0-9_-]{2,32}"
            title="a-z 0-9 _ - (2-32 karakter)"
          />
          <p className="mt-1 text-[11px] text-slate-400">{t('rolesAdmin.keyHint')}</p>
        </div>
        <div>
          <label className="label">{t('rolesAdmin.name')}</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="QA Mühendisi"
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('admin.cancel')}
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {t('admin.create')}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---- Ana bilesen: rol tablosu ------------------------------------------------
export default function RolesAdminPage() {
  const { t } = useLang()
  const { currentUser } = useAuth()
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // SystemRole
  const [creating, setCreating] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRoles(await listSystemRoles())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const onToggleActive = async (r) => {
    try {
      await updateSystemRole(r.key, { isActive: !r.isActive })
      await reload()
    } catch (e) {
      setError(e.message)
    }
  }

  const onDelete = async (r) => {
    if (!window.confirm(t('rolesAdmin.deleteConfirm', { name: r.name }))) return
    try {
      await deleteSystemRole(r.key)
      await reload()
    } catch (e) {
      setError(e.message)
    }
  }

  const onSavePermissions = async (r, perms) => {
    await updateSystemRole(r.key, { permissions: perms })
    await reload()
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('rolesAdmin.subtitle')}</p>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          {t('rolesAdmin.newRole')}
        </button>
      </div>

      {loading ? (
        <div className="card text-sm text-slate-500">{t('admin.loading')}</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">{t('rolesAdmin.name')}</th>
                <th className="px-4 py-3">{t('rolesAdmin.key')}</th>
                <th className="px-4 py-3">{t('rolesAdmin.permCount')}</th>
                <th className="px-4 py-3">{t('admin.status')}</th>
                <th className="px-4 py-3">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-400" colSpan={5}>
                    {t('admin.noLogs')}
                  </td>
                </tr>
              )}
              {roles.map((r) => (
                <tr
                  key={r.key}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                    {r.name}
                    {r.isSystem && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {t('rolesAdmin.system')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.key}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                    {enabledCount(r.permissions)} / 12
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        r.isActive
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {r.isActive ? t('admin.active') : t('admin.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-secondary !px-2.5 !py-1 text-xs"
                        onClick={() => setEditing(r)}
                      >
                        {t('rolesAdmin.editPerms')}
                      </button>
                      {r.key !== 'pm' && (
                        <button
                          className="btn-secondary !px-2.5 !py-1 text-xs"
                          onClick={() => onToggleActive(r)}
                        >
                          {r.isActive ? t('admin.deactivate') : t('admin.activate')}
                        </button>
                      )}
                      {!r.isSystem && r.key !== currentUser?.roleKey && (
                        <button
                          className="btn-ghost !px-2.5 !py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                          onClick={() => onDelete(r)}
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

      {editing && (
        <PermissionEditor
          open
          role={editing}
          onClose={() => setEditing(null)}
          onSave={(perms) => onSavePermissions(editing, perms)}
        />
      )}
      {creating && (
        <CreateRoleModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            reload()
          }}
        />
      )}
    </div>
  )
}
