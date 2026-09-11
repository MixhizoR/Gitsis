import { useState } from 'react'
import { IconDownload, IconClose, IconLoader } from '../common/Icons.jsx'
import { http } from '../../services/apiClient.js'
import { REQ_TYPES } from '../../utils/constants.js'

export function ExportModal({ isOpen, onClose, projectId }) {
  const [isLoading, setIsLoading] = useState(false)
  const [exportFormat, setExportFormat] = useState('matrix')
  const [reqifLayer, setReqifLayer] = useState('all')
  const [reqifFileFormat, setReqifFileFormat] = useState('reqif')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleExport = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      let endpoint
      let defaultFilename
      if (exportFormat === 'reqif') {
        const params = new URLSearchParams()
        if (reqifLayer !== 'all') params.set('layer', reqifLayer)
        params.set('format', reqifFileFormat)
        endpoint = `/projects/${projectId}/traceability/export/reqif?${params.toString()}`
        const base = reqifLayer === 'all' ? 'Export' : reqifLayer.replace(/\s+/g, '_')
        defaultFilename = `Gitsis_${base}.${reqifFileFormat}`
      } else {
        endpoint =
          exportFormat === 'matrix'
            ? `/projects/${projectId}/traceability/export/matrix`
            : `/projects/${projectId}/traceability/export/detailed`
        defaultFilename = `Traceability_${new Date().getTime()}.xlsx`
      }

      const response = await http.get(endpoint, {
        responseType: 'blob',
        validateStatus: (status) => status >= 200 && status < 300,
      })

      const blob = response.data
      const url = window.URL.createObjectURL(blob)

      const contentDisposition = response.headers['content-disposition']
      let filename = defaultFilename
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="([^"]+)"/)
        if (match) filename = match[1]
      }

      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err) {
      console.error('Export hatası:', err)
      const msg =
        err?.response?.data instanceof Blob
          ? 'Export başarısız oldu'
          : err.message || 'Bilinmeyen bir hata oluştu'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <IconDownload size={20} />
            Dışa Aktar
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <IconClose size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Format Seçimi */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Export Formatı</label>
            <div className="space-y-2">
              <label
                className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                style={{
                  borderColor: exportFormat === 'matrix' ? '#3b82f6' : '#e5e7eb',
                }}
              >
                <input
                  type="radio"
                  name="format"
                  value="matrix"
                  checked={exportFormat === 'matrix'}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="ml-3">
                  <span className="font-medium">Standart Matrix</span>
                  <p className="text-xs text-gray-500">
                    Gereksinimler, testler ve ilişkileri içeren detaylı tablo
                  </p>
                </span>
              </label>

              <label
                className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                style={{
                  borderColor: exportFormat === 'detailed' ? '#3b82f6' : '#e5e7eb',
                }}
              >
                <input
                  type="radio"
                  name="format"
                  value="detailed"
                  checked={exportFormat === 'detailed'}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="ml-3">
                  <span className="font-medium">Detaylı Rapor</span>
                  <p className="text-xs text-gray-500">
                    İleri ve geri izlenebilirlik bilgileriyle özet rapor
                  </p>
                </span>
              </label>

              <label
                className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                style={{
                  borderColor: exportFormat === 'reqif' ? '#3b82f6' : '#e5e7eb',
                }}
              >
                <input
                  type="radio"
                  name="format"
                  value="reqif"
                  checked={exportFormat === 'reqif'}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="ml-3">
                  <span className="font-medium">ReqIF (DOORS)</span>
                  <p className="text-xs text-gray-500">
                    Gereksinim + test senaryolarını DOORS'a aktarılabilir formatta, kayıpsız
                    geri-aktarılabilir şekilde dışa aktarır
                  </p>
                </span>
              </label>
            </div>
          </div>

          {/* ReqIF alt secenekleri */}
          {exportFormat === 'reqif' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Kapsam</label>
                <select
                  value={reqifLayer}
                  onChange={(e) => setReqifLayer(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="all">Tüm katmanlar + testler (tek dosya)</option>
                  {REQ_TYPES.map((t) => (
                    <option key={t} value={t}>
                      Yalnızca: {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Dosya Formatı
                </label>
                <select
                  value={reqifFileFormat}
                  onChange={(e) => setReqifFileFormat(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="reqif">.reqif (düz XML)</option>
                  <option value="reqifz">.reqifz (sıkıştırılmış)</option>
                </select>
              </div>
            </div>
          )}

          {/* Bilgi Kutusu */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              💡 <strong>İpucu:</strong>{' '}
              {exportFormat === 'reqif'
                ? "Dosya DOORS'a aktarıldıktan sonra tekrar Gitsis'e yüklenirse başlık, açıklama, alan, yazar, öznitelikler ve Satisfies/Verifies bağları kayıpsız geri gelir."
                : 'Dosya tüm gereksinimler ve test bağlantılarını içerecektir. Özet sayfası kapsama oranını gösterecektir.'}
            </p>
          </div>

          {/* Hata Mesajı */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">❌ {error}</p>
            </div>
          )}

          {/* Başarı Mesajı */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">✓ Export başarıyla tamamlandı!</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            İptal
          </button>
          <button
            onClick={handleExport}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <IconLoader size={18} className="animate-spin" />
                Aktarılıyor...
              </>
            ) : (
              <>
                <IconDownload size={18} />
                Aktar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
