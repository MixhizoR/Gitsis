// ============================================================================
//  DocumentLibrary.jsx  —  "Dökümanlar" sekmesi: proje belge kütüphanesi.
//  Kullanıcı bilgisayarından PDF / Excel (.xlsx, .xls) belge yükler; belge
//  backend'de (PostgreSQL) saklandığı için bir kez yüklendikten sonra listede
//  kalıcı olarak görünür. Yeni yüklemeler kütüphaneye eklenir; belgeler
//  indirilebilir ve (yetkiliyse) silinebilir.
//
//  Veri akışı: UI -> dataService (listDocuments/uploadDocument/...) ->
//  apiClient -> /api/projects/:pid/documents -> Prisma -> Postgres.
//  Liste sayfa bazlı tutulur (AppContext'e taşınmaz): belge listesi büyük
//  olabilir ve yalnızca bu sayfada gereklidir.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProject } from '../context/ProjectContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { formatDateTime } from '../utils/format.js'
import ReasonModal from '../components/common/ReasonModal.jsx'
import {
  IconDoc,
  IconUpload,
  IconDownload,
  IconTrash,
  IconSearch,
  IconLoader,
  IconAlert,
} from '../components/common/Icons.jsx'
import {
  listDocuments,
  uploadDocument,
  downloadDocument,
  deleteDocument,
} from '../services/dataService.js'

// Backend ile AYNI liste (documents.js MIME_BY_EXT) — dosya secici filtresi.
const ACCEPT = '.pdf,.xlsx,.xls'
const ALLOWED_EXT = ['.pdf', '.xlsx', '.xls']
const MAX_SIZE = 20 * 1024 * 1024

const extOf = (name) => {
  const i = String(name || '').lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

/** Bayt -> okunabilir boyut (1 ondalık). */
function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Uzantıya göre renkli tip rozeti. */
function TypeBadge({ ext }) {
  const isPdf = ext === '.pdf'
  const cls = isPdf
    ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
  return (
    <span className={`rounded-md px-2 py-1 text-[11px] font-bold uppercase ${cls}`}>
      {(ext || '').replace('.', '') || '—'}
    </span>
  )
}

export default function DocumentLibrary() {
  const { activeProjectId } = useProject()
  const { isPM, can } = useAuth()
  const { t } = useLang()
  const fileRef = useRef(null)

  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [busyId, setBusyId] = useState(null)
  // Silme oncesi zorunlu gerekce (izlenebilirlik) — bkz. ReasonModal.
  const [deleteTarget, setDeleteTarget] = useState(null)

  const canDelete = isPM || can('delete')

  const reload = useCallback(async () => {
    if (!activeProjectId) return
    setLoading(true)
    try {
      setDocs(await listDocuments(activeProjectId))
      setError(null)
    } catch (e) {
      setError(e?.message || t('docs.loadError'))
    } finally {
      setLoading(false)
    }
  }, [activeProjectId, t])

  useEffect(() => {
    reload()
  }, [reload])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    if (!q) return docs
    return docs.filter((d) =>
      [d.fileName, d.description, d.uploadedBy]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase('tr-TR').includes(q)),
    )
  }, [docs, query])

  const totalSize = useMemo(() => docs.reduce((s, d) => s + (d.size || 0), 0), [docs])

  // --- Yükleme --------------------------------------------------------------
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    setError(null)
    setNotice(null)

    const invalid = files.filter((f) => !ALLOWED_EXT.includes(extOf(f.name)))
    if (invalid.length) {
      setError(t('docs.errType', { name: invalid.map((f) => f.name).join(', ') }))
      return
    }
    const tooBig = files.filter((f) => f.size > MAX_SIZE)
    if (tooBig.length) {
      setError(t('docs.errSize', { name: tooBig.map((f) => f.name).join(', ') }))
      return
    }

    setUploading(true)
    setProgress(0)
    let done = 0
    try {
      // Birden fazla dosya seçilirse sırayla yüklenir; her biri kütüphaneye eklenir.
      for (const file of files) {
        await uploadDocument(activeProjectId, file, '', (p) =>
          setProgress(Math.round(((done + p / 100) / files.length) * 100)),
        )
        done += 1
      }
      setNotice(t('docs.uploaded', { count: files.length }))
      await reload()
    } catch (e) {
      setError(e?.message || t('docs.uploadError'))
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (!uploading) handleFiles(e.dataTransfer?.files)
  }

  // --- İndirme / silme ------------------------------------------------------
  const handleDownload = async (doc) => {
    setError(null)
    setBusyId(doc.id)
    try {
      const blob = await downloadDocument(activeProjectId, doc.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e?.message || t('docs.downloadError'))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = (doc) => {
    setError(null)
    setDeleteTarget(doc)
  }
  const confirmDelete = async (reason) => {
    const doc = deleteTarget
    setBusyId(doc.id)
    try {
      await deleteDocument(activeProjectId, doc.id, reason)
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
      setNotice(t('docs.deleted', { name: doc.fileName }))
      setDeleteTarget(null)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Başlık + özet */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('page.documentLibrary.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('docs.summary', { count: docs.length, size: formatSize(totalSize) })}
          </p>
        </div>
        <div className="relative sm:w-72">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('docs.searchPh')}
            className="input w-full !pl-9"
          />
        </div>
      </div>

      {/* Yükleme alanı (tıkla veya sürükle-bırak) */}
      <div className="card p-4">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          data-testid="document-file-input"
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={
            'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors disabled:opacity-60 ' +
            (dragOver
              ? 'border-brand-500 bg-brand-50/70 dark:border-brand-400 dark:bg-brand-900/20'
              : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-brand-500')
          }
        >
          {uploading ? (
            <IconLoader size={26} className="animate-spin text-brand-500" />
          ) : (
            <IconUpload size={26} className="text-brand-500" />
          )}
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {uploading ? t('docs.uploading', { p: progress }) : t('docs.uploadBtn')}
          </span>
          <span className="text-xs text-slate-400">{t('docs.uploadHint')}</span>
        </button>

        {uploading && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
            <IconAlert size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && !error && (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            {notice}
          </div>
        )}
      </div>

      {/* Kütüphane listesi */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
            <IconLoader size={20} className="animate-spin" />
            <span className="text-sm">{t('docs.loading')}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
            <IconDoc size={40} />
            <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-300">
              {docs.length === 0 ? t('docs.emptyTitle') : t('docs.noMatch')}
            </h3>
            <p className="max-w-md text-center text-sm">
              {docs.length === 0 ? t('docs.emptyDesc') : t('docs.noMatchDesc')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                <tr>
                  <th className="w-full px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('docs.thName')}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('docs.thType')}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('docs.thSize')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('docs.thUploadedBy')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('docs.thUploadedAt')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('docs.thActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filtered.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="w-full max-w-0 px-6 py-4">
                      <div className="flex items-center gap-3">
                        <IconDoc size={18} className="shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900 dark:text-white">
                            {doc.fileName}
                          </div>
                          {doc.description && (
                            <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                              {doc.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <TypeBadge ext={doc.ext} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {formatSize(doc.size)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {doc.uploadedBy || t('common.unknown')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {formatDateTime(doc.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={busyId === doc.id}
                          className="btn-ghost btn-sm"
                          title={t('docs.download')}
                        >
                          <IconDownload size={17} />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(doc)}
                            disabled={busyId === doc.id}
                            className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                            title={t('docs.delete')}
                          >
                            <IconTrash size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ReasonModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemLabel={deleteTarget?.fileName}
      />
    </div>
  )
}
