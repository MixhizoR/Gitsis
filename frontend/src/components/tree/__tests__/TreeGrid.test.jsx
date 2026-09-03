// ============================================================================
//  TreeGrid.test.jsx — PBS agaci lazy-load davranisi (Issue #9 / Adim 4).
//  Kapsam: mount'ta yalnizca kok cekilir, expand'de tek seviye cekilir,
//  ayni dugum ikinci kez acildiginda TEKRAR istek atilmaz (cache),
//  hasChildren=false olan dugumde expand butonu yoktur.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'

const { listTreeChildrenMock, getAncestorsMock, moveRequirementMock, canMock } = vi.hoisted(() => ({
  listTreeChildrenMock: vi.fn(),
  getAncestorsMock: vi.fn(),
  moveRequirementMock: vi.fn(),
  canMock: vi.fn(() => true),
}))

vi.mock('../../../context/AppContext.jsx', () => ({
  useApp: () => ({ projectId: 'p-1', requirements: [] }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ can: canMock }),
  AuthProvider: ({ children }) => children,
}))

vi.mock('../../../services/dataService.js', () => ({
  listTreeChildren: listTreeChildrenMock,
  getAncestors: getAncestorsMock,
  moveRequirement: moveRequirementMock,
}))

import TreeGrid from '../TreeGrid.jsx'

const node = (over = {}) => ({
  id: 'n-1',
  text_id: 'REQ-USR-001',
  title: 'Kok',
  type: 'User Requirement',
  status: 'In Review',
  dal_level: 'DAL D',
  hasChildren: true,
  ...over,
})

const renderTree = () =>
  render(
    <LanguageProvider>
      <TreeGrid />
    </LanguageProvider>,
  )

describe('TreeGrid — lazy-load PBS agaci', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canMock.mockReturnValue(true)
  })

  // vitest globals kapali oldugu icin RTL'in otomatik cleanup'i devreye
  // girmiyor; DOM'un testler arasi birikmemesi icin acikca temizliyoruz.
  afterEach(() => {
    cleanup()
  })

  it("mount'ta yalnizca kok dugumleri ceker (parentId'siz)", async () => {
    listTreeChildrenMock.mockResolvedValue({ items: [node()] })
    renderTree()

    await waitFor(() => expect(listTreeChildrenMock).toHaveBeenCalledTimes(1))
    expect(listTreeChildrenMock).toHaveBeenCalledWith('p-1', undefined)
    expect(await screen.findByText('REQ-USR-001')).toBeInTheDocument()
  })

  it('expand edildiginde SADECE o dugumun cocuklari cekilir ve render edilir', async () => {
    listTreeChildrenMock.mockResolvedValueOnce({ items: [node()] }).mockResolvedValueOnce({
      items: [node({ id: 'n-2', text_id: 'REQ-SYS-001', title: 'Orta', hasChildren: false })],
    })
    renderTree()
    await screen.findByText('REQ-USR-001')

    fireEvent.click(screen.getByRole('button', { name: /alt kırılımları aç/i }))

    await waitFor(() => expect(listTreeChildrenMock).toHaveBeenCalledTimes(2))
    expect(listTreeChildrenMock).toHaveBeenLastCalledWith('p-1', 'n-1')
    expect(await screen.findByText('REQ-SYS-001')).toBeInTheDocument()
  })

  it('ayni dugum tekrar acildiginda API TEKRAR cagrilmaz (cache)', async () => {
    listTreeChildrenMock.mockResolvedValueOnce({ items: [node()] }).mockResolvedValueOnce({
      items: [node({ id: 'n-2', text_id: 'REQ-SYS-001', hasChildren: false })],
    })
    renderTree()
    await screen.findByText('REQ-USR-001')

    const toggle = screen.getByRole('button', { name: /alt kırılımları aç/i })
    fireEvent.click(toggle) // ac -> fetch
    await waitFor(() => expect(listTreeChildrenMock).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: /alt kırılımları kapat/i })) // kapat
    fireEvent.click(screen.getByRole('button', { name: /alt kırılımları aç/i })) // tekrar ac

    await screen.findByText('REQ-SYS-001')
    expect(listTreeChildrenMock).toHaveBeenCalledTimes(2) // yeni istek YOK
  })

  it('hasChildren=false olan dugumde expand butonu gosterilmez', async () => {
    listTreeChildrenMock.mockResolvedValue({
      items: [node({ id: 'n-leaf', text_id: 'REQ-HW-001', hasChildren: false })],
    })
    renderTree()

    await screen.findByText('REQ-HW-001')
    expect(screen.queryByRole('button', { name: /alt kırılımları aç/i })).not.toBeInTheDocument()
  })
})

// ============================================================================
//  Surukle-birak ile tasima (Issue #9 / Adim 5)
// ============================================================================
describe('TreeGrid — surukle-birak tasima', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canMock.mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
  })

  // jsdom native drag-drop tasimadigi icin dataTransfer'i mock'luyoruz.
  const dt = () => ({ setData: vi.fn(), getData: vi.fn(), dropEffect: '' })

  // Kok: iki User Requirement. USR-002 surukleyip USR-001 uzerine birakmak
  // GECERSIZ (User'in usta olamaz); asagidaki senaryolarda System kullanilir.
  const twoRoots = {
    items: [
      node({ id: 'usr-1', text_id: 'REQ-USR-001', hasChildren: true }),
      node({ id: 'usr-2', text_id: 'REQ-USR-002', hasChildren: true }),
    ],
  }
  const sysChild = {
    items: [
      node({
        id: 'sys-1',
        text_id: 'REQ-SYS-001',
        title: 'Orta',
        type: 'System Requirement',
        hasChildren: false,
      }),
    ],
  }

  // USR-001 acilir, altindaki SYS-001 surukleyip USR-002 uzerine birakilir.
  async function setupAndDrag() {
    listTreeChildrenMock
      .mockResolvedValueOnce(twoRoots) // kok
      .mockResolvedValueOnce(sysChild) // usr-1 cocuklari
      .mockResolvedValue({ items: [] }) // tasima sonrasi tazeleme
    renderTree()
    await screen.findByText('REQ-USR-001')
    fireEvent.click(screen.getAllByRole('button', { name: /alt kırılımları aç/i })[0])
    const sysRow = await screen.findByTestId('tree-row-REQ-SYS-001')
    const targetRow = screen.getByTestId('tree-row-REQ-USR-002')
    fireEvent.dragStart(sysRow, { dataTransfer: dt() })
    fireEvent.dragOver(targetRow, { dataTransfer: dt() })
    return { sysRow, targetRow }
  }

  it('gecerli birakmada moveRequirement dogru argumanlarla cagrilir', async () => {
    moveRequirementMock.mockResolvedValue({ id: 'sys-1', parentId: 'usr-2' })
    const { targetRow } = await setupAndDrag()

    fireEvent.drop(targetRow, { dataTransfer: dt() })

    await waitFor(() => expect(moveRequirementMock).toHaveBeenCalledTimes(1))
    expect(moveRequirementMock).toHaveBeenCalledWith('p-1', 'sys-1', 'usr-2')
  })

  it('backend hata dondugunde tasima geri alinir ve hata gosterilir', async () => {
    moveRequirementMock.mockRejectedValue(
      Object.assign(
        new Error('Dongusel tasima: bir gereksinim kendi alt agacinin altina tasinamaz.'),
        {
          status: 400,
        },
      ),
    )
    const { targetRow } = await setupAndDrag()

    fireEvent.drop(targetRow, { dataTransfer: dt() })

    expect(await screen.findByText(/Dongusel tasima/i)).toBeInTheDocument()
    // Rollback: dugum hala agacta (eski yerinde) duruyor.
    expect(screen.getByTestId('tree-row-REQ-SYS-001')).toBeInTheDocument()
  })

  it('tip kuralina uymayan hedefe birakmada API hic cagrilmaz', async () => {
    listTreeChildrenMock.mockResolvedValueOnce(twoRoots).mockResolvedValue({ items: [] })
    renderTree()
    await screen.findByText('REQ-USR-001')

    // User Requirement'i baska bir User Requirement uzerine birakmak gecersiz.
    const source = screen.getByTestId('tree-row-REQ-USR-001')
    const target = screen.getByTestId('tree-row-REQ-USR-002')
    fireEvent.dragStart(source, { dataTransfer: dt() })
    fireEvent.drop(target, { dataTransfer: dt() })

    expect(moveRequirementMock).not.toHaveBeenCalled()
  })

  it('kilitli dugum suruklenemez (draggable=false)', async () => {
    listTreeChildrenMock.mockResolvedValue({
      items: [node({ id: 'locked-1', text_id: 'REQ-USR-009', locked: true, hasChildren: false })],
    })
    renderTree()

    const row = await screen.findByTestId('tree-row-REQ-USR-009')
    expect(row).toHaveAttribute('draggable', 'false')
  })

  it("yetkisiz kullanicida ('write' izni yok) surukleme kapalidir", async () => {
    canMock.mockReturnValue(false)
    listTreeChildrenMock.mockResolvedValue({
      items: [node({ id: 'usr-1', text_id: 'REQ-USR-001', hasChildren: false })],
    })
    renderTree()

    const row = await screen.findByTestId('tree-row-REQ-USR-001')
    expect(row).toHaveAttribute('draggable', 'false')
  })
})
