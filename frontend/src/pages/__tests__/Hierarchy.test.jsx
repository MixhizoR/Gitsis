// ============================================================================
//  Hierarchy.test.jsx — Ortak filtre cubugunun gereksinim sayfasindaki davranisi.
//
//  Kapsam:
//   - Tip filtresi YALNIZCA sayfa tek tipe kilitli degilken gosterilir
//     (tablodaki 'type' sutunuyla ayni kural)
//   - Alan / Durum / modular oznitelik filtreleri ve AND kombinasyonu
//   - Durum filtresi gereksinim semantigini kullanir: bagli dogrulayan test
//     yoksa "Dogrulanamaz"
//   - Temizle: arama dahil tum olcutleri sifirlar
//   - sessionStorage kaliciligi (sayfa terk edilip donuldugunde filtre kalir)
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const { canMock, appMock } = vi.hoisted(() => ({
  canMock: vi.fn(() => true),
  appMock: { requirements: [], links: [], fields: [], attributeDefs: [], personnel: [] },
}))

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    projectId: 'p-1',
    requirements: appMock.requirements,
    testCases: [],
    links: appMock.links,
    fields: appMock.fields,
    attributeDefs: appMock.attributeDefs,
    personnel: appMock.personnel,
    approvals: [],
    bulkRemoveRequirements: vi.fn(),
    editRequirement: vi.fn(),
    refresh: vi.fn(),
  }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ can: canMock, isPM: true, currentUser: { name: 'PM' } }),
  AuthProvider: ({ children }) => children,
}))

// Modallar bu testin konusu degil; acilis/kapanis kendi testlerinde dogrulanir.
vi.mock('../../components/requirements/RequirementForm.jsx', () => ({ default: () => null }))
vi.mock('../../components/requirements/FieldManager.jsx', () => ({ default: () => null }))
vi.mock('../../components/requirements/AttributeManager.jsx', () => ({ default: () => null }))
vi.mock('../../components/traceability/LinkManager.jsx', () => ({ default: () => null }))
vi.mock('../../components/traceability/ImpactAnalysisModal.jsx', () => ({ default: () => null }))
vi.mock('../../components/common/BulkLinkModal.jsx', () => ({ default: () => null }))
vi.mock('../../components/common/ViewModal.jsx', () => ({ default: () => null }))
vi.mock('../../components/common/ReasonModal.jsx', () => ({ default: () => null }))
vi.mock('../../components/documents/SourceDocumentModal.jsx', () => ({ default: () => null }))

import Hierarchy from '../Hierarchy.jsx'

const req = (over = {}) => ({
  id: 'r-1',
  text_id: 'EH-USR-001',
  title: 'Kullanici girisi',
  description: '',
  type: 'User Requirement',
  field: 'Arayuz / HMI',
  status: 'In Review',
  attributes: { priority: 'High' },
  locked: false,
  ...over,
})

const priorityDef = {
  id: 'a1',
  entityType: 'requirement',
  key: 'priority',
  label: 'Priority',
  dataType: 'select',
  options: [
    { value: 'High', label: 'High' },
    { value: 'Medium', label: 'Medium' },
  ],
  order: 0,
}

const renderPage = (props = {}) =>
  render(
    <LanguageProvider>
      <Hierarchy pageKey="req-user" {...props} />
    </LanguageProvider>,
  )

const codes = () =>
  screen
    .getAllByText(/^EH-(USR|SW|HW)-\d+$/)
    .map((el) => el.textContent)
    .sort()

