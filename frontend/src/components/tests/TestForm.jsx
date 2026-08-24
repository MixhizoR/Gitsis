// ============================================================================
//  TestForm.jsx  —  Test senaryosu olustur / duzenle formu.
//    - TIP KILITLI: her test sayfasi kendi tipini dayatir (Acceptance / System
//      / Sub-system).
//    - Alan / Oncelik / DAL / Test Sonucu ARTIK ELLE girilir. Bir gereksinime
//      Verifies bagi kurmak bu degerleri OTOMATIK doldurmaz (bir test birden
//      fazla gereksinimi dogrulayabilir; otomatik kopyalama anlamsizdir).
//    - text_id SUNUCUDA uretilir.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { TypeBadge } from '../common/Badge.jsx'
import { IconPlus } from '../common/Icons.jsx'
import {
  PRIORITIES,
  DAL_LEVELS,
  PRIORITY,
  DAL,
  STATUS,
  TEST_STATUS_OPTIONS,
  TEST_STATUS_LABELS,
} from '../../utils/constants.js'

export default function TestForm({ open, onClose, editing, pageConfig }) {
  const { addTestCase, editTestCase, fields, addField } = useApp()
  const { t } = useLang()
  const lockedType = pageConfig?.lockedType

  const EMPTY = {
    title: '',
    description: '',
    field: '',
    priority: PRIORITY.MEDIUM,
    dal_level: DAL.C,
    status: STATUS.IN_REVIEW,
  }

  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(editing)

  useEffect(() => {
    if (!open) return
    setError('')
    if (editing) {
      setForm({
        title: editing.title || '',
        description: editing.description || '',
        field: editing.field || '',
        priority: editing.priority || PRIORITY.MEDIUM,
        dal_level: editing.dal_level || DAL.C,
        status: editing.status || STATUS.IN_REVIEW,
      })
    } else {
      setForm(EMPTY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // Yeni alan (Field) ekle — dinamik disiplin secenegi.
  const handleAddField = async () => {
    const name = window.prompt(t('field.addPrompt'))
    if (!name || !name.trim()) return
    try {
      const f = await addField(name.trim())
      setForm((prev) => ({ ...prev, field: f.name }))
    } catch (err) {
      setError(err.message || t('form.saveError'))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return setError(t('form.titleRequired'))
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        field: form.field || null,
        priority: form.priority,
        dal_level: form.dal_level,
        status: form.status,
      }
      if (isEdit) await editTestCase(editing.id, payload)
      else await addTestCase({ ...payload, type: lockedType })
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
      title={isEdit ? t('test.editTitle') : pageConfig?.addLabel || t('test.newTitle')}
      subtitle={isEdit ? editing?.text_id : t('test.fill')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('form.cancel')}
          </button>
          <button
            type="submit"
            form="test-form"
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.create')}
          </button>
        </>
      }
    >
      <form id="test-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label">{t('form.titleLabel')}</label>
            <input
              className="input"
              value={form.title}
              onChange={set('title')}
              placeholder={t('test.titlePh')}
            />
          </div>
          <div>
            <label className="label">{t('form.type')}</label>
            <div className="flex h-[42px] items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800/50">
              <TypeBadge value={lockedType} />
            </div>
          </div>
        </div>

        <div>
          <label className="label">{t('form.desc')}</label>
          <textarea
            className="input min-h-[96px] resize-y"
            value={form.description}
            onChange={set('description')}
            placeholder={t('test.descPh')}
          />
        </div>

        {/* Alan (dinamik) + Oncelik + DAL + Test Sonucu (hepsi elle) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="label flex items-center justify-between">
              <span>{t('form.field')}</span>
              <button
                type="button"
                onClick={handleAddField}
                className="inline-flex items-center gap-0.5 text-[11px] font-bold text-brand-600 hover:underline dark:text-brand-400"
                title={t('field.add')}
              >
                <IconPlus size={12} /> {t('field.add')}
              </button>
            </label>
            <select className="input" value={form.field} onChange={set('field')}>
              <option value="">{t('form.fieldNone')}</option>
              {fields.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('form.priority')}</label>
            <select className="input" value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('form.dal')}</label>
            <select className="input" value={form.dal_level} onChange={set('dal_level')}>
              {DAL_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('tbl.th.testResult')}</label>
            <select className="input" value={form.status} onChange={set('status')}>
              {TEST_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {TEST_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>
    </Modal>
  )
}
