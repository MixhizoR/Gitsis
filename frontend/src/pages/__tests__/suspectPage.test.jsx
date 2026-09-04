// ============================================================================
//  suspectPage.test.jsx — Issue #57 supheli bag yonetimi sayfasi testleri.
//  AppContext (koleksiyonlar + temizleme aksiyonlari) ve AuthContext (izin)
//  mock edilir; LanguageContext gercek saglayici ile sarilir.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const state = vi.hoisted(() => ({
  requirements: [],
  testCases: [],
  links: [],
  clearSuspect: vi.fn(),
  clearLinkSuspect: vi.fn(),
  can: vi.fn(() => true),
  isPM: false,
}))

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    requirements: state.requirements,
    testCases: state.testCases,
    links: state.links,
    clearSuspect: state.clearSuspect,
    clearLinkSuspect: state.clearLinkSuspect,
  }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ can: state.can, isPM: state.isPM }),
}))

import SuspectPage from '../SuspectPage.jsx'

const REQ = {
  id: 'req-a',
  text_id: 'REQ-SYS-001',
  title: 'Sistem gereksinimi',
  type: 'System Requirement',
}
const CHILD = {
  id: 'req-b',
  text_id: 'REQ-SW-001',
  title: 'Alt gereksinim',
  type: 'Software Requirement',
}
const TC = { id: 'tc-1', text_id: 'TC-SYS-001', title: 'Test senaryosu', type: 'System Test' }

const SUSPECT_SATISFIES = {
  id: 'l1',
  fromId: 'req-a',
  toId: 'req-b',
  type: 'Satisfies',
  isSuspect: true,
}
const SUSPECT_VERIFIES = {
  id: 'l2',
  fromId: 'req-a',
  toId: 'tc-1',
  type: 'Verifies',
  isSuspect: true,
}

// globals kapali oldugu icin RTL otomatik temizlemez; her test sonrasi DOM temizlenir.
afterEach(() => cleanup())

beforeEach(() => {
  state.requirements = []
  state.testCases = []
  state.links = []
  state.can = vi.fn(() => true)
  state.isPM = false
  state.clearSuspect = vi.fn(() => Promise.resolve({ ok: true, cleared: 1 }))
  state.clearLinkSuspect = vi.fn(() => Promise.resolve({ ok: true, cleared: 1 }))
})

const Wrap = ({ children }) => <LanguageProvider>{children}</LanguageProvider>

describe('SuspectPage', () => {
  it('supheli bag yoksa bos durum gosterir', () => {
    render(
      <Wrap>
        <SuspectPage />
      </Wrap>,
    )
    expect(screen.getByText('Şüpheli bağ yok.')).toBeInTheDocument()
  })

  it('supheli gereksinimi + baglarini listeler (Satisfies + Verifies)', () => {
    state.requirements = [REQ, CHILD]
    state.testCases = [TC]
    state.links = [SUSPECT_SATISFIES, SUSPECT_VERIFIES]
    render(
      <Wrap>
        <SuspectPage />
      </Wrap>,
    )
    expect(screen.getByText('Şüpheli Gereksinimler (1)')).toBeInTheDocument()
    // REQ-SYS-001: gereksinim kartinin text_id'si + test kartinin KAYNAK alani
    expect(screen.getAllByText('REQ-SYS-001').length).toBe(2)
    expect(screen.getByText('Satisfies')).toBeInTheDocument()
    // Verifies: gereksinim kartinin hedefinde + supheli test kartinda gorunur
    expect(screen.getAllByText('Verifies')).toHaveLength(2)
    // Hedef cozumu: alt gereksinim + test
    expect(screen.getByText('REQ-SW-001')).toBeInTheDocument()
    expect(screen.getAllByText('TC-SYS-001').length).toBeGreaterThan(0)
    // Test bolumu de gorunur (testin gelen Verifies bagi suspect)
    expect(screen.getByText('Şüpheli Testler (1)')).toBeInTheDocument()
  })

  it('supheli test kartinda KAYNAK gereksinim gosterilir (kendi id degil)', () => {
    state.requirements = [REQ]
    state.testCases = [TC]
    state.links = [SUSPECT_VERIFIES]
    render(
      <Wrap>
        <SuspectPage />
      </Wrap>,
    )
    expect(screen.getByText('Şüpheli Testler (1)')).toBeInTheDocument()
    // Test kartinda test id'si: text_id + gereksinim kartinin HEDEF alani (2)
    expect(screen.getAllByText('TC-SYS-001')).toHaveLength(2)
    // Kaynak: REQ-SYS-001 (gereksinim kartinda + test kartinin kaynak alaninda)
    expect(screen.getAllByText('REQ-SYS-001')).toHaveLength(2)
  })

  it('Tumunu Temizle -> clearSuspect(requirementId) cagirir', () => {
    state.requirements = [REQ, CHILD]
    state.testCases = [TC]
    state.links = [SUSPECT_SATISFIES]
    render(
      <Wrap>
        <SuspectPage />
      </Wrap>,
    )
    fireEvent.click(screen.getByText('Tümünü Temizle'))
    expect(state.clearSuspect).toHaveBeenCalledWith('req-a')
  })

  it('tek bag temizle -> clearLinkSuspect(linkId) cagirir', () => {
    state.requirements = [REQ, CHILD]
    state.testCases = [TC]
    state.links = [SUSPECT_SATISFIES, SUSPECT_VERIFIES]
    render(
      <Wrap>
        <SuspectPage />
      </Wrap>,
    )
    fireEvent.click(screen.getAllByText('Temizle')[0])
    expect(state.clearLinkSuspect).toHaveBeenCalledWith('l1')
  })

  it('approve izni yoksa temizleme butonlari gosterilmez', () => {
    state.can = vi.fn(() => false)
    state.requirements = [REQ, CHILD]
    state.testCases = [TC]
    state.links = [SUSPECT_SATISFIES]
    render(
      <Wrap>
        <SuspectPage />
      </Wrap>,
    )
    expect(screen.queryByText('Tümünü Temizle')).not.toBeInTheDocument()
    expect(screen.queryByText('Temizle')).not.toBeInTheDocument()
    // Bilgi yine de gorunur (gereksinim kartinin text_id'si)
    expect(screen.getByText('REQ-SYS-001')).toBeInTheDocument()
  })
})
