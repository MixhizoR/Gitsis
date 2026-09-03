// ============================================================================
//  GlossaryForm.jsx  —  Sozluk terimi olustur / duzenle.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function GlossaryForm({ open, onClose, editing }) {
  const { addGlossary, editGlossary } = useApp()
  const { t } = useLang()
  const [form, setForm] = useState({ term: '', definition: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(editing)

  useEffect(() => {
    if (!open) return
    setError('')
    setForm({ term: editing?.term || '', definition: editing?.definition || '' })
  }, [open, editing])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.term.trim()) return setError(t('glo.termRequired'))
    setSaving(true)
    try {
      if (isEdit) await editGlossary(editing.id, form)
      else await addGlossary(form)
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
      title={isEdit ? t('glo.editTitle') : t('glo.newTitle')}
      subtitle={isEdit ? editing?.text_id : t('glo.fill')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('form.cancel')}
          </button>
          <button
            type="submit"
            form="glo-form"
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? t('form.saving') : isEdit ? t('form.saveChanges') : t('form.create')}
          </button>
        </>
      }
    >
      <form id="glo-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}
        <div>
          <label className="label">{t('glo.term')}</label>
          <input
            className="input"
            value={form.term}
            onChange={set('term')}
            placeholder={t('glo.termPh')}
          />
        </div>
        <div>
          <label className="label">{t('glo.definition')}</label>
          <textarea
            className="input min-h-[96px] resize-y"
            value={form.definition}
            onChange={set('definition')}
            placeholder={t('glo.definitionPh')}
          />
        </div>
      </form>
    </Modal>
  )
}
