// src/pages/TraceabilityImportPage.jsx
import React, { useState } from 'react'
import { useProject } from '../context/ProjectContext.jsx'
import { upload } from '../services/apiClient'

export function TraceabilityImportPage() {
  const { activeProjectId } = useProject()
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) return alert('Lütfen bir dosya seçin!')
    if (!activeProjectId) return alert('Aktif proje bulunamadı!')

    const formData = new FormData()
    formData.append('file', file)

    setLoading(true)
    setMessage(null)

    try {
      // apiClient üzerinden istek atılır:
      // baseURL ("http://localhost:4001/api") + "/traceability/import?pid=..."
      const result = await upload(`/traceability/import?pid=${activeProjectId}`, formData)

      setMessage({ type: 'success', text: result?.message || 'İçe aktarma başarılı!' })
      setFile(null)
    } catch (err) {
      // apiClient.js toError vasıtasıyla backend'in fırlattığı gerçek hatayı yakalar
      console.error('İçe aktarma hatası:', err)
      setMessage({ type: 'error', text: err.message || 'Sunucu ile iletişim kurulamadı.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Traceability Matrix İçe Aktar (Import)</h1>
      <p className="text-gray-600 text-sm mb-6">
        Excel formatındaki izlenebilirlik matrisinizi yükleyerek gereksinim ve test senaryoları arasındaki bağlantıları otomatik oluşturabilirsiniz.
      </p>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
        <input
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileChange}
          className="mb-4 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
        />

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="btn-primary px-6 py-2 rounded-md font-bold disabled:opacity-50"
        >
          {loading ? 'Yükleniyor...' : 'Excel\'i İçe Aktar'}
        </button>
      </div>

      {message && (
        <div className={`mt-4 p-4 rounded-md text-sm ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}
    </div>
  )
}