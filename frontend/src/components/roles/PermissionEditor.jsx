// ============================================================================
//  PermissionEditor.jsx  —  Bir rolün 12 kademeli iznini düzenleme modalı.
//  Her izin bir açma/kapama düğmesi + (toggle olmayanlar için) hangi hiyerarşi
//  bileşenlerini kapsadığını seçen dinamik alt-panel içerir.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { IconCheck } from '../common/Icons.jsx'
import { PERMISSION_DEFS, scopeComponents, emptyPermissions } from '../../utils/permissions.js'

// Gelen izinleri tam sema ile birlestir (eksik anahtarlari tamamla).
function normalize(perms) {
  const base = emptyPermissions()
  if (!perms) return base
  for (const def of PERMISSION_DEFS) {
    const p = perms[def.key]
    if (!p) continue
    base[def.key] =
      def.scope === 'toggle'
        ? { enabled: Boolean(p.enabled) }
        : {
            enabled: Boolean(p.enabled),
            components: Array.isArray(p.components) ? [...p.components] : [],
          }
  }
  return base
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        on ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
      }`}
      aria-pressed={on}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  )
}

export default function PermissionEditor({ open, role, onClose, onSave }) {
  const [perms, setPerms] = useState(emptyPermissions())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setPerms(normalize(role?.permissions))
  }, [open, role])

  const setEnabled = (key, on) => setPerms((p) => ({ ...p, [key]: { ...p[key], enabled: on } }))

  const toggleComponent = (key, compKey) =>
    setPerms((p) => {
      const cur = p[key].components || []
      const next = cur.includes(compKey) ? cur.filter((c) => c !== compKey) : [...cur, compKey]
      return { ...p, [key]: { ...p[key], components: next } }
    })

  const setAllComponents = (key, comps, all) =>
    setPerms((p) => ({
      ...p,
      [key]: { ...p[key], components: all ? comps.map((c) => c.key) : [] },
    }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(perms)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!role) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`İzinleri Yönet — ${role.name}`}
      subtitle="12 kademeli izin ve her izin için kapsam bileşenlerini seçin."
      maxWidth="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            <IconCheck size={16} /> {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      }
    >
      <div className="max-h-[60vh] space-y-2.5 overflow-y-auto pr-1">
        {PERMISSION_DEFS.map((def) => {
          const state = perms[def.key]
          const comps = scopeComponents(def.scope)
          const hasPanel = def.scope !== 'toggle'
          const selected = state.components || []
          const allOn = hasPanel && comps.length > 0 && comps.every((c) => selected.includes(c.key))
          return (
            <div
              key={def.key}
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-100 text-[11px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                      {def.num}
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {def.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{def.desc}</p>
                </div>
                <Toggle on={state.enabled} onChange={(v) => setEnabled(def.key, v)} />
              </div>

              {hasPanel && state.enabled && (
                <div className="mt-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Kapsam bileşenleri
                    </span>
                    <button
                      type="button"
                      onClick={() => setAllComponents(def.key, comps, !allOn)}
                      className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {allOn ? 'Hiçbiri' : 'Tümü'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    {comps.map((c) => {
                      const on = selected.includes(c.key)
                      return (
                        <label
                          key={c.key}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            on
                              ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-300'
                              : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-brand-600"
                            checked={on}
                            onChange={() => toggleComponent(def.key, c.key)}
                          />
                          {c.label}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