describe('Hierarchy — ortak filtre cubugu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canMock.mockReturnValue(true)
    sessionStorage.clear()
    appMock.fields = [
      { id: 'f1', name: 'Arayuz / HMI' },
      { id: 'f2', name: 'Yazilim / Kontrol' },
    ]
    appMock.attributeDefs = [priorityDef]
    appMock.personnel = [
      { id: 'p1', firstName: 'Ayse', lastName: 'Demir' },
      { id: 'p2', firstName: 'Mehmet', lastName: 'Kaya' },
    ]
    appMock.links = []
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', title: 'Kullanici girisi' }),
      req({
        id: 'r-2',
        text_id: 'EH-USR-002',
        title: 'Rapor ekrani',
        field: 'Yazilim / Kontrol',
        attributes: { priority: 'Medium' },
      }),
    ]
  })

  afterEach(() => cleanup())

  it('tek tipe kilitli sayfada Tip filtresi GOSTERILMEZ', () => {
    renderPage()
    expect(screen.queryByTestId('filter-type')).not.toBeInTheDocument()
  })

  it('tip kilitli olmayan sayfada (req-subsystem) Tip filtresi gosterilir ve daraltir', () => {
    appMock.requirements = [
      req({ id: 's-1', text_id: 'EH-SW-001', type: 'Software Requirement' }),
      req({ id: 'h-1', text_id: 'EH-HW-001', type: 'Hardware Requirement' }),
    ]
    renderPage({ pageKey: 'req-subsystem' })
    expect(codes()).toEqual(['EH-HW-001', 'EH-SW-001'])

    fireEvent.change(screen.getByTestId('filter-type'), {
      target: { value: 'Software Requirement' },
    })
    expect(codes()).toEqual(['EH-SW-001'])
  })

  it('Alan filtresi listeyi daraltir', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('filter-field'), {
      target: { value: 'Yazilim / Kontrol' },
    })
    expect(codes()).toEqual(['EH-USR-002'])
  })

  it('modular select ozniteligi (Priority) icin filtre uretilir', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('filter-attr-priority'), { target: { value: 'High' } })
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it('select OLMAYAN oznitelikler icin filtre uretilmez', () => {
    appMock.attributeDefs = [
      priorityDef,
      { id: 'a2', entityType: 'requirement', key: 'risk', label: 'Risk', dataType: 'number' },
    ]
    renderPage()
    expect(screen.getByTestId('filter-attr-priority')).toBeInTheDocument()
    expect(screen.queryByTestId('filter-attr-risk')).not.toBeInTheDocument()
  })

  it('Durum filtresi gereksinim semantigini kullanir: dogrulayan test yoksa "Doğrulanamaz"', () => {
    // r-1 bir test tarafindan dogrulanir, r-2 dogrulanmaz.
    appMock.links = [{ id: 'l1', type: 'Verifies', fromId: 'r-1', toId: 'tc-1' }]
    renderPage()

    fireEvent.change(screen.getByTestId('filter-status'), {
      target: { value: '__unverifiable__' },
    })
    expect(codes()).toEqual(['EH-USR-002'])

    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'In Review' } })
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it('birden fazla olcut AND ile birlesir', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('filter-field'), {
      target: { value: 'Arayuz / HMI' },
    })
    // Alan eslesir ama Priority eslesmez -> sonuc bos.
    fireEvent.change(screen.getByTestId('filter-attr-priority'), { target: { value: 'Medium' } })
    expect(screen.getByText('Sonuç bulunamadı')).toBeInTheDocument()
  })

  it('arama kutusu kod, baslik ve tanimda arar', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'rapor' } })
    expect(codes()).toEqual(['EH-USR-002'])
  })

  it('aktif filtre sayisi rozette gosterilir', () => {
    renderPage()
    expect(screen.queryByTestId('filter-active-badge')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('filter-field'), { target: { value: 'Arayuz / HMI' } })
    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'giris' } })
    expect(screen.getByTestId('filter-active-badge')).toHaveTextContent('2 filtre aktif')
  })

  it('Temizle butonu arama dahil tum filtreleri sifirlar', () => {
    renderPage()
    expect(screen.queryByTestId('filter-clear')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'rapor' } })
    fireEvent.change(screen.getByTestId('filter-attr-priority'), { target: { value: 'Medium' } })
    expect(codes()).toEqual(['EH-USR-002'])

    fireEvent.click(screen.getByTestId('filter-clear'))
    expect(screen.getByTestId('filter-search')).toHaveValue('')
    expect(screen.getByTestId('filter-attr-priority')).toHaveValue('')
    expect(codes()).toEqual(['EH-USR-001', 'EH-USR-002'])
    expect(screen.queryByTestId('filter-active-badge')).not.toBeInTheDocument()
  })

  it('filtreler sayfa terk edilip donuldugunde korunur (sessionStorage)', () => {
    renderPage({ navKey: 'req-user' })
    fireEvent.change(screen.getByTestId('filter-field'), {
      target: { value: 'Yazilim / Kontrol' },
    })
    expect(codes()).toEqual(['EH-USR-002'])

    cleanup() // baska bir sayfaya gidildi
    renderPage({ navKey: 'req-user' })

    expect(screen.getByTestId('filter-field')).toHaveValue('Yazilim / Kontrol')
    expect(codes()).toEqual(['EH-USR-002'])
  })

  it('kalicilik nav-item bazlidir: ayni sayfa tipinin iki ornegi birbirini etkilemez', () => {
    renderPage({ navKey: 'nav-a' })
    fireEvent.change(screen.getByTestId('filter-field'), {
      target: { value: 'Yazilim / Kontrol' },
    })
    cleanup()

    renderPage({ navKey: 'nav-b' })
    expect(screen.getByTestId('filter-field')).toHaveValue('')
    expect(codes()).toEqual(['EH-USR-001', 'EH-USR-002'])
  })

  it("ozel sayfa tek Alan'a sabitlenmisse Alan filtresi gosterilmez", () => {
    renderPage({ fieldFilter: 'Arayuz / HMI' })
    expect(screen.queryByTestId('filter-field')).not.toBeInTheDocument()
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it('tabloda Atanan Kişi sutunu cikar; ad cozulur, atanmamis satirda tire', () => {
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', assigneeId: 'p1' }),
      req({ id: 'r-2', text_id: 'EH-USR-002', assigneeId: null }),
    ]
    renderPage()

    expect(screen.getByRole('columnheader', { name: /Atanan Kişi/i })).toBeInTheDocument()
    const assigned = screen.getByText('EH-USR-001').closest('tr')
    expect(within(assigned).getByText('Ayse Demir')).toBeInTheDocument()
    const unassigned = screen.getByText('EH-USR-002').closest('tr')
    expect(within(unassigned).queryByText('Ayse Demir')).not.toBeInTheDocument()
  })

  it('Atanan Kişi filtresi kisiye ve "atanmamış" secenegine gore daraltir', () => {
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', assigneeId: 'p1' }),
      req({ id: 'r-2', text_id: 'EH-USR-002', assigneeId: 'p2' }),
      req({ id: 'r-3', text_id: 'EH-USR-003', assigneeId: null }),
    ]
    renderPage()

    fireEvent.change(screen.getByTestId('filter-assignee'), { target: { value: 'p1' } })
    expect(codes()).toEqual(['EH-USR-001'])

    fireEvent.change(screen.getByTestId('filter-assignee'), {
      target: { value: '__unassigned__' },
    })
    expect(codes()).toEqual(['EH-USR-003'])
  })

  it('Atanan Kişi filtresi diger olcutlerle AND ile birlesir', () => {
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', assigneeId: 'p1', field: 'Arayuz / HMI' }),
      req({ id: 'r-2', text_id: 'EH-USR-002', assigneeId: 'p1', field: 'Yazilim / Kontrol' }),
    ]
    renderPage()

    fireEvent.change(screen.getByTestId('filter-assignee'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByTestId('filter-field'), {
      target: { value: 'Yazilim / Kontrol' },
    })
    expect(codes()).toEqual(['EH-USR-002'])
    expect(screen.getByTestId('filter-active-badge')).toHaveTextContent('2 filtre aktif')
  })

  it('kayit sayaci filtrelenmis sonucu gosterir', () => {
    renderPage()
    const header = screen.getByRole('heading', { level: 2 }).parentElement.parentElement
    expect(within(header).getByText('2')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('filter-field'), { target: { value: 'Arayuz / HMI' } })
    expect(within(header).getByText('1')).toBeInTheDocument()
  })
})
