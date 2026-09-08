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

vi.mock('../../services/dataService.js', () => ({
  listDocuments: (...a) => listDocuments(...a),
  uploadDocument: (...a) => uploadDocument(...a),
  deleteDocument: (...a) => deleteDocument(...a),
  downloadDocument: (...a) => downloadDocument(...a),
}))

vi.mock('../../context/ProjectContext.jsx', () => ({
  useProject: () => ({ activeProjectId: 'proj-1' }),
  ProjectProvider: ({ children }) => children,
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
})
