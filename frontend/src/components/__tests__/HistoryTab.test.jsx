// ============================================================================
//  HistoryTab.test.jsx — Issue #57 versiyon gecmisi sekmesi component testleri.
//  AppContext mock edilir (getRequirementHistory + personnel); LanguageContext
//  gercek saglayici ile sarilir (mevcut smoke.test.jsx deseni).
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'
import HistoryTab from '../common/HistoryTab.jsx'
import ViewModal from '../common/ViewModal.jsx'

const mocks = vi.hoisted(() => ({
  getRequirementHistory: vi.fn(),
}))

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    attributeDefs: [],
    personnel: [{ id: 'pers-1', firstName: 'Onay', lastName: 'Muhendis' }],
    getRequirementHistory: mocks.getRequirementHistory,
  }),
  AppProvider: ({ children }) => children,
}))

const Wrap = ({ children }) => <LanguageProvider>{children}</LanguageProvider>

const CURRENT = {
  id: 'req-1',
  title: 'Guncel baslik',
  description: '<p>guncel aciklama</p>',
  field: null,
  attributes: { priority: 'High' },
}

// Backend sirasi: desc (en yeni once). Her satir degisiklik ONCESI durum.
const HISTORY = [
  {
    id: 'h2',
    version: 2,
    title: 'Orta baslik',
    description: '<p>orta aciklama</p>',
    field: null,
    attributes: { priority: 'Medium' },
    changedAt: '2026-09-01T10:00:00Z',
    changedBy: 'pers-1',
  },
  {
    id: 'h1',
    version: 1,
    title: 'Eski baslik',
    description: '<p>eski aciklama</p>',
    field: 'Ucus',
    attributes: { priority: 'Low' },
    changedAt: '2026-08-25T10:00:00Z',
    changedBy: 'bilinmeyen-1234',
  },
]

// globals kapali oldugu icin RTL otomatik temizlemez; DOM birikmesini onler.
afterEach(() => cleanup())

beforeEach(() => {
  mocks.getRequirementHistory.mockReset()
})

describe('HistoryTab', () => {
  it('yuklenirken loading metni gosterir', () => {
    mocks.getRequirementHistory.mockReturnValue(new Promise(() => {}))
    render(
      <Wrap>
        <HistoryTab row={CURRENT} />
      </Wrap>,
    )
    expect(screen.getByText('Geçmiş yükleniyor…')).toBeInTheDocument()
  })

  it('hata durumunda hata metni gosterir', async () => {
    mocks.getRequirementHistory.mockRejectedValue(new Error('boom'))
    render(
      <Wrap>
        <HistoryTab row={CURRENT} />
      </Wrap>,
    )
    expect(await screen.findByText('Versiyon geçmişi yüklenemedi.')).toBeInTheDocument()
  })

  it('bos gecmiste bos durum gosterir', async () => {
    mocks.getRequirementHistory.mockResolvedValue([])
    render(
      <Wrap>
        <HistoryTab row={CURRENT} />
      </Wrap>,
    )
    expect(await screen.findByText('Henüz versiyon kaydı yok.')).toBeInTheDocument()
  })

  it('versiyon satirlarini + degisen alan rozetlerini gosterir', async () => {
    mocks.getRequirementHistory.mockResolvedValue(HISTORY)
    render(
      <Wrap>
        <HistoryTab row={CURRENT} />
      </Wrap>,
    )
    expect(await screen.findByText('v2')).toBeInTheDocument()
    expect(screen.getByText('v1')).toBeInTheDocument()
    // v2 vs guncel: title + priority degisti; v1 vs v2: title + field + priority
    expect(screen.getAllByText('Başlık / Tanım')).toHaveLength(2)
    expect(screen.getAllByText('Öncelik')).toHaveLength(2)
    expect(screen.getAllByText('Alan')).toHaveLength(1)
    // Personel ad-soyad cozulur; bilinmeyen id kisaltilir
    expect(screen.getByText('Onay Muhendis')).toBeInTheDocument()
    expect(screen.getByText('bilinmey')).toBeInTheDocument()
  })

  it('satira tiklayinca surum detayi (snapshot) acilir', async () => {
    mocks.getRequirementHistory.mockResolvedValue(HISTORY)
    render(
      <Wrap>
        <HistoryTab row={CURRENT} />
      </Wrap>,
    )
    fireEvent.click(await screen.findByLabelText('Sürümü görüntüle v1'))
    expect(screen.getByText('Eski baslik')).toBeInTheDocument()
    expect(screen.getByText('Ucus')).toBeInTheDocument()
    expect(screen.getByText('priority: Low')).toBeInTheDocument()
    expect(screen.getByText('eski aciklama')).toBeInTheDocument()
  })
})

describe('ViewModal — Geçmiş sekmesi', () => {
  it('showHistory verilmezse sekme cubugu gosterilmez (testler icin geriye donuk)', () => {
    render(
      <Wrap>
        <ViewModal
          open
          row={{ id: 'tc-1', text_id: 'TC-001', title: 'Test', type: 'System Test' }}
          onClose={() => {}}
        />
      </Wrap>,
    )
    expect(screen.queryByText('Geçmiş')).not.toBeInTheDocument()
  })

  it('showHistory verilirse sekme cubugu gorunur ve Geçmiş acilir', async () => {
    mocks.getRequirementHistory.mockResolvedValue([])
    render(
      <Wrap>
        <ViewModal
          open
          row={{ id: 'req-1', text_id: 'REQ-001', title: 'Gereksinim', type: 'System Requirement' }}
          showHistory
          onClose={() => {}}
        />
      </Wrap>,
    )
    expect(screen.getByText('Detay')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Geçmiş'))
    expect(await screen.findByText('Henüz versiyon kaydı yok.')).toBeInTheDocument()
  })
})
