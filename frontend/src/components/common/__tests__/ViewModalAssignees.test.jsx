// ============================================================================
//  ViewModalAssignees.test.jsx — Kayit detayindaki "Atanan Kişiler" bolumu.
//
//  Atama COKLUDUR ve listede (EntityTable) sutun olarak GOSTERILMEZ; tek yeri
//  goz (Read) ikonuyla acilan bu modaldir. Sira anlamlidir: ilk kisi birincil
//  sorumludur, bu yuzden rozetler numaralanir.
//
//  Kapsam:
//   - Atananlar ATAMA SIRASIYLA, numaralanmis olarak gosterilir
//   - Kimse atanmamissa bolum hic cikmaz
//   - Eski tek-atama alani (assigneeId) da okunur
//   - Cozulemeyen (silinmis) personel id'si sessizce dusurulur
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'
import ViewModal from '../ViewModal.jsx'

const { appMock } = vi.hoisted(() => ({
  appMock: {
    personnel: [
      { id: 'p1', firstName: 'Ayse', lastName: 'Demir' },
      { id: 'p2', firstName: 'Mehmet', lastName: 'Kaya' },
    ],
  },
}))

vi.mock('../../../context/AppContext.jsx', () => ({
  useApp: () => ({ attributeDefs: [], personnel: appMock.personnel }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../RichTextEditor.jsx', () => ({
  default: ({ value }) => <div data-testid="rte">{value}</div>,
}))

const BASE = {
  id: 'r1',
  text_id: 'EH-SYS-001',
  title: 'Ucus guvenligi ve emniyet',
  description: '',
  type: 'System Requirement',
  attributes: {},
}

const renderModal = (row) =>
  render(
    <LanguageProvider>
      <ViewModal open row={row} onClose={vi.fn()} />
    </LanguageProvider>,
  )

describe('ViewModal — Atanan Kişiler', () => {
  afterEach(cleanup)

  it('atananlari ATAMA SIRASIYLA numaralayarak gosterir', () => {
    renderModal({ ...BASE, assigneeIds: ['p2', 'p1'] })
    const section = screen.getByTestId('view-assignees')
    expect(within(section).getByText('Atanan Kişiler')).toBeInTheDocument()

    const items = within(section).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('1')
    expect(items[0]).toHaveTextContent('Mehmet Kaya')
    expect(items[1]).toHaveTextContent('2')
    expect(items[1]).toHaveTextContent('Ayse Demir')
  })

  it('atama yoksa bolum hic gosterilmez', () => {
    renderModal({ ...BASE, assigneeIds: [] })
    expect(screen.queryByTestId('view-assignees')).not.toBeInTheDocument()
  })

  it('eski tek-atama alanini (assigneeId) da okur', () => {
    renderModal({ ...BASE, assigneeId: 'p1' })
    expect(within(screen.getByTestId('view-assignees')).getByText('Ayse Demir')).toBeInTheDocument()
  })

  it('adi cozulemeyen (silinmis) personel listeden dusurulur', () => {
    renderModal({ ...BASE, assigneeIds: ['p1', 'silinmis-id'] })
    const items = within(screen.getByTestId('view-assignees')).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Ayse Demir')
  })
})
