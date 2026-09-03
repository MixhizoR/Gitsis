// ============================================================================
//  Roles.jsx  —  Roller sayfası (PM'e özel). İki bölüm:
//    1) Roller: dinamik rol ekle/sil + "İzinleri Yönet" (12 kademeli izin).
//    2) Personel: Ad + Soyad + rol seç -> "Passcode Oluştur" (5 karakter, tekil).
//       Atanan kişinin adı ve passcode'u listede görünür (unutulursa kurtarma).
// ============================================================================
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import PermissionEditor from '../components/roles/PermissionEditor.jsx'
import { IconPlus, IconTrash, IconUsers, IconKey, IconCheck } from '../components/common/Icons.jsx'
import { PERMISSION_DEFS } from '../utils/permissions.js'

function enabledCount(permissions) {
  if (!permissions) return 0
  return PERMISSION_DEFS.filter((d) => permissions[d.key]?.enabled).length
}

export default function Roles() {
  const { roles, personnel, addRole, removeRole, editRole, addPersonnel, removePersonnel } =
    useApp()
  const { isPM, can } = useAuth()

  const [roleName, setRoleName] = useState('')
  const [editing, setEditing] = useState(null)
  const [pForm, setPForm] = useState({ firstName: '', lastName: '', roleId: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')

  const canManage = isPM || can('manage_roles')

  const roleById = useMemo(() => {
    const m = {}
    for (const r of roles) m[r.id] = r
    return m
  }, [roles])

  const personnelCountByRole = useMemo(() => {
    const m = {}
    for (const p of personnel) m[p.roleId] = (m[p.roleId] || 0) + 1
    return m
  }, [personnel])

  if (!canManage) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
        <IconUsers size={40} className="text-slate-300" />
        <p className="text-base font-semibold text-slate-600 dark:text-slate-300">
          Bu sayfaya erişim yetkiniz yok.
        </p>
      </div>
    )
  }

  const handleAddRole = async (e) => {
    e.preventDefault()
    if (!roleName.trim()) return
    setErr('')
    setBusy(true)
    try {
      await addRole({ name: roleName.trim() })
      setRoleName('')
    } catch (e2) {
      setErr(e2?.message || 'Rol eklenemedi.')
    } finally {
      setBusy(false)
    }
  }

  const handleAddPersonnel = async (e) => {
    e.preventDefault()
    if (!pForm.firstName.trim() || !pForm.lastName.trim() || !pForm.roleId) {
      setErr('Ad, soyad ve rol zorunlu.')
      return
    }
    setErr('')
    setBusy(true)
    try {
      await addPersonnel({
        firstName: pForm.firstName.trim(),
        lastName: pForm.lastName.trim(),
        roleId: pForm.roleId,
      })
      setPForm({ firstName: '', lastName: '', roleId: pForm.roleId })
    } catch (e2) {
      setErr(e2?.message || 'Personel eklenemedi.')
    } finally {
      setBusy(false)
    }
  }

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* yoksay */
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Roller ve Personel</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Dinamik roller tanımlayın, 12 kademeli izni yönetin ve personele benzersiz passcode
          üretin.
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {err}
        </div>
      )}

      {/* --- ROLLER --- */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Roller
        </h3>

        <form onSubmit={handleAddRole} className="flex gap-2">
          <input
            className="input !py-1.5 text-sm"
            placeholder="Yeni rol adı (örn. Tasarımcı, Testçi)"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-primary shrink-0 disabled:opacity-60"
          >
            <IconPlus size={18} /> Rol Ekle
          </button>
        </form>

        {roles.length === 0 ? (
          <div className="card py-8 text-center text-sm text-slate-400">
            Henüz rol tanımlanmadı.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((r) => (
              <div key={r.id} className="card flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      {r.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {enabledCount(r.permissions)} / {PERMISSION_DEFS.length} izin ·{' '}
                      {personnelCountByRole[r.id] || 0} personel
                    </div>
                  </div>
                  <button
                    onClick={() => removeRole(r.id)}
                    className="btn-ghost !px-2 !py-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    title="Rolü sil"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
                <button
                  onClick={() => setEditing(r)}
                  className="btn-secondary mt-1 w-full justify-center text-xs"
                >
                  İzinleri Yönet
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- PERSONEL --- */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Personel &amp; Passcode
        </h3>

        <form onSubmit={handleAddPersonnel} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            className="input !py-1.5 text-sm"
            placeholder="Ad"
            value={pForm.firstName}
            onChange={(e) => setPForm((f) => ({ ...f, firstName: e.target.value }))}
          />
          <input
            className="input !py-1.5 text-sm"
            placeholder="Soyad"
            value={pForm.lastName}
            onChange={(e) => setPForm((f) => ({ ...f, lastName: e.target.value }))}
          />
          <select
            className="input !py-1.5 text-sm"
            value={pForm.roleId}
            onChange={(e) => setPForm((f) => ({ ...f, roleId: e.target.value }))}
          >
            <option value="">Rol seçin…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy || roles.length === 0}
            className="btn-primary shrink-0 justify-center disabled:opacity-60"
          >
            <IconKey size={16} /> Passcode Oluştur
          </button>
        </form>

        {personnel.length === 0 ? (
          <div className="card py-8 text-center text-sm text-slate-400">
            Henüz personel eklenmedi.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Ad Soyad</th>
                  <th className="px-4 py-2.5 font-semibold">Rol</th>
                  <th className="px-4 py-2.5 font-semibold">Passcode</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {personnel.map((p) => (
                  <tr key={p.id} className="text-slate-700 dark:text-slate-200">
                    <td className="px-4 py-2.5 font-semibold">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.role?.name || roleById[p.roleId]?.name || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => copyCode(p.passcode)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-brand-700 hover:bg-brand-100 dark:bg-brand-950/40 dark:text-brand-300"
                        title="Kopyalamak için tıklayın"
                      >
                        {p.passcode}
                        {copied === p.passcode ? <IconCheck size={14} /> : null}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => removePersonnel(p.id)}
                        className="btn-ghost !px-2 !py-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Personeli sil"
                      >
                        <IconTrash size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PermissionEditor
        open={Boolean(editing)}
        role={editing}
        onClose={() => setEditing(null)}
        onSave={(permissions) => editRole(editing.id, { permissions })}
      />
    </div>
  )
}
