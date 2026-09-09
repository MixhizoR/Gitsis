// ============================================================================
//  documentLibrary.test.jsx — "Dökümanlar" sekmesi (DocumentLibrary) testleri.
//  Kapsam: kütüphanenin listelenmesi, PDF/Excel yükleme akışı ve geçersiz
//  dosya tipinin reddi.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const listDocuments = vi.fn()
const uploadDocument = vi.fn()
const deleteDocument = vi.fn()
const downloadDocument = vi.fn()
const previewDocument = vi.fn()

vi.mock('../../services/dataService.js', () => ({
  listDocuments: (...a) => listDocuments(...a),
  uploadDocument: (...a) => uploadDocument(...a),
  deleteDocument: (...a) => deleteDocument(...a),
  downloadDocument: (...a) => downloadDocument(...a),
  previewDocument: (...a) => previewDocument(...a),
}))

vi.mock('../../context/ProjectContext.jsx', () => ({
  useProject: () => ({ activeProjectId: 'proj-1' }),
  ProjectProvider: ({ children }) => children,
}))

const refresh = vi.fn()

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({ refresh: (...a) => refresh(...a) }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ isPM: true, can: vi.fn(() => true) }),
  AuthProvider: ({ children }) => children,
}))

const Wrap = ({ children }) => <LanguageProvider>{children}</LanguageProvider>

const DOC = {
  id: 'doc-1',
  fileName: 'EHKAHVESGD001_Sistem_Gereksinim_Dokumani_v1.0.pdf',
  ext: '.pdf',
  mimeType: 'application/pdf',
  size: 110594,
  description: '',
  uploadedBy: 'Eren Mutaf',
  createdAt: '2026-01-15T10:00:00.000Z',
}

const makeFile = (name, type) => new File(['icerik'], name, { type })

async function renderPage() {
  const DocumentLibrary = (await import('../DocumentLibrary.jsx')).default
  return render(
    <Wrap>
      <DocumentLibrary />
    </Wrap>,
  )
}

