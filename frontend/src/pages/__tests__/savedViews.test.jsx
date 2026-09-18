// ============================================================================
//  savedViews.test.jsx — Kayitli Gorunumler (Saved Views, Issue #105).
//
//  Kapsam (kabul kriterleri):
//   - Varsayilan gorunum sayfa acilisinda uygulanir: FILTRE + SUTUN
//     GORUNURLUGU/SIRASI + SATIR DUZENI (sayfa boyutu, siralama) birlikte
//   - Gorunum SECILMEDIGINDE eski davranis bozulmaz (tum sutunlar, filtre
//     sessionStorage'dan)
//   - Yeni gorunum kaydetme: o anki filtre + sutun + satir duzeni gonderilir
//   - Sutun gizleme/tasima tabloyu ANINDA etkiler
//   - Sayfalama calisir
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const {
  listViewsMock,
  createViewMock,
  updateViewMock,
  setDefaultViewMock,
  deleteViewMock,
  canMock,
  state,
} = vi.hoisted(() => ({
  listViewsMock: vi.fn(),
  createViewMock: vi.fn(),
  updateViewMock: vi.fn(),
  setDefaultViewMock: vi.fn(),
  deleteViewMock: vi.fn(),
  canMock: vi.fn(() => true),
  state: { requirements: [], attributeDefs: [], links: [] },
}))

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    projectId: 'p-1',
    requirements: state.requirements,
    testCases: [],
    glossary: [],
    links: state.links,
    approvals: [],
    personnel: [],
    fields: [{ id: 'f1', name: 'HMI' }],
    attributeDefs: state.attributeDefs,
    bulkRemoveRequirements: vi.fn(),
    editRequirement: vi.fn(),
    refresh: vi.fn(),
  }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ can: canMock, isPM: true, currentUser: { id: 'u-1', name: 'PM' } }),
  AuthProvider: ({ children }) => children,
}))

vi.mock('../../services/dataService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listViews: listViewsMock,
  createView: createViewMock,
  updateView: updateViewMock,
  setDefaultView: setDefaultViewMock,
  deleteView: deleteViewMock,
}))

import Hierarchy from '../Hierarchy.jsx'

const req = (n, over = {}) => ({
  id: `r-${n}`,
  text_id: `EH-TID-USR-00${n}`,
  title: `Gereksinim ${n}`,
  description: '',
  type: 'User Requirement',
  field: 'HMI',
  status: 'In Review',
  attributes: {},
  ...over,
})

const view = (over = {}) => ({
  id: 'v-1',
  projectId: 'p-1',
  userId: 'u-1',
  navKey: 'req-user',
  name: 'Sadece HMI',
  scope: 'user',
  isDefault: true,
  filters: { q: '', type: '', field: 'HMI', status: '', assignee: '', attrs: {} },
  columns: [
    { key: 'code', visible: true },
    { key: 'title', visible: true },
    { key: 'status', visible: true },
    { key: 'field', visible: false },
    { key: 'links', visible: false },
    { key: 'actions', visible: true },
  ],
  rowLayout: { pageSize: 25, sortBy: 'text_id', sortDir: 'asc' },
  ...over,
})

const renderPage = () =>
  render(
    <LanguageProvider>
      <Hierarchy pageKey="req-user" />
    </LanguageProvider>,
  )

const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent.trim())
const openLayout = () => fireEvent.click(screen.getByTestId('view-toggle'))

