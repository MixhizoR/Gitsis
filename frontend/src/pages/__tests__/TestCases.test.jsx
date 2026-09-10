// ============================================================================
//  TestCases.test.jsx — Ortak filtre cubugunun test senaryosu sayfasindaki
//  davranisi.
//
//  Kapsam:
//   - Tip filtresi HIC gosterilmez (sayfa daima tek test tipine kilitli)
//   - Durum filtresi burada test SONUCUDUR (gereksinimlerdeki "Dogrulanamaz"
//     ayrimi yoktur)
//   - Alan / oznitelik filtreleri + Temizle + sessionStorage kaliciligi
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const { canMock, appMock } = vi.hoisted(() => ({
  canMock: vi.fn(() => true),
  appMock: { testCases: [], fields: [], attributeDefs: [] },
}))

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    projectId: 'p-1',
    requirements: [],
    testCases: appMock.testCases,
    links: [],
    fields: appMock.fields,
    attributeDefs: appMock.attributeDefs,
    approvals: [],
    bulkRemoveTestCases: vi.fn(),
    editTestCase: vi.fn(),
    voteApproval: vi.fn(),
    unlockApproval: vi.fn(),
    rejectApproval: vi.fn(),
    getApprovalMatrix: vi.fn(),
    refresh: vi.fn(),
  }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ can: canMock, isPM: true, currentUser: { id: 'u1', name: 'PM' } }),
  AuthProvider: ({ children }) => children,
}))

vi.mock('../../components/tests/TestForm.jsx', () => ({ default: () => null }))
vi.mock('../../components/requirements/AttributeManager.jsx', () => ({ default: () => null }))
vi.mock('../../components/traceability/LinkManager.jsx', () => ({ default: () => null }))
vi.mock('../../components/common/BulkLinkModal.jsx', () => ({ default: () => null }))
vi.mock('../../components/common/ViewModal.jsx', () => ({ default: () => null }))
vi.mock('../../components/common/ReasonModal.jsx', () => ({ default: () => null }))
vi.mock('../../components/common/ApprovalMatrixModal.jsx', () => ({ default: () => null }))

import TestCases from '../TestCases.jsx'

const tc = (over = {}) => ({
  id: 'tc-1',
  text_id: 'EH-TC-ACC-001',
  title: 'Giris testi',
  description: '',
  type: 'Acceptance Test',
  field: 'Arayuz / HMI',
  status: 'Approved',
  attributes: { priority: 'High' },
  locked: false,
  approvalStatus: 'Approved',
  ...over,
})

const renderPage = (props = {}) =>
  render(
    <LanguageProvider>
      <TestCases pageKey="test-acceptance" {...props} />
    </LanguageProvider>,
  )

const codes = () =>
  screen
    .getAllByText(/^EH-TC-ACC-\d+$/)
    .map((el) => el.textContent)
    .sort()

describe('TestCases — ortak filtre cubugu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canMock.mockReturnValue(true)
    sessionStorage.clear()
    appMock.fields = [
      { id: 'f1', name: 'Arayuz / HMI' },
      { id: 'f2', name: 'Yazilim / Kontrol' },
    ]
    appMock.attributeDefs = [
      {
        id: 'a1',
        entityType: 'testcase',
        key: 'priority',
        label: 'Priority',
        dataType: 'select',
        options: [
          { value: 'High', label: 'High' },
          { value: 'Low', label: 'Low' },
        ],
        order: 0,
      },
    ]
    appMock.testCases = [
      tc({ id: 'tc-1', text_id: 'EH-TC-ACC-001', status: 'Approved' }),
      tc({
        id: 'tc-2',
        text_id: 'EH-TC-ACC-002',
        title: 'Rapor testi',
        field: 'Yazilim / Kontrol',
        status: 'Rejected',
        attributes: { priority: 'Low' },
      }),
      // Baska tipteki test bu sayfada HIC gorunmez (cfg.lockedType).
      tc({ id: 'tc-9', text_id: 'EH-TC-SYS-001', type: 'System Test' }),
    ]
  })

  afterEach(() => cleanup())

  it('sayfa tek tipe kilitli oldugu icin Tip filtresi gosterilmez', () => {
    renderPage()
    expect(screen.queryByTestId('filter-type')).not.toBeInTheDocument()
    expect(codes()).toEqual(['EH-TC-ACC-001', 'EH-TC-ACC-002'])
  })

  it('Durum filtresi test sonucuna gore calisir', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'Rejected' } })
    expect(codes()).toEqual(['EH-TC-ACC-002'])

    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'Approved' } })
    expect(codes()).toEqual(['EH-TC-ACC-001'])
  })

  it('Durum filtresinde "Doğrulanamaz" secenegi bulunmaz', () => {
    renderPage()
    const options = [...screen.getByTestId('filter-status').options].map((o) => o.value)
    expect(options).not.toContain('__unverifiable__')
  })

  it('Alan + oznitelik olcutleri AND ile birlesir', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('filter-field'), {
      target: { value: 'Yazilim / Kontrol' },
    })
    fireEvent.change(screen.getByTestId('filter-attr-priority'), { target: { value: 'Low' } })
    expect(codes()).toEqual(['EH-TC-ACC-002'])

    fireEvent.change(screen.getByTestId('filter-attr-priority'), { target: { value: 'High' } })
    expect(screen.getByText('Sonuç bulunamadı')).toBeInTheDocument()
  })

  it('Temizle tum olcutleri sifirlar', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'rapor' } })
    expect(screen.getByTestId('filter-active-badge')).toHaveTextContent('1 filtre aktif')

    fireEvent.click(screen.getByTestId('filter-clear'))
    expect(codes()).toEqual(['EH-TC-ACC-001', 'EH-TC-ACC-002'])
  })

  it('filtreler sayfaya donuldugunde korunur ve gereksinim sayfalarindan ayridir', () => {
    renderPage({ navKey: 'test-acceptance' })
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'Rejected' } })
    cleanup()

    renderPage({ navKey: 'test-acceptance' })
    expect(screen.getByTestId('filter-status')).toHaveValue('Rejected')
    expect(codes()).toEqual(['EH-TC-ACC-002'])

    cleanup()
    renderPage({ navKey: 'test-system' })
    expect(screen.getByTestId('filter-status')).toHaveValue('')
  })
})