describe('DocumentLibrary — belge kütüphanesi', () => {
  // vitest globals kapali oldugu icin otomatik cleanup yok; DOM'u elle temizle.
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    listDocuments.mockResolvedValue([])
    uploadDocument.mockResolvedValue({ ...DOC })
    previewDocument.mockResolvedValue({ kind: 'spreadsheet', sheets: [], totalSheets: 0 })
    // jsdom object URL API'sini uygulamaz; tarayicida yerlesik olan bu iki
    // fonksiyonu taklit ediyoruz (React cleanup'i da revoke cagirdigi icin
    // test govdesi bitince geri alinmamalilar).
    URL.createObjectURL = vi.fn(() => 'blob:test-pdf')
    URL.revokeObjectURL = vi.fn()
  })

  it('kütüphane boşken bilgilendirme gösterir', async () => {
    await renderPage()
    expect(await screen.findByText(/Henüz belge yok/i)).toBeInTheDocument()
    expect(listDocuments).toHaveBeenCalledWith('proj-1')
  })

  it('daha önce yüklenmiş belgeleri listeler (kalıcılık)', async () => {
    listDocuments.mockResolvedValue([DOC])
    await renderPage()
    expect(await screen.findByText(DOC.fileName)).toBeInTheDocument()
    expect(screen.getByText('Eren Mutaf')).toBeInTheDocument()
    expect(screen.getByText('108.0 KB')).toBeInTheDocument()
  })

  it('seçilen PDF dosyasını yükler ve listeyi tazeler', async () => {
    const { container } = await renderPage()
    await screen.findByText(/Henüz belge yok/i)
    // Yükleme sonrasi liste artik belgeyi dondurur.
    listDocuments.mockResolvedValue([DOC])

    const input = container.querySelector('[data-testid="document-file-input"]')
    const file = makeFile('rapor.pdf', 'application/pdf')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1))
    expect(uploadDocument.mock.calls[0][0]).toBe('proj-1')
    expect(uploadDocument.mock.calls[0][1]).toBe(file)
    expect(await screen.findByText(DOC.fileName)).toBeInTheDocument()
  })

  it('PDF/Excel dışındaki dosyayı yüklemeden reddeder', async () => {
    const { container } = await renderPage()
    await screen.findByText(/Henüz belge yok/i)

    const input = container.querySelector('[data-testid="document-file-input"]')
    fireEvent.change(input, {
      target: { files: [makeFile('notlar.txt', 'text/plain')] },
    })

    expect(await screen.findByText(/Yalnızca PDF ve Excel/i)).toBeInTheDocument()
    expect(uploadDocument).not.toHaveBeenCalled()
  })

  it('Excel dosyasının adına tıklayınca sayfa içinde tablo önizlemesi açılır', async () => {
    const xlsxDoc = { ...DOC, id: 'doc-2', fileName: 'gereksinimler.xlsx', ext: '.xlsx' }
    listDocuments.mockResolvedValue([xlsxDoc])
    previewDocument.mockResolvedValue({
      kind: 'spreadsheet',
      fileName: xlsxDoc.fileName,
      sheets: [
        {
          name: 'Gereksinimler',
          rows: [
            ['text_id', 'Baslik'],
            ['EH-001', 'Guc dagitim karti'],
          ],
          totalRows: 2,
          truncatedRows: false,
          truncatedCols: false,
        },
      ],
      totalSheets: 1,
      truncatedSheets: false,
    })
    await renderPage()

    fireEvent.click(await screen.findByText(xlsxDoc.fileName))

    await waitFor(() => expect(previewDocument).toHaveBeenCalledWith('proj-1', xlsxDoc.id))
    // Hucre icerigi tablo olarak cizilmeli; indirme YAPILMAMALI.
    expect(await screen.findByText('Guc dagitim karti')).toBeInTheDocument()
    expect(downloadDocument).not.toHaveBeenCalled()
  })

  it('PDF adına tıklayınca dosya Blob olarak çekilip iframe ile gösterilir', async () => {
    listDocuments.mockResolvedValue([DOC])
    downloadDocument.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    const { container } = await renderPage()

    fireEvent.click(await screen.findByText(DOC.fileName))

    await waitFor(() => expect(downloadDocument).toHaveBeenCalledWith('proj-1', DOC.id))
    await waitFor(() =>
      expect(container.querySelector('[data-testid="pdf-preview-frame"]')).toBeInTheDocument(),
    )
    expect(container.querySelector('[data-testid="pdf-preview-frame"]').src).toBe('blob:test-pdf')
    // PDF backend onizleme ucundan GECMEZ.
    expect(previewDocument).not.toHaveBeenCalled()
  })

  it('önizleme açılamazsa hata gösterir ve indirme seçeneği sunar', async () => {
    const xlsxDoc = { ...DOC, id: 'doc-3', fileName: 'bozuk.xlsx', ext: '.xlsx' }
    listDocuments.mockResolvedValue([xlsxDoc])
    previewDocument.mockRejectedValue(new Error('Excel dosyasi okunamadi (bozuk olabilir).'))
    await renderPage()

    fireEvent.click(await screen.findByText(xlsxDoc.fileName))

    expect(await screen.findByText(/okunamadi/i)).toBeInTheDocument()
  })

  it('silme gerekçe formunu açar, gerekçeyle siler ve AppContext refresh tetiklenir', async () => {
    listDocuments.mockResolvedValue([DOC])
    deleteDocument.mockResolvedValue({ ok: true })
    await renderPage()
    await screen.findByText(DOC.fileName)

    fireEvent.click(screen.getByTitle('Sil'))
    const textarea = await screen.findByTestId('reason-modal-textarea')
    fireEvent.change(textarea, { target: { value: 'Yanlis belge yuklenmisti.' } })
    fireEvent.click(screen.getByTestId('reason-modal-confirm'))

    await waitFor(() => expect(deleteDocument).toHaveBeenCalledTimes(1))
    expect(deleteDocument).toHaveBeenCalledWith('proj-1', DOC.id, 'Yanlis belge yuklenmisti.')
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText(DOC.fileName)).not.toBeInTheDocument())
  })
})
