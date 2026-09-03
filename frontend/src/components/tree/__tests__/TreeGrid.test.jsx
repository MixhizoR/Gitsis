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

const { listTreeChildrenMock, getAncestorsMock } = vi.hoisted(() => ({
  listTreeChildrenMock: vi.fn(),
  getAncestorsMock: vi.fn(),
}))

vi.mock('../../../context/AppContext.jsx', () => ({
  useApp: () => ({ projectId: 'p-1', requirements: [] }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../../services/dataService.js', () => ({
  listTreeChildren: listTreeChildrenMock,
  getAncestors: getAncestorsMock,
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
