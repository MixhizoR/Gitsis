// ============================================================================
//  BulkAssignModal.test.jsx — Issue #120: listeden coklu secimle toplu atama.
//
//  Kapsam:
//   - Mod secimi (Ekle / Degistir / Kaldir) ve aciklamasi
//   - "Ekle"/"Kaldir" modunda kimse secilmeden gonderilemez
//   - "Degistir" modunda BOS secim gecerlidir (tum atamalari kaldirir) ve
//     kullaniciya bunun anlami yazili olarak soylenir
//   - Kilitli kayitlar icin ONCEDEN uyari (kac kayit atlanacak)
//   - Gonderimde context'e (ids, assigneeIds, mode) dogru iletilir
//   - Sonuc ozeti cagirana geri verilir (atlananlar sessizce yutulmaz)
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'

const bulkAssignRequirements = vi.fn()
const bulkAssignTestCases = vi.fn()

const PERSONNEL = [
  { id: 'u1', name: 'Ayşe Demir' },
  { id: 'u2', name: 'Mehmet Kaya' },
]

vi.mock('../../../context/AppContext.jsx', () => ({
  useApp: () => ({
    personnel: PERSONNEL,
    bulkAssignRequirements,
    bulkAssignTestCases,
  }),
  AppProvider: ({ children }) => children,
}))

import BulkAssignModal from '../BulkAssignModal.jsx'

const ROWS = [
  { id: 'r1', text_id: 'EH-USR-001', title: 'Bir', locked: false },
  { id: 'r2', text_id: 'EH-USR-002', title: 'Iki', locked: false },
]

const renderModal = (props = {}) =>
  render(
    <LanguageProvider>
      <BulkAssignModal open rows={ROWS} entity="requirement" onClose={vi.fn()} {...props} />
    </LanguageProvider>,
  )

// AssigneePicker tek bir <select> ile kisi ekler; testte o kutuyu kullaniriz.
const pickPerson = (id) => {
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[selects.length - 1], { target: { value: id } })
}

describe('BulkAssignModal — Issue #120', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bulkAssignRequirements.mockResolvedValue({ updated: 2, unchanged: 0, skippedLocked: 0 })
  })
  afterEach(() => cleanup())

  it('varsayilan mod "Ekle" ve kimse secilmeden gonderilemez', () => {
    renderModal()
    expect(screen.getByTestId('bulk-assign-mode-add')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('bulk-assign-submit')).toBeDisabled()
  })

  it('kisi secilince gonderilebilir ve context dogru argumanlarla cagrilir', async () => {
    renderModal()
    pickPerson('u1')
    const submit = screen.getByTestId('bulk-assign-submit')
    expect(submit).toBeEnabled()

    fireEvent.click(submit)
    await waitFor(() => expect(bulkAssignRequirements).toHaveBeenCalledTimes(1))
    expect(bulkAssignRequirements).toHaveBeenCalledWith(['r1', 'r2'], ['u1'], 'add')
  })

  it('"Degistir" modunda BOS secim gecerlidir ve anlami yazili olarak soylenir', () => {
    renderModal()
    fireEvent.click(screen.getByTestId('bulk-assign-mode-replace'))

    expect(screen.getByTestId('bulk-assign-submit')).toBeEnabled()
    expect(screen.getByText(/TÜM atamalarını kaldırır/)).toBeInTheDocument()
  })

  it('"Kaldir" modunda kimse secilmeden gonderilemez', () => {
    renderModal()
    fireEvent.click(screen.getByTestId('bulk-assign-mode-remove'))
    expect(screen.getByTestId('bulk-assign-submit')).toBeDisabled()
  })

  it('secilen mod istege gecirilir', async () => {
    renderModal()
    fireEvent.click(screen.getByTestId('bulk-assign-mode-remove'))
    pickPerson('u2')
    fireEvent.click(screen.getByTestId('bulk-assign-submit'))

    await waitFor(() => expect(bulkAssignRequirements).toHaveBeenCalledTimes(1))
    expect(bulkAssignRequirements).toHaveBeenCalledWith(['r1', 'r2'], ['u2'], 'remove')
  })

  it('kilitli kayitlar icin ONCEDEN uyari gosterilir', () => {
    renderModal({
      rows: [ROWS[0], { id: 'r3', text_id: 'EH-USR-003', title: 'Uc', locked: true }],
    })
    const warn = screen.getByTestId('bulk-assign-locked-warning')
    expect(warn).toHaveTextContent('1 kayıt onaylanmış ve kilitli')
    expect(warn).toHaveTextContent('1 kayda uygulanacak')
  })

  it('islem sonucu ozeti cagirana iletilir (atlananlar yutulmaz)', async () => {
    const onDone = vi.fn()
    bulkAssignRequirements.mockResolvedValue({ updated: 1, unchanged: 0, skippedLocked: 1 })
    renderModal({ onDone })
    pickPerson('u1')
    fireEvent.click(screen.getByTestId('bulk-assign-submit'))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith({ updated: 1, unchanged: 0, skippedLocked: 1 })
  })

  it('test senaryolarinda test ucunu cagirir', async () => {
    bulkAssignTestCases.mockResolvedValue({ updated: 2 })
    renderModal({ entity: 'testcase' })
    pickPerson('u1')
    fireEvent.click(screen.getByTestId('bulk-assign-submit'))

    await waitFor(() => expect(bulkAssignTestCases).toHaveBeenCalledTimes(1))
    expect(bulkAssignRequirements).not.toHaveBeenCalled()
  })

  it('backend hatasi modalde gosterilir, modal kapanmaz', async () => {
    const onClose = vi.fn()
    bulkAssignRequirements.mockRejectedValue(new Error('Gecersiz atama'))
    renderModal({ onClose })
    pickPerson('u1')
    fireEvent.click(screen.getByTestId('bulk-assign-submit'))

    await waitFor(() => expect(screen.getByText('Gecersiz atama')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })
})
