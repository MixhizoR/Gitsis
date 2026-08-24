import React, { useState } from 'react'
import { Download, X, Loader } from 'lucide-react'
import { get } from '../../services/apiClient'

export function ExportModal({ isOpen, onClose, projectId }) {
  const [isLoading, setIsLoading] = useState(false)
  const [exportFormat, setExportFormat] = useState('matrix')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleExport = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const token = JSON.parse(localStorage.getItem('ehsim_auth_session') || '{}').token
      const endpoint =
        exportFormat === 'matrix'
          ? `/traceability/export/matrix?pid=${projectId}`
          : `/traceability/export/detailed?pid=${projectId}`

      const response = await fetch(
        `http://localhost:4001/api${endpoint}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`  // ← Adicione o token
          }
        }
      )

      if (!response.ok) {
        throw new Error('Export başarısız oldu')
      }

      // Dosyayı indir
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      // Content-Disposition header'ından dosya adını al
      const contentDisposition = response.headers.get('content-disposition')
      let filename = `Traceability_${new Date().getTime()}.xlsx`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="([^"]+)"/)
        if (match) filename = match[1]
      }

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
      setError(err.message || 'Bilinmeyen bir hata oluştu')
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
            <Download size={20} />
            Excel'e Aktar
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Format Seçimi */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Export Formatı
            </label>
            <div className="space-y-2">
              <label
                className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                style={{
                  borderColor:
                    exportFormat === 'matrix' ? '#3b82f6' : '#e5e7eb',
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
                  borderColor:
                    exportFormat === 'detailed' ? '#3b82f6' : '#e5e7eb',
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
            </div>
          </div>

          {/* Bilgi Kutusu */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              💡 <strong>İpucu:</strong> Dosya tüm gereksinimler ve test
              bağlantılarını içerecektir. Özet sayfası kapsama oranını
              gösterecektir.
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
              <p className="text-sm text-green-800">
                ✓ Export başarıyla tamamlandı!
              </p>
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
                <Loader size={18} className="animate-spin" />
                Aktarılıyor...
              </>
            ) : (
              <>
                <Download size={18} />
                Aktar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}