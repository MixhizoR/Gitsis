// frontend/src/pages/TraceabilityImportPage.jsx
import { useState } from 'react'
import { useProject } from '../context/ProjectContext.jsx'
import { upload } from '../services/apiClient'
import { importReqIF } from '../services/dataService'
import { REQ_TYPES, REQ_TYPE } from '../utils/constants'

const REQIF_EXTENSIONS = ['.reqif', '.reqifz', '.xml']
const EXCEL_EXTENSIONS = ['.xlsx', '.xls']

function isReqifFile(fileName) {
  return REQIF_EXTENSIONS.some((ext) => fileName.endsWith(ext))
}
function isExcelFile(fileName) {
  return EXCEL_EXTENSIONS.some((ext) => fileName.endsWith(ext))
}

export function TraceabilityImportPage() {
  const { activeProjectId } = useProject()
  const [file, setFile] = useState(null)
  const [importType, setImportType] = useState(REQ_TYPE.USER)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [warnings, setWarnings] = useState([])

  const fileName = file ? file.name.toLowerCase() : ''
  const showTypeSelector = isReqifFile(fileName)

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setMessage(null)
      setWarnings([])
    }
  }

  const handleUpload = async () => {
    if (!file) return setMessage({ type: 'error', text: 'Lütfen bir dosya seçin!' })
    if (!activeProjectId) return setMessage({ type: 'error', text: 'Aktif proje bulunamadı!' })

    setLoading(true)
    setMessage(null)
    setWarnings([])

    try {
      if (isReqifFile(fileName)) {
        // .reqif / .reqifz (ZIP) / .xml — ikili guvenli multipart yukleme;
        // sikistirilmis .reqifz backend'de imza (magic bytes) ile taninir.
        const result = await importReqIF(activeProjectId, file, importType)

        const stats = result?.stats || {}
        const created = stats.importedRequirements ?? 0
        const updated = stats.updatedRequirements ?? 0
        const retired = stats.retiredRequirements ?? 0
        const linkCount = stats.importedLinks ?? 0
        const skippedLinks = stats.skippedLinks ?? 0

        const parts = [`${created} yeni gereksinim`]
        if (updated > 0) parts.push(`${updated} güncellendi`)
        // Kaynak sistemde (DOORS/ReqIF) silinmis olarak isaretlenmis nesneler
        // gorunur bir kayit olarak eklenmez; sadece numaralari (text_id)
        // Gitsis'te gercekten silinmis bir gereksinim gibi emekliye ayrilir.
        if (retired > 0) parts.push(`${retired} numara emekliye ayrıldı (kaynakta silinmiş)`)
        parts.push(`${linkCount} izlenebilirlik bağı eklendi`)
        if (skippedLinks > 0) parts.push(`${skippedLinks} bağ atlandı`)

        setMessage({
          type: 'success',
          text: `ReqIF başarıyla içe aktarıldı! (${parts.join(', ')})`,
        })
        setWarnings(Array.isArray(result?.warnings) ? result.warnings : [])
      } else if (isExcelFile(fileName)) {
        const formData = new FormData()
        formData.append('file', file)

        const result = await upload(`/projects/${activeProjectId}/traceability/import`, formData)
        setMessage({
          type: 'success',
          text: result?.message || 'Excel matrisi içe aktarma başarılı!',
        })
      } else {
        throw new Error(
          'Desteklenmeyen dosya türü! Lütfen .reqif, .reqifz, .xml veya .xlsx formatında bir dosya yükleyin.',
        )
      }

      setFile(null)
    } catch (err) {
      console.error('İçe aktarma hatası:', err)
      const errorMsg = err.response?.data?.error || err.message || 'Sunucu ile iletişim kurulamadı.'
      setMessage({ type: 'error', text: errorMsg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Gereksinim & İzlenebilirlik İçe Aktar</h1>
      <p className="text-gray-600 text-sm mb-6">
        Excel (.xlsx, .xls) matrisi veya ReqIF (.reqif, .reqifz, .xml — IBM DOORS ve diğer araçlarla
        uyumlu) dosyası yükleyerek gereksinimleri ve aralarındaki bağlantıları sisteme
        aktarabilirsiniz.
      </p>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
        <input
          type="file"
          accept=".xlsx, .xls, .reqif, .reqifz, .xml"
          onChange={handleFileChange}
          data-testid="import-file-input"
          className="mb-4 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
        />

        {showTypeSelector && (
          <div className="mb-4 text-left max-w-xs mx-auto">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Dosyadaki gereksinimler hangi seviyede?
            </label>
            <select
              value={importType}
              onChange={(e) => setImportType(e.target.value)}
              data-testid="import-type-select"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-600"
            >
              {REQ_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Çoğu DOORS/ReqIF modülü tek bir hiyerarşi seviyesini temsil eder. Aynı projeye önce
              User, sonra System, sonra Software/Hardware modüllerini sırayla aktarırsanız
              aralarındaki Satisfies bağları otomatik kurulur.
            </p>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="btn-primary px-6 py-2 rounded-md font-bold disabled:opacity-50"
        >
          {loading ? 'İşleniyor...' : 'Dosyayı İçe Aktar'}
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 p-4 rounded-md text-sm ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 p-4 rounded-md text-sm bg-amber-50 text-amber-800 border border-amber-200">
          <p className="font-semibold mb-1">Uyarılar ({warnings.length}):</p>
          <ul className="list-disc list-inside space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
