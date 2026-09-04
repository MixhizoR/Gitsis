// ============================================================================
//  PbsTree.test.jsx — Urun Agaci (PBS) sayfasi (Issue #9).
//
//  Kapsam:
//   - Gereksinim sayfalariyla AYNI tablo sutunlari (KOD/BASLIK/TIP/ALAN/
//     ONCELIK/DAL/BAG/ONAY...) — arayuz birligi
//   - HIYERARSI korunur: lazy expand, girinti, ac/kapa
//   - BOLUM numaralandirmasi (DOORS tarzi 1, 1.1, 1.1.1 / 2 ...)
//   - Cache: ayni dugum ikinci kez acilinca tekrar istek ATILMAZ
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const { listTreeChildrenMock, getAncestorsMock, canMock, attrDefsMock, requirementsMock } =
  vi.hoisted(() => ({
    listTreeChildrenMock: vi.fn(),
    getAncestorsMock: vi.fn(),
    canMock: vi.fn(() => true),
    // Testler arasinda degistirilebilsin diye kutu icinde tutulur.
    attrDefsMock: { value: [] },
    requirementsMock: { value: [] },
  }))

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    projectId: 'p-1',
    requirements: requirementsMock.value,
    testCases: [],
    glossary: [],
    links: [],
    approvals: [],
    personnel: [],
    roles: [],
    fields: [],
    // Modular oznitelikler (main): EntityTable sutunlari bundan turetilir.
    attributeDefs: attrDefsMock.value,
    createLink: vi.fn(),
    deleteLink: vi.fn(),
    addRequirement: vi.fn(),
    editRequirement: vi.fn(),
    bulkRemoveRequirements: vi.fn(),
    voteApproval: vi.fn(),
    unlockApproval: vi.fn(),
    getApprovalMatrix: vi.fn(),
    refresh: vi.fn(),
  }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ can: canMock, isPM: true, currentUser: { name: 'PM' } }),
  AuthProvider: ({ children }) => children,
}))

vi.mock('../../context/ProjectContext.jsx', () => ({
  useProject: () => ({
    activeProject: { id: 'p-1', name: 'Test', codePrefix: 'EH-KAHVE-TİD' },
    refreshProjects: vi.fn(),
  }),
  ProjectProvider: ({ children }) => children,
}))

vi.mock('../../services/dataService.js', () => ({
  listTreeChildren: listTreeChildrenMock,
  getAncestors: getAncestorsMock,
  moveRequirement: vi.fn(),
  splitRequirement: vi.fn(),
  mergeRequirements: vi.fn(),
  setCodePrefix: vi.fn(),
}))

// AttributeManager'in kendi testi ayri; burada yalnizca ACILIP acilmadigi onemli.
vi.mock('../../components/requirements/AttributeManager.jsx', () => ({
  default: ({ open }) => (open ? <div data-testid="attr-manager-modal" /> : null),
}))

import PbsTree from '../PbsTree.jsx'

const node = (over = {}) => ({
  id: 'n-1',
  text_id: 'EH-KAHVE-TİD-USR-001',
  title: 'Kok',
  description: '',
  type: 'User Requirement',
  field: 'Arayuz / HMI',
  status: 'In Review',
  attributes: { priority: 'High' },
  locked: false,
  approvalStatus: 'Pending',
  hasChildren: true,
  ...over,
})

const renderPage = () =>
  render(
    <LanguageProvider>
      <PbsTree />
    </LanguageProvider>,
  )

const rowOf = (textId) => screen.getByText(textId).closest('tr')

describe('PbsTree — gereksinim tablosu + PBS hiyerarsisi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canMock.mockReturnValue(true)
    attrDefsMock.value = [
      {
        id: 'a1',
        entityType: 'requirement',
        key: 'priority',
        label: 'Priority',
        dataType: 'select',
        order: 0,
      },
    ]
    requirementsMock.value = []
  })

  afterEach(() => {
    cleanup()
  })

  it('gereksinim sayfalariyla AYNI sutunlari gosterir (Bölüm sutunu eklenmis)', async () => {
    listTreeChildrenMock.mockResolvedValue({ items: [node()] })
    renderPage()
    await screen.findByText('EH-KAHVE-TİD-USR-001')

    for (const th of ['Bölüm', 'Kod', 'Başlık', 'Tip', 'Alan', 'Priority', 'Bağ']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(th, 'i') })).toBeInTheDocument()
    }
    // Satirda gereksinim alanlari gorunur (fotograf 1 ile ayni bilgi seti)
    const row = rowOf('EH-KAHVE-TİD-USR-001')
    expect(within(row).getByText('User Requirement')).toBeInTheDocument()
    expect(within(row).getByText('Arayuz / HMI')).toBeInTheDocument()
    // Priority artik modular oznitelik sutunu olarak render edilir.
    expect(within(row).getByText('High')).toBeInTheDocument()
  })

  it("mount'ta yalnizca kok dugumler cekilir (lazy-load korunur)", async () => {
    listTreeChildrenMock.mockResolvedValue({ items: [node()] })
    renderPage()

    await waitFor(() => expect(listTreeChildrenMock).toHaveBeenCalledTimes(1))
    expect(listTreeChildrenMock).toHaveBeenCalledWith('p-1', undefined)
  })

  it('DOORS tarzi bolum numaralari uretir: 1, 1.1, 1.2 / 2', async () => {
    listTreeChildrenMock
      .mockResolvedValueOnce({
        items: [
          node({ id: 'u1', text_id: 'EH-KAHVE-TİD-USR-001' }),
          node({ id: 'u2', text_id: 'EH-KAHVE-TİD-USR-002', hasChildren: false }),
        ],
      })
      .mockResolvedValueOnce({
        items: [
          node({
            id: 's1',
            text_id: 'EH-KAHVE-TİD-SYS-001',
            type: 'System Requirement',
            hasChildren: false,
          }),
          node({
            id: 's2',
            text_id: 'EH-KAHVE-TİD-SYS-002',
            type: 'System Requirement',
            hasChildren: false,
          }),
        ],
      })
      .mockResolvedValue({ items: [] })

    renderPage()
    await screen.findByText('EH-KAHVE-TİD-USR-001')
    // Kok dugumler: 1 ve 2
    expect(within(rowOf('EH-KAHVE-TİD-USR-001')).getByText('1')).toBeInTheDocument()
    expect(within(rowOf('EH-KAHVE-TİD-USR-002')).getByText('2')).toBeInTheDocument()

    fireEvent.click(
      within(rowOf('EH-KAHVE-TİD-USR-001')).getByRole('button', { name: /alt kırılımları aç/i }),
    )
    await screen.findByText('EH-KAHVE-TİD-SYS-001')

    // Alt kirilimlar: 1.1 ve 1.2 — hiyerarsi numaralandirmasi bozulmaz
    expect(within(rowOf('EH-KAHVE-TİD-SYS-001')).getByText('1.1')).toBeInTheDocument()
    expect(within(rowOf('EH-KAHVE-TİD-SYS-002')).getByText('1.2')).toBeInTheDocument()
    // Kardes kok dugum numarasi degismez
    expect(within(rowOf('EH-KAHVE-TİD-USR-002')).getByText('2')).toBeInTheDocument()
  })

  it('expand SADECE o dugumun cocuklarini ceker; ikinci acilista istek ATILMAZ', async () => {
    listTreeChildrenMock
      .mockResolvedValueOnce({ items: [node({ id: 'u1' })] })
      .mockResolvedValueOnce({
        items: [node({ id: 's1', text_id: 'EH-KAHVE-TİD-SYS-001', hasChildren: false })],
      })
      .mockResolvedValue({ items: [] })

    renderPage()
    await screen.findByText('EH-KAHVE-TİD-USR-001')

    fireEvent.click(screen.getByRole('button', { name: /alt kırılımları aç/i }))
    await waitFor(() => expect(listTreeChildrenMock).toHaveBeenCalledTimes(2))
    expect(listTreeChildrenMock).toHaveBeenLastCalledWith('p-1', 'u1')
    await screen.findByText('EH-KAHVE-TİD-SYS-001')

    fireEvent.click(screen.getByRole('button', { name: /alt kırılımları kapat/i })) // kapat
    fireEvent.click(screen.getByRole('button', { name: /alt kırılımları aç/i })) // tekrar ac
    await screen.findByText('EH-KAHVE-TİD-SYS-001')
    expect(listTreeChildrenMock).toHaveBeenCalledTimes(2) // yeni istek YOK
  })

  it('alt kirilimi olmayan satirda ac/kapa oku gosterilmez', async () => {
    listTreeChildrenMock.mockResolvedValue({
      items: [node({ id: 'leaf', text_id: 'EH-KAHVE-TİD-HW-001', hasChildren: false })],
    })
    renderPage()
    await screen.findByText('EH-KAHVE-TİD-HW-001')

    expect(screen.queryByRole('button', { name: /alt kırılımları aç/i })).not.toBeInTheDocument()
  })

  it('kilitli satir suruklenemez, yetkisiz kullanicida da surukleme kapali', async () => {
    listTreeChildrenMock.mockResolvedValue({
      items: [
        node({ id: 'lk', text_id: 'EH-KAHVE-TİD-USR-009', locked: true, hasChildren: false }),
      ],
    })
    renderPage()
    await screen.findByText('EH-KAHVE-TİD-USR-009')
    expect(rowOf('EH-KAHVE-TİD-USR-009')).toHaveAttribute('draggable', 'false')

    cleanup()
    canMock.mockReturnValue(false)
    listTreeChildrenMock.mockResolvedValue({
      items: [node({ id: 'u1', text_id: 'EH-KAHVE-TİD-USR-001', hasChildren: false })],
    })
    renderPage()
    await screen.findByText('EH-KAHVE-TİD-USR-001')
    expect(rowOf('EH-KAHVE-TİD-USR-001')).toHaveAttribute('draggable', 'false')
  })

  it('sag ustte "Gereksinim Ekle" ve "Kod Öneki" dugmeleri bulunur', async () => {
    listTreeChildrenMock.mockResolvedValue({ items: [node()] })
    renderPage()
    await screen.findByText('EH-KAHVE-TİD-USR-001')

    expect(screen.getByTestId('pbs-add-btn')).toBeInTheDocument()
    expect(screen.getByTestId('pbs-prefix-btn')).toBeInTheDocument()
  })

  it('"Kod Öneki" modali acilir ve onizleme yeni oneke gore guncellenir', async () => {
    listTreeChildrenMock.mockResolvedValue({ items: [node({ text_id: 'EH-KAHVE-TİD-HW-009' })] })
    renderPage()
    await screen.findByText('EH-KAHVE-TİD-HW-009')

    fireEvent.click(screen.getByTestId('pbs-prefix-btn'))
    const input = await screen.findByTestId('prefix-input')
    expect(input).toHaveValue('EH-KAHVE-TİD')

    fireEvent.change(input, { target: { value: 'EH-OTOPILOT-TİD' } })
    expect(screen.getByTestId('prefix-preview')).toHaveTextContent('EH-OTOPILOT-TİD-HW-009')
  })

  it('yetkisiz kullanicida "Gereksinim Ekle" dugmesi gorunmez', async () => {
    canMock.mockReturnValue(false)
    listTreeChildrenMock.mockResolvedValue({ items: [node({ hasChildren: false })] })
    renderPage()
    await screen.findByText('EH-KAHVE-TİD-USR-001')

    expect(screen.queryByTestId('pbs-add-btn')).not.toBeInTheDocument()
  })

  it('sag ustte "Öznitelik Yönet" dugmesi bulunur ve modali acar', async () => {
    listTreeChildrenMock.mockResolvedValue({ items: [node()] })
    renderPage()
    await screen.findByText('EH-KAHVE-TİD-USR-001')

    const btn = screen.getByTestId('pbs-attr-btn')
    expect(btn).toBeInTheDocument()
    expect(screen.queryByTestId('attr-manager-modal')).not.toBeInTheDocument()

    fireEvent.click(btn)
    expect(await screen.findByTestId('attr-manager-modal')).toBeInTheDocument()
  })

  it("'manage_fields' izni olmayan kullanicida Öznitelik Yönet gorunmez", async () => {
    canMock.mockImplementation((perm) => perm !== 'manage_fields')
    listTreeChildrenMock.mockResolvedValue({ items: [node({ hasChildren: false })] })
    renderPage()
    await screen.findByText('EH-KAHVE-TİD-USR-001')

    expect(screen.queryByTestId('pbs-attr-btn')).not.toBeInTheDocument()
  })

  it('tanimli her oznitelik icin tabloda sutun cikar (deger yoksa tire)', async () => {
    attrDefsMock.value = [
      {
        id: 'a1',
        entityType: 'requirement',
        key: 'priority',
        label: 'Priority',
        dataType: 'select',
        order: 0,
      },
      {
        id: 'a2',
        entityType: 'requirement',
        key: 'risk',
        label: 'Risk Skoru',
        dataType: 'number',
        order: 1,
      },
    ]
    listTreeChildrenMock.mockResolvedValue({
      items: [node({ attributes: { priority: 'High' } })], // risk degeri YOK
    })
    renderPage()
    const row = (await screen.findByText('EH-KAHVE-TİD-USR-001')).closest('tr')

    expect(screen.getByRole('columnheader', { name: /Risk Skoru/i })).toBeInTheDocument()
    expect(within(row).getByText('High')).toBeInTheDocument()
    expect(within(row).getByText('—')).toBeInTheDocument() // deger yok -> tire
  })

  it('gereksinimler degisince agac satirlari YENIDEN cekilir (bayat deger kalmaz)', async () => {
    listTreeChildrenMock.mockResolvedValue({ items: [node({ hasChildren: false })] })
    const { rerender } = renderPage()
    await waitFor(() => expect(listTreeChildrenMock).toHaveBeenCalledTimes(1))

    // Baska bir yerden (form/onay) bir gereksinim guncellendi:
    // AppContext listesinin imzasi degisir -> agac tazelenmeli.
    requirementsMock.value = [{ id: 'r1', updatedAt: '2026-01-02T00:00:00Z' }]
    rerender(
      <LanguageProvider>
        <PbsTree />
      </LanguageProvider>,
    )

    await waitFor(() => expect(listTreeChildrenMock).toHaveBeenCalledTimes(2))
  })
})
