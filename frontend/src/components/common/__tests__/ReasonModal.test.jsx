// ============================================================================
//  ReasonModal.test.jsx — Silme oncesi zorunlu gerekce formu.
//  Kapsam: kisa gerekce ile gonderim engellenir, gecerli gerekce trim'lenerek
//  onConfirm'e iletilir, onConfirm hata firlatirsa modal acik kalir ve hatayi
//  gosterir, Iptal onClose'u cagirir.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'
import ReasonModal from '../ReasonModal.jsx'

const renderModal = (props = {}) =>
  render(
    <LanguageProvider>
      <ReasonModal open onClose={() => {}} onConfirm={vi.fn()} {...props} />
    </LanguageProvider>,
  )

describe('ReasonModal', () => {
  afterEach(() => cleanup())

  it('kapaliyken hicbir sey render etmez', () => {
    const { container } = render(
      <LanguageProvider>
        <ReasonModal open={false} onClose={() => {}} onConfirm={vi.fn()} />
      </LanguageProvider>,
    )
    expect(container.querySelector('.fixed')).toBeNull()
  })

  it('kisa gerekce ile "Sil" dugmesi devre disi kalir, onConfirm cagrilmaz', async () => {
    const onConfirm = vi.fn()
    renderModal({ onConfirm })
    fireEvent.change(screen.getByTestId('reason-modal-textarea'), { target: { value: 'ab' } })
    expect(screen.getByTestId('reason-modal-confirm')).toBeDisabled()
    fireEvent.click(screen.getByTestId('reason-modal-confirm'))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('gecerli (trim edilmis) gerekce ile onConfirm cagrilir', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    renderModal({ onConfirm })
    fireEvent.change(screen.getByTestId('reason-modal-textarea'), {
      target: { value: '  yanlis girilmis kayit  ' },
    })
    fireEvent.click(screen.getByTestId('reason-modal-confirm'))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('yanlis girilmis kayit'))
  })

  it('onConfirm hata firlatirsa hata gosterilir, modal acik kalir', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Silme gerekcesi zorunludur.'))
    const onClose = vi.fn()
    renderModal({ onConfirm, onClose })
    fireEvent.change(screen.getByTestId('reason-modal-textarea'), {
      target: { value: 'gecerli bir gerekce' },
    })
    fireEvent.click(screen.getByTestId('reason-modal-confirm'))
    expect(await screen.findByTestId('reason-modal-error')).toHaveTextContent(
      'Silme gerekcesi zorunludur.',
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Iptal tiklaninca onClose cagirilir, onConfirm cagrilmaz', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    renderModal({ onConfirm, onClose })
    fireEvent.click(screen.getByTestId('reason-modal-cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('itemLabel ve warning verilirse gosterilir', () => {
    renderModal({ itemLabel: 'REQ-USR-001 — Baslik', warning: 'Bu geri alinamaz.' })
    expect(screen.getByText('REQ-USR-001 — Baslik')).toBeInTheDocument()
    expect(screen.getByText('Bu geri alinamaz.')).toBeInTheDocument()
  })
})
