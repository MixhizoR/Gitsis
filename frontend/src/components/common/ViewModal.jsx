// ============================================================================
//  ViewModal.jsx  —  Goz (Read) ikonuyla acilan detay modali.
//  Ust kisimda meta bilgiler (tip/alan/oncelik/durum/DAL); altta zengin metin
//  editorlu ACIKLAMA alani. Yazma izni yoksa veya kayit kilitliyse salt-okunur.
//  Aciklama kaydi onSaveDescription(row, html) ile ust bilesene iletilir.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import RichTextEditor from './RichTextEditor.jsx'
import { StatusBadge, PriorityBadge, TypeBadge, DalBadge } from './Badge.jsx'
import { IconCheck } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

export default function ViewModal({ open, row, canWrite = false, showStatus = true, onClose, onSaveDescription, statusLabel: _statusLabel }) {
  const { t } = useLang()
  const [html, setHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const editable = canWrite && !row?.locked

  useEffect(() => {
    if (open) setHtml(row?.description || '')
  }, [open, row])

  if (!row) return null

  const save = async () => {
    setSaving(true)
    try {
      await onSaveDescription?.(row, html)
      onClose?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${row.text_id} — ${row.title}`}
      subtitle={t('view.title')}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{t('view.close')}</button>
          {editable && (
            <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
              <IconCheck size={16} /> {saving ? t('view.saving') : t('view.save')}
            </button>
          )}
        </div>
      }
    >
      {/* Meta bilgiler */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {row.type && <TypeBadge value={row.type} />}
        {row.priority && <PriorityBadge value={row.priority} />}
        {showStatus && row.status && <StatusBadge value={row.status} />}
        {row.dal_level && <DalBadge value={row.dal_level} />}
        {row.field && (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {row.field}
          </span>
        )}
      </div>

      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('view.description')}</span>
        {!editable && <span className="text-[11px] text-slate-400">{t('view.readonly')}</span>}
      </div>
      <RichTextEditor value={html} onChange={setHtml} readOnly={!editable} />
    </Modal>
  )
}
