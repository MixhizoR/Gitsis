import { useState, useEffect } from 'react'
import { IconDownload, IconRefresh, IconSearch } from '../common/Icons.jsx'
import { ExportModal } from './ExportModal'
import { get } from '../../services/apiClient'

export function MatrixView({ projectId }) {
  const [matrixData, setMatrixData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)

// Matris verilerini yükle
useEffect(() => {
  // projectId değiştiğinde veya yüklendiğinde çalışır
  if (projectId) {
    loadMatrixData()
  } else {
    // projectId henüz gelmediyse yüklemeyi kapat
    setIsLoading(false)
  }
}, [projectId])

const loadMatrixData = async () => {
  if (!projectId || projectId === 'undefined') {
    setIsLoading(false)
    setError('Geçerli bir proje seçilmedi.')
    return
  }

  setIsLoading(true)
  setError(null)

  try {
    const result = await get(`/traceability/matrix`, { pid: projectId })
    
    const matrixData = result.data || result
    setMatrixData(matrixData)

  } catch (err) {
    console.error('Matris yükleme hatası:', err)
    setError(err.message || 'Veriler yüklenirken bir hata oluştu.')
  } finally {
    setIsLoading(false)
  }
}

  // Arama filtresi
  const filteredData = matrixData.filter(
    (req) =>
      req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.text_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Matris yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">❌ Hata: {error}</p>
        <button
          onClick={loadMatrixData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  // İstatistik hesapla
  const totalRequirements = matrixData.length
  const linkedRequirements = matrixData.filter(
    (r) => r.linkedTests.length > 0
  ).length
  const totalLinks = matrixData.reduce(
    (acc, r) => acc + r.linkedTests.length,
    0
  )
  const avgCoverage = totalRequirements > 0
    ? Math.round((linkedRequirements / totalRequirements) * 100)
    : 0

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3 items-center justify-between bg-white p-4 rounded-lg shadow">
        <div className="flex-1 relative">
          <IconSearch className="absolute left-3 top-3 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Gereksinim ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={loadMatrixData}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
          title="Yenile"
        >
          <IconRefresh size={20} className="text-gray-600" />
        </button>

        <button
          onClick={() => setIsExportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <IconDownload size={18} />
          Excel'e Aktar
        </button>
      </div>

      {/* Matris Tablosu */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Req ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Başlık
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Tip
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Durum
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Testler
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  Kapsama
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {searchTerm ? 'Sonuç bulunamadı' : 'Veri bulunamadı'}
                  </td>
                </tr>
              ) : (
                filteredData.map((req, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-gray-100 hover:bg-gray-50 transition"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {req.text_id}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      <div className="font-medium">{req.title}</div>
                      {req.description && (
                        <div className="text-xs text-gray-500 mt-1">
                          {req.description.substring(0, 50)}
                          {req.description.length > 50 ? '...' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {req.type}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          req.status === 'Approved'
                            ? 'bg-green-100 text-green-800'
                            : req.status === 'Rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {req.linkedTests.length === 0 ? (
                        <span className="text-red-600 font-medium text-xs">
                          Bağlantı Yok
                        </span>
                      ) : (
                        <div className="space-y-1">
                          {req.linkedTests.slice(0, 2).map((test, lidx) => (
                            <div
                              key={lidx}
                              className="text-xs bg-blue-50 px-2 py-1 rounded border border-blue-200"
                            >
                              <span className="font-medium">{test.text_id}</span>
                              {' → '}
                              {test.title}
                            </div>
                          ))}
                          {req.linkedTests.length > 2 && (
                            <div className="text-xs text-gray-500 px-2 py-1">
                              +{req.linkedTests.length - 2} daha...
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      <div
                        className={`inline-block px-3 py-1 rounded-full font-semibold text-xs ${
                          req.coverage === '100%'
                            ? 'bg-green-100 text-green-800'
                            : req.coverage === '0%'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {req.coverage}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <p className="text-2xl font-bold text-blue-600">{totalRequirements}</p>
          <p className="text-xs text-gray-600 mt-1">Toplam Gereksinim</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <p className="text-2xl font-bold text-green-600">
            {linkedRequirements}
          </p>
          <p className="text-xs text-gray-600 mt-1">İzlenen Gereksinimler</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <p className="text-2xl font-bold text-purple-600">{totalLinks}</p>
          <p className="text-xs text-gray-600 mt-1">Toplam Test Bağlantısı</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow text-center">
          <p className="text-2xl font-bold text-indigo-600">{avgCoverage}%</p>
          <p className="text-xs text-gray-600 mt-1">Ortalama Kapsama</p>
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        projectId={projectId}
      />
    </div>
  )
}