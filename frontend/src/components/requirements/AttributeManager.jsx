// ============================================================================
//  AttributeManager.jsx  —  Projeye ait modular oznitelik (Priority, DAL
//  Level, ve ozel alanlar) yonetimi. FieldManager.jsx ile ayni desen:
//  yeni oznitelik ekle / mevcut olani sil. Gomulu (system) oznitelikler
//  (Priority, DAL Level) silinemez ama listede gorunur.
//  Degerler backend'de tek bir JSONB kolonda (`attributes`) saklanir; yeni
//  bir oznitelik eklemek herhangi bir sema degisikligi gerektirmez.
// ============================================================================
import { useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { IconPlus, IconTrash } from '../common/Icons.jsx'

const DATA_TYPES = ['text', 'number', 'boolean', 'date', 'select']
const ENTITY_TYPES = ['both', 'requirement', 'testcase']

export default function AttributeManager({ open, onClose }) {
  const { attributeDefs, addAttribute, removeAttribute } = useApp()
  const { t } = useLang()
  const [label, setLabel] = useState('')
  const [entityType, setEntityType] = useState('both')
  const [dataType, setDataType] = useState('text')
  const [options, setOptions] = useState('')
  const [required, setRequired] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const resetForm = () => {
    setLabel('')
    setEntityType('both')
    setDataType('text')
    setOptions('')
    setRequired(false)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!label.trim()) return
    setBusy(true)
    setError('')
    try {
      const payload = { label: label.trim(), entityType, dataType, required }
      if (dataType === 'select') {
        payload.options = options
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
      await addAttribute(payload)
      resetForm()
    } catch (err) {
      setError(err.message || t('form.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (a) => {
    if (a.system) {
      setError(t('attr.deleteSystemBlocked'))
      return
    }
    if (!window.confirm(t('attr.deleteConfirm', { name: a.label }))) return
    setBusy(true)
    setError('')
    try {
      await removeAttribute(a.id)
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
      title={t('attr.title')}
      subtitle={t('attr.subtitle')}
      footer={
        <button onClick={onClose} className="btn-secondary">
          {t('link.close')}
        </button>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleAdd} className="space-y-2.5 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label className="label">{t('attr.newLabel')}</label>
              <input
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('attr.newPh')}
              />
            </div>
            <div>
              <label className="label">{t('attr.entityType')}</label>
              <select className="input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                {ENTITY_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`attr.entityType.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('attr.dataType')}</label>
              <select className="input" value={dataType} onChange={(e) => setDataType(e.target.value)}>
                {DATA_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {t(`attr.dataType.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {t('attr.required')}
              </label>
            </div>
          </div>

          {dataType === 'select' && (
            <div>
              <label className="label">{t('attr.options')}</label>
              <input
                className="input"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder={t('attr.optionsPh')}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !label.trim() || (dataType === 'select' && !options.trim())}
            className="btn-primary disabled:opacity-50"
          >
            <IconPlus size={16} /> {t('attr.add')}
          </button>
        </form>

        {attributeDefs.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400 dark:bg-slate-800/50">
            {t('attr.empty')}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {attributeDefs.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{a.label}</span>
                    {a.system && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                        {t('attr.system')}
                      </span>
                    )}
                    {a.required && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {t('attr.required')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t(`attr.entityType.${a.entityType}`)} · {t(`attr.dataType.${a.dataType}`)}
                    {a.dataType === 'select' && a.options?.length
                      ? ` · ${a.options.map((o) => o.label).join(', ')}`
                      : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(a)}
                  disabled={busy || a.system}
                  className="btn-ghost !px-2 !py-1 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-rose-950/40"
                  title={a.system ? t('attr.deleteSystemBlocked') : t('tbl.delete')}
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
