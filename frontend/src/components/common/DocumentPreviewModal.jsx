// ============================================================================
//  DocumentPreviewModal.jsx  —  Belgeyi SAYFA ICINDE goruntuler (indirmeden).
//
//  Iki farkli yol izlenir, cunku iki bicim tarayicida farkli calisir:
//   * PDF   : dosya Blob olarak cekilir (Authorization basligi gerektigi icin
//             dogrudan <iframe src="/api/..."> KULLANILAMAZ), object URL'e
//             cevrilip <iframe>'e verilir; tarayicinin yerlesik PDF
//             goruntuleyicisi devreye girer — ek kutuphane gerekmez.
//   * Excel : backend /preview ucu dosyayi (ExcelJS ile) satir dizisine cevirir
//             ve burada tablo olarak cizilir. Boylece frontend'e xlsx ayristirma
//             kutuphanesi eklenmez; .xls (eski ikili bicim) onizlenemez, o
//             durumda backend 415 doner ve kullaniciya "indirin" denir.
//
//  Object URL bellek sizintisi yapmasin diye kapanista revoke edilir.
// ============================================================================
import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { IconDownload, IconLoader, IconAlert } from './Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { downloadDocument, previewDocument } from '../../services/dataService.js'

/** Excel onizlemesi: sayfa (sheet) sekmeleri + tablo. */
function SheetView({ data }) {
  const { t } = useLang()
  const [active, setActive] = useState(0)
  const sheets = data?.sheets || []
  const sheet = sheets[active]

  if (sheets.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">{t('docs.previewEmpty')}</p>
  }

  return (
    <div className="space-y-3">
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
          {sheets.map((s, i) => (
            <button
              key={s.name + i}
              onClick={() => setActive(i)}
              className={
                'rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold transition-colors ' +
                (i === active
                  ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50')
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {(sheet?.rows || []).map((row, ri) => (
              <tr
                key={ri}
                className={
                  ri === 0
                    ? 'bg-slate-50 font-semibold dark:bg-slate-800/60'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }
              >
                {/* Satir numarasi — Excel'deki gibi sol sutun. */}
                <td className="w-10 select-none border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-[11px] font-mono text-slate-400 dark:border-slate-700 dark:bg-slate-800/60">
                  {ri + 1}
                </td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="max-w-xs truncate px-3 py-1.5 text-slate-700 dark:text-slate-200"
                    title={cell}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(sheet?.truncatedRows || sheet?.truncatedCols || data?.truncatedSheets) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t('docs.previewTruncated', {
            rows: sheet?.rows?.length || 0,
            total: sheet?.totalRows || 0,
          })}
        </p>
      )}
    </div>
  )
}

export default function DocumentPreviewModal({ open, doc, projectId, onClose, onDownload }) {
  const { t } = useLang()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [sheetData, setSheetData] = useState(null)

  const isPdf = doc?.ext === '.pdf'

  useEffect(() => {
    if (!open || !doc) return
    let cancelled = false
    let objectUrl = null

    setLoading(true)
    setError(null)
    setPdfUrl(null)
    setSheetData(null)
    ;(async () => {
      try {
        if (doc.ext === '.pdf') {
          const blob = await downloadDocument(projectId, doc.id)
          if (cancelled) return
          objectUrl = URL.createObjectURL(blob)
          setPdfUrl(objectUrl)
        } else {
          const data = await previewDocument(projectId, doc.id)
          if (cancelled) return
          setSheetData(data)
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || t('docs.previewError'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      // Object URL'i serbest birak (bellek sizintisi olmasin).
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, doc, projectId, t])

  if (!open || !doc) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={doc.fileName}
      subtitle={t('docs.previewSub')}
      maxWidth="max-w-6xl"
      footer={
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => onDownload?.(doc)} className="btn-secondary">
            <IconDownload size={17} className="mr-2" /> {t('docs.download')}
          </button>
          <button onClick={onClose} className="btn-primary">
            {t('common.close')}
          </button>
        </div>
      }
    >
      {loading && (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
          <IconLoader size={20} className="animate-spin" />
          <span className="text-sm">{t('docs.previewLoading')}</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <IconAlert size={32} className="text-amber-500" />
          <p className="text-sm text-slate-600 dark:text-slate-300">{error}</p>
          <button onClick={() => onDownload?.(doc)} className="btn-secondary">
            <IconDownload size={17} className="mr-2" /> {t('docs.download')}
          </button>
        </div>
      )}

      {!loading && !error && isPdf && pdfUrl && (
        <iframe
          src={pdfUrl}
          title={doc.fileName}
          data-testid="pdf-preview-frame"
          className="h-[65vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
        />
      )}

      {!loading && !error && !isPdf && sheetData && <SheetView data={sheetData} />}
    </Modal>
  )
}
