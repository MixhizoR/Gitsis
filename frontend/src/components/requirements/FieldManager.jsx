// ============================================================================
//  FieldManager.jsx  —  Projeye ait dinamik "Alan" (disiplin) yonetimi.
//  Yeni alan ekle / mevcut alani sil. Alanlar kalici (backend) ve projeye ozel.
// ============================================================================
import { useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { IconPlus, IconTrash } from '../common/Icons.jsx'

export default function FieldManager({ open, onClose }) {
  const { fields, addField, removeField } = useApp()
  const { t } = useLang()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setError('')
    try {
      await addField(name.trim())
      setName('')
    } catch (err) {
      setError(err.message || t('form.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (f) => {
    if (!window.confirm(t('field.deleteConfirm', { name: f.name }))) return
    setBusy(true); setError('')
    try {
      await removeField(f.id)
    } catch (err) {
      setError(err.message || t('form.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('field.title')}
      subtitle={t('field.subtitle')}
      footer={<button onClick={onClose} className="btn-secondary">{t('link.close')}</button>}
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}
        <form onSubmit={handleAdd} className="flex items-end gap-2.5">
          <div className="flex-1">
            <label className="label">{t('field.newLabel')}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('field.newPh')} />
          </div>
          <button type="submit" disabled={busy || !name.trim()} className="btn-primary disabled:opacity-50">
            <IconPlus size={16} /> {t('field.add')}
          </button>
        </form>

        {fields.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400 dark:bg-slate-800/50">{t('field.empty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {fields.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{f.name}</span>
                <button
                  onClick={() => handleRemove(f)}
                  disabled={busy}
                  className="btn-ghost !px-2 !py-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  title={t('tbl.delete')}
                >
                  <IconTrash size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
