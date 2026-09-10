// ============================================================================
//  Hierarchy.test.jsx — Ortak filtre cubugunun gereksinim sayfasindaki davranisi.
//
//  Cubukta yalnizca arama kutusu ve TEK bir "Filtreler" butonu vardir; diger
//  tum olcutler butona basilinca acilan menudedir (bkz. FilterBar). Bu yuzden
//  testler menu kontrollerine dokunmadan once `openFilters()` cagirir.
//
//  Kapsam:
//   - Tip filtresi YALNIZCA sayfa tek tipe kilitli degilken gosterilir
//     (tablodaki 'type' sutunuyla ayni kural)
//   - Alan / Durum / modular oznitelik filtreleri ve AND kombinasyonu
//   - Oznitelikler HER TIPTE filtrelenebilir (select / number / text ...)
//   - Durum filtresi gereksinim semantigini kullanir: bagli dogrulayan test
//     yoksa "Dogrulanamaz"
//   - Temizle: arama dahil tum olcutleri sifirlar
//   - sessionStorage kaliciligi (sayfa terk edilip donuldugunde filtre kalir)
//   - Atanan Kisi tabloda SUTUN DEGILDIR (coklu atama; ViewModal'da gosterilir)
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

// Filtre menusunu acar — cubukta yalnizca arama ve tek buton durur.
const openFilters = () => fireEvent.click(screen.getByTestId('filter-toggle'))

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
    openFilters()
    expect(screen.queryByTestId('filter-type')).not.toBeInTheDocument()
  })

  it('tip kilitli olmayan sayfada (req-subsystem) Tip filtresi gosterilir ve daraltir', () => {
    appMock.requirements = [
      req({ id: 's-1', text_id: 'EH-SW-001', type: 'Software Requirement' }),
      req({ id: 'h-1', text_id: 'EH-HW-001', type: 'Hardware Requirement' }),
    ]
    renderPage({ pageKey: 'req-subsystem' })
    expect(codes()).toEqual(['EH-HW-001', 'EH-SW-001'])

    openFilters()
    fireEvent.change(screen.getByTestId('filter-type'), {
      target: { value: 'Software Requirement' },
    })
    expect(codes()).toEqual(['EH-SW-001'])
  })

  it('Alan filtresi listeyi daraltir', () => {
    renderPage()
    openFilters()
    fireEvent.change(screen.getByTestId('filter-field'), {
      target: { value: 'Yazilim / Kontrol' },
    })
    expect(codes()).toEqual(['EH-USR-002'])
  })

  it('modular select ozniteligi (Priority) icin filtre uretilir', () => {
    renderPage()
    openFilters()
    fireEvent.change(screen.getByTestId('filter-attr-priority'), { target: { value: 'High' } })
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it('select OLMAYAN oznitelikler de menude cikar (sayi tam eslesir)', () => {
    appMock.attributeDefs = [
      priorityDef,
      { id: 'a2', entityType: 'requirement', key: 'risk', label: 'Risk', dataType: 'number' },
    ]
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', attributes: { priority: 'High', risk: 8 } }),
      req({ id: 'r-2', text_id: 'EH-USR-002', attributes: { priority: 'High', risk: 50 } }),
    ]
    renderPage()
    openFilters()
    expect(screen.getByTestId('filter-attr-priority')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('filter-attr-risk'), { target: { value: '8' } })
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it('metin ozniteligi "icinde gecen" olarak eslesir', () => {
    appMock.attributeDefs = [
      { id: 'a3', entityType: 'requirement', key: 'owner_note', label: 'Not', dataType: 'text' },
    ]
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', attributes: { owner_note: 'Kritik uçuş' } }),
      req({ id: 'r-2', text_id: 'EH-USR-002', attributes: { owner_note: 'Rapor' } }),
    ]
    renderPage()
    openFilters()
    fireEvent.change(screen.getByTestId('filter-attr-owner_note'), { target: { value: 'kritik' } })
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it('Durum filtresi gereksinim semantigini kullanir: dogrulayan test yoksa "Doğrulanamaz"', () => {
    // r-1 bir test tarafindan dogrulanir, r-2 dogrulanmaz.
    appMock.links = [{ id: 'l1', type: 'Verifies', fromId: 'r-1', toId: 'tc-1' }]
    renderPage()

    openFilters()
    fireEvent.change(screen.getByTestId('filter-status'), {
      target: { value: '__unverifiable__' },
    })
    expect(codes()).toEqual(['EH-USR-002'])

    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'In Review' } })
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it('birden fazla olcut AND ile birlesir', () => {
    renderPage()
    openFilters()
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

    openFilters()
    fireEvent.change(screen.getByTestId('filter-field'), { target: { value: 'Arayuz / HMI' } })
    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'giris' } })
    expect(screen.getByTestId('filter-active-badge')).toHaveTextContent('2 filtre aktif')
    // Buton uzerindeki sayac da ayni olcut sayisini gosterir.
    expect(screen.getByTestId('filter-toggle-count')).toHaveTextContent('2')
  })

  it('Temizle butonu arama dahil tum filtreleri sifirlar', () => {
    renderPage()
    // Menu kapaliyken Temizle de gorunmez.
    expect(screen.queryByTestId('filter-clear')).not.toBeInTheDocument()

    openFilters()
    // Hicbir olcut yokken Temizle pasiftir.
    expect(screen.getByTestId('filter-clear')).toBeDisabled()

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
    openFilters()
    fireEvent.change(screen.getByTestId('filter-field'), {
      target: { value: 'Yazilim / Kontrol' },
    })
    expect(codes()).toEqual(['EH-USR-002'])

    cleanup() // baska bir sayfaya gidildi
    renderPage({ navKey: 'req-user' })

    openFilters()
    expect(screen.getByTestId('filter-field')).toHaveValue('Yazilim / Kontrol')
    expect(codes()).toEqual(['EH-USR-002'])
  })

  it('kalicilik nav-item bazlidir: ayni sayfa tipinin iki ornegi birbirini etkilemez', () => {
    renderPage({ navKey: 'nav-a' })
    openFilters()
    fireEvent.change(screen.getByTestId('filter-field'), {
      target: { value: 'Yazilim / Kontrol' },
    })
    cleanup()

    renderPage({ navKey: 'nav-b' })
    openFilters()
    expect(screen.getByTestId('filter-field')).toHaveValue('')
    expect(codes()).toEqual(['EH-USR-001', 'EH-USR-002'])
  })

  it("ozel sayfa tek Alan'a sabitlenmisse Alan filtresi gosterilmez", () => {
    renderPage({ fieldFilter: 'Arayuz / HMI' })
    openFilters()
    expect(screen.queryByTestId('filter-field')).not.toBeInTheDocument()
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it("tabloda Atanan Kişi SUTUNU YOKTUR (coklu atama ViewModal'da gosterilir)", () => {
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', assigneeIds: ['p1', 'p2'] }),
      req({ id: 'r-2', text_id: 'EH-USR-002', assigneeIds: [] }),
    ]
    renderPage()

    expect(screen.queryByRole('columnheader', { name: /Atanan Kişi/i })).not.toBeInTheDocument()
    const assigned = screen.getByText('EH-USR-001').closest('tr')
    expect(within(assigned).queryByText('Ayse Demir')).not.toBeInTheDocument()
  })

  it('Atanan Kişi filtresi kisiye ve "atanmamış" secenegine gore daraltir', () => {
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', assigneeIds: ['p1'] }),
      req({ id: 'r-2', text_id: 'EH-USR-002', assigneeIds: ['p2'] }),
      req({ id: 'r-3', text_id: 'EH-USR-003', assigneeIds: [] }),
    ]
    renderPage()

    openFilters()
    fireEvent.change(screen.getByTestId('filter-assignee'), { target: { value: 'p1' } })
    expect(codes()).toEqual(['EH-USR-001'])

    fireEvent.change(screen.getByTestId('filter-assignee'), {
      target: { value: '__unassigned__' },
    })
    expect(codes()).toEqual(['EH-USR-003'])
  })

  it('Atanan Kişi filtresi COKLU atamada atananlardan birini yakalar', () => {
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', assigneeIds: ['p2', 'p1'] }),
      req({ id: 'r-2', text_id: 'EH-USR-002', assigneeIds: ['p2'] }),
    ]
    renderPage()

    openFilters()
    fireEvent.change(screen.getByTestId('filter-assignee'), { target: { value: 'p1' } })
    // p1 ikinci sirada olsa da eslesir.
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it('Atanan Kişi filtresi eski tek-atama alanini da okur', () => {
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', assigneeId: 'p1' }),
      req({ id: 'r-2', text_id: 'EH-USR-002', assigneeId: 'p2' }),
    ]
    renderPage()

    openFilters()
    fireEvent.change(screen.getByTestId('filter-assignee'), { target: { value: 'p1' } })
    expect(codes()).toEqual(['EH-USR-001'])
  })

  it('Atanan Kişi filtresi diger olcutlerle AND ile birlesir', () => {
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', assigneeIds: ['p1'], field: 'Arayuz / HMI' }),
      req({ id: 'r-2', text_id: 'EH-USR-002', assigneeIds: ['p1'], field: 'Yazilim / Kontrol' }),
    ]
    renderPage()

    openFilters()
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

    openFilters()
    fireEvent.change(screen.getByTestId('filter-field'), { target: { value: 'Arayuz / HMI' } })
    expect(within(header).getByText('1')).toBeInTheDocument()
  })

  it('menu disina tiklaninca kapanir, arama kutusu acikta kalir', () => {
    renderPage()
    openFilters()
    expect(screen.getByTestId('filter-panel')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('filter-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('filter-search')).toBeInTheDocument()
  })
})
