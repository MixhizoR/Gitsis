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
import CommentsTab from '../comments/CommentsTab.jsx'
import { useComments } from '../../hooks/useComments.js'
import { StatusBadge, PriorityBadge, TypeBadge, DalBadge } from './Badge.jsx'
import { IconCheck } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { useApp } from '../../context/AppContext.jsx'
import { getDisplayLabel } from '../../utils/format.js'

const BUILTIN_KEYS = new Set(['priority', 'dal_level'])

export default function ViewModal({
  open,
  row,
  canWrite = false,
  showStatus = true,
  // Kaynak dokuman satirina tiklandiginda cagirilir (dokumani acip pasaji
  // vurgulamak icin). Verilmezse "Kaynak" satiri salt bilgi olarak gosterilir.
  onOpenSource,
  // Yorumlar sekmesi: 'requirement' | 'testcase' | 'glossary'. Verilmezse
  // sekme HIC gosterilmez (yorumu olmayan varliklar icin).
  commentEntityType = null,
  // Issue #57: gereksinimlerde salt okunur "Gecmis" (versiyon) sekmesi.
  // Yalnizca kaynagi gereksinim olan sayfalar (Hierarchy) iletir; testlerin
  // backend'de versiyon gecmisi yoktur, bu yuzden varsayilan false'dur.
  showHistory = false,
  onClose,
  onSaveDescription,
  statusLabel: _statusLabel,
}) {
  const { t } = useLang()
  const { attributeDefs, projectId } = useApp()
  const [html, setHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('detail')
  const editable = canWrite && !row?.locked
  // Yorumlar burada (sekmede degil) cekilir: sekme ROZETI, sekme acilmadan
  // once yorum sayisini gosterebilsin.
  const showComments = Boolean(commentEntityType)
  const commentsApi = useComments(
    projectId,
    showComments ? commentEntityType : null,
    showComments ? row?.id : null,
  )
  const showTabs = showHistory || showComments

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
      title={`${row.text_id} — ${getDisplayLabel(row).text}`}
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
      {showTabs && (
        <div
          className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/70"
          role="tablist"
        >
          {[
            { key: 'detail', label: t('view.tab.detail'), show: true },
            { key: 'history', label: t('view.tab.history'), show: showHistory },
            {
              key: 'comments',
              // Rozet: yorum varsa sayisi baslikta gosterilir.
              label: commentsApi.comments.length
                ? t('view.tab.commentsCount', { n: commentsApi.comments.length })
                : t('view.tab.comments'),
              show: showComments,
            },
          ]
            .filter((x) => x.show)
            .map((x) => (
              <button
                key={x.key}
                role="tab"
                aria-selected={tab === x.key}
                onClick={() => setTab(x.key)}
                data-testid={`view-tab-${x.key}`}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  tab === x.key
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {x.label}
              </button>
            ))}
        </div>
      )}

      {tab === 'comments' && showComments ? (
        <CommentsTab
          comments={commentsApi.comments}
          loading={commentsApi.loading}
          error={commentsApi.error}
          onAdd={commentsApi.add}
          onDelete={commentsApi.remove}
        />
      ) : tab === 'history' && showHistory && row ? (
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

          {/* Kaynak izlenebilirligi: dokumandan metin secilerek olusturulduysa.
              Dokuman SILINMIS olsa bile (sourceDocumentId null'a duser) alinti
              ve dokuman adi kopyasi kaldigi icin kaynak gorunur kalir. */}
          {(row.sourceDocumentId || row.sourceQuote) && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('view.source')}
                </span>
                {row.sourceDocumentId ? (
                  <button
                    type="button"
                    onClick={() => onOpenSource?.(row)}
                    disabled={!onOpenSource}
                    data-testid="view-source-open"
                    className="text-sm font-semibold text-brand-600 hover:underline disabled:cursor-default disabled:text-slate-600 disabled:no-underline dark:text-brand-400 dark:disabled:text-slate-300"
                  >
                    {row.sourceDocumentName || t('view.sourceDocument')}
                  </button>
                ) : (
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {t('view.sourceDeleted', { name: row.sourceDocumentName || '—' })}
                  </span>
                )}
              </div>
              {row.sourceQuote && (
                <p className="mt-1 line-clamp-3 text-xs italic text-slate-600 dark:text-slate-400">
                  “{row.sourceQuote}”
                </p>
              )}
            </div>
          )}

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
