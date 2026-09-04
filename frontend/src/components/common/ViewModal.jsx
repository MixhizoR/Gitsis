// ============================================================================
//  ViewModal.jsx  —  Goz (Read) ikonuyla acilan detay modali.
//  Ust kisimda meta bilgiler (tip/alan/oncelik/durum/DAL); altta zengin metin
//  editorlu ACIKLAMA alani. Yazma izni yoksa veya kayit kilitliyse salt-okunur.
//  Aciklama kaydi onSaveDescription(row, html) ile ust bilesene iletilir.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import RichTextEditor from './RichTextEditor.jsx'
import HistoryTab from './HistoryTab.jsx'
import { StatusBadge, PriorityBadge, TypeBadge, DalBadge } from './Badge.jsx'
import { IconCheck } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { useApp } from '../../context/AppContext.jsx'

const BUILTIN_KEYS = new Set(['priority', 'dal_level'])

export default function ViewModal({
  open,
  row,
  canWrite = false,
  showStatus = true,
  // Issue #57: gereksinimlerde salt okunur "Gecmis" (versiyon) sekmesi.
  // Yalnizca kaynagi gereksinim olan sayfalar (Hierarchy) iletir; testlerin
  // backend'de versiyon gecmisi yoktur, bu yuzden varsayilan false'dur.
  showHistory = false,
  onClose,
  onSaveDescription,
  statusLabel: _statusLabel,
}) {
  const { t } = useLang()
  const { attributeDefs } = useApp()
  const [html, setHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('detail')
  const editable = canWrite && !row?.locked

  useEffect(() => {
    if (open) setHtml(row?.description || '')
  }, [open, row])

  // Yeni kayit acildiginda her zaman Detay sekmesinden basla.
  useEffect(() => {
    if (open) setTab('detail')
  }, [open, row?.id])

  if (!row) return null

  const customAttrEntries = Object.entries(row.attributes || {}).filter(
    ([k, v]) => !BUILTIN_KEYS.has(k) && v !== null && v !== undefined && v !== '',
  )
  const labelFor = (key) => attributeDefs.find((d) => d.key === key)?.label || key

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
          <button onClick={onClose} className="btn-secondary">
            {t('view.close')}
          </button>
          {tab === 'detail' && editable && (
            <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
              <IconCheck size={16} /> {saving ? t('view.saving') : t('view.save')}
            </button>
          )}
        </div>
      }
    >
      {showHistory && (
        <div
          className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/70"
          role="tablist"
        >
          <button
            role="tab"
            aria-selected={tab === 'detail'}
            onClick={() => setTab('detail')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === 'detail'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {t('view.tab.detail')}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === 'history'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {t('view.tab.history')}
          </button>
        </div>
      )}

      {tab === 'history' && row ? (
        <HistoryTab row={row} />
      ) : (
        <>
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
            {customAttrEntries.map(([k, v]) => (
              <span
                key={k}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                title={labelFor(k)}
              >
                {labelFor(k)}: {String(v)}
              </span>
            ))}
          </div>

          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('view.description')}
            </span>
            {!editable && <span className="text-[11px] text-slate-400">{t('view.readonly')}</span>}
          </div>
          <RichTextEditor value={html} onChange={setHtml} readOnly={!editable} />
        </>
      )}
    </Modal>
  )
}