describe('Kayitli Gorunumler — Hiyerarsi sayfasi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canMock.mockReturnValue(true)
    sessionStorage.clear()
    state.attributeDefs = []
    state.links = []
    state.requirements = [
      req(1),
      req(2, { field: 'Yazilim' }),
      req(3),
      req(4),
      req(5, { field: 'Yazilim' }),
    ]
    listViewsMock.mockResolvedValue([])
  })

  afterEach(() => cleanup())

  it('gorunum yokken eski davranis korunur: tum sutunlar, filtresiz liste', async () => {
    renderPage()
    await waitFor(() => expect(listViewsMock).toHaveBeenCalledWith('p-1', 'req-user'))
    expect(screen.getByText('EH-TID-USR-002')).toBeInTheDocument()
    expect(headers()).toEqual(
      expect.arrayContaining(['Kod', 'Başlık / Tanım', 'Alan', 'Doğrulama Durumu', 'Bağ']),
    )
    expect(screen.getByTestId('view-select')).toHaveValue('')
  })

  it('varsayilan gorunum acilista uygulanir: filtre + gizli sutunlar', async () => {
    listViewsMock.mockResolvedValue([view()])
    renderPage()

    await waitFor(() => expect(screen.getByTestId('view-select')).toHaveValue('v-1'))
    // Filtre uygulandi: yalnizca HMI alanindaki kayitlar.
    await waitFor(() => expect(screen.queryByText('EH-TID-USR-002')).not.toBeInTheDocument())
    expect(screen.getByText('EH-TID-USR-001')).toBeInTheDocument()
    // Sutun gorunurlugu gorunumden geliyor: ALAN ve BAG gizli.
    const th = headers()
    expect(th).not.toContain('Alan')
    expect(th).not.toContain('Bağ')
    expect(th).toContain('Kod')
    // Sira da gorunumden: Durum, Baslik'tan sonra ama Alan'in yerinde degil.
    expect(th.indexOf('Doğrulama Durumu')).toBe(th.indexOf('Başlık / Tanım') + 1)
  })

  it('satir duzeni (siralama + sayfa boyutu) gorunumle birlikte uygulanir', async () => {
    listViewsMock.mockResolvedValue([
      view({ rowLayout: { pageSize: 10, sortBy: 'text_id', sortDir: 'desc' } }),
    ])
    renderPage()

    await waitFor(() => expect(screen.getByTestId('view-select')).toHaveValue('v-1'))
    // HMI kayitlari azalan kod sirasinda: 004, 003, 001
    await waitFor(() => {
      const codes = screen.getAllByText(/EH-TID-USR-00\d/).map((el) => el.textContent)
      expect(codes).toEqual(['EH-TID-USR-004', 'EH-TID-USR-003', 'EH-TID-USR-001'])
    })
  })

  it('sayfa boyutu sayfalama uretir; ileri/geri gezilir', async () => {
    // 25 kayit / sayfa basina 10 => 3 sayfa.
    state.requirements = Array.from({ length: 25 }, (_, i) =>
      req(i + 1, { id: `r-${i + 1}`, text_id: `EH-TID-USR-${String(i + 1).padStart(3, '0')}` }),
    )
    listViewsMock.mockResolvedValue([
      view({
        filters: { q: '', type: '', field: '', status: '', assignee: '', attrs: {} },
        rowLayout: { pageSize: 10, sortBy: 'text_id', sortDir: 'asc' },
      }),
    ])
    renderPage()

    await waitFor(() => expect(screen.getByTestId('table-pager')).toBeInTheDocument())
    expect(screen.getByTestId('table-pager')).toHaveTextContent('Sayfa 1/3 · 25 kayıt')
    expect(screen.getByText('EH-TID-USR-001')).toBeInTheDocument()
    expect(screen.queryByText('EH-TID-USR-011')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('pager-next'))
    await screen.findByText('EH-TID-USR-011')
    expect(screen.queryByText('EH-TID-USR-001')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('pager-prev'))
    await screen.findByText('EH-TID-USR-001')
  })

  it('sutun gizleme tabloyu ANINDA etkiler ve kaydedilmemis olarak isaretlenir', async () => {
    listViewsMock.mockResolvedValue([view()])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('view-select')).toHaveValue('v-1'))

    openLayout()
    // Gorunumde gizli olan ALAN sutununu geri ac.
    fireEvent.click(screen.getByTestId('view-col-field'))
    await waitFor(() => expect(headers()).toContain('Alan'))
    expect(screen.getByTestId('view-dirty')).toBeInTheDocument()
  })

  it('"Görünüm yok" secilince sutunlar varsayilana doner', async () => {
    listViewsMock.mockResolvedValue([view()])
    renderPage()
    await waitFor(() => expect(headers()).not.toContain('Bağ'))

    fireEvent.change(screen.getByTestId('view-select'), { target: { value: '' } })
    await waitFor(() => expect(headers()).toContain('Bağ'))
  })

  it('yeni gorunum kaydeder: filtre + sutun + satir duzeni birlikte gonderilir', async () => {
    createViewMock.mockResolvedValue(view({ id: 'v-2', name: 'Yeni' }))
    listViewsMock.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(listViewsMock).toHaveBeenCalled())

    // Filtre: arama kutusuna yaz.
    fireEvent.change(screen.getByTestId('filter-search'), { target: { value: 'Gereksinim 1' } })
    openLayout()
    // Sutun: BAG sutununu gizle. Satir duzeni: sayfa boyutu 10.
    fireEvent.click(screen.getByTestId('view-col-links'))
    fireEvent.change(screen.getByTestId('view-page-size'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('view-save-as'))

    fireEvent.change(await screen.findByTestId('view-name'), { target: { value: 'Yeni' } })
    fireEvent.click(screen.getByTestId('view-save-confirm'))

    await waitFor(() => expect(createViewMock).toHaveBeenCalled())
    const [pid, payload] = createViewMock.mock.calls[0]
    expect(pid).toBe('p-1')
    expect(payload.navKey).toBe('req-user')
    expect(payload.name).toBe('Yeni')
    expect(payload.filters.q).toBe('Gereksinim 1')
    expect(payload.rowLayout.pageSize).toBe(10)
    expect(payload.columns.find((c) => c.key === 'links').visible).toBe(false)
    // Kaydetmeden sonra liste tazelenir (yeni gorunum secim kutusuna girsin).
    expect(listViewsMock).toHaveBeenCalledTimes(2)
  })

  it('secili gorunum guncellenir ve varsayilan yapilir', async () => {
    const v = view({ isDefault: false })
    listViewsMock.mockResolvedValue([v])
    updateViewMock.mockResolvedValue(v)
    setDefaultViewMock.mockResolvedValue({ ...v, isDefault: true })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('view-select')).toHaveValue(''))

    fireEvent.change(screen.getByTestId('view-select'), { target: { value: 'v-1' } })
    openLayout()
    fireEvent.change(screen.getByTestId('view-sort-dir'), { target: { value: 'desc' } })
    await screen.findByTestId('view-dirty')

    fireEvent.click(screen.getByTestId('view-save'))
    await waitFor(() => expect(updateViewMock).toHaveBeenCalled())
    expect(updateViewMock.mock.calls[0][2].rowLayout.sortDir).toBe('desc')

    fireEvent.click(screen.getByTestId('view-make-default'))
    await waitFor(() => expect(setDefaultViewMock).toHaveBeenCalledWith('p-1', 'v-1'))
  })

  it('gorunum silinir ve secim temizlenir', async () => {
    listViewsMock.mockResolvedValue([view()])
    deleteViewMock.mockResolvedValue({ ok: true })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('view-select')).toHaveValue('v-1'))

    listViewsMock.mockResolvedValue([])
    openLayout()
    fireEvent.click(screen.getByTestId('view-delete'))
    await waitFor(() => expect(deleteViewMock).toHaveBeenCalledWith('p-1', 'v-1'))
    await waitFor(() => expect(screen.getByTestId('view-select')).toHaveValue(''))
  })

  it('modular oznitelik sutunu gorunumde tasinabilir', async () => {
    state.attributeDefs = [
      {
        id: 'a1',
        entityType: 'requirement',
        key: 'priority',
        label: 'Priority',
        dataType: 'select',
        options: [{ value: 'High', label: 'High' }],
        order: 0,
      },
    ]
    listViewsMock.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(headers()).toContain('Priority'))

    openLayout()
    // Oznitelik sutununu bir sira yukari tasi (Bağ'in onune gecmez; Durum ile yer degistirir).
    const before = headers()
    fireEvent.click(screen.getByTestId('view-col-up-attr:priority'))
    await waitFor(() => {
      const after = headers()
      expect(after.indexOf('Priority')).toBe(before.indexOf('Priority') - 1)
    })
  })

  it('satir bilgisi dogru kalir: gizli sutun satirdan da kalkar', async () => {
    listViewsMock.mockResolvedValue([view()])
    renderPage()
    await waitFor(() => expect(screen.getByTestId('view-select')).toHaveValue('v-1'))

    const row = screen.getByText('EH-TID-USR-001').closest('tr')
    // ALAN sutunu gizli oldugu icin 'HMI' hucresi satirda yok.
    expect(within(row).queryByText('HMI')).not.toBeInTheDocument()
  })
})
