// ============================================================================
//  CommentsTab.test.jsx — Yeniden kullanilabilir yorum alani.
//  Kapsam: loading / empty / error durumlari, ad+rol+zaman+metin gosterimi,
//  bos yorum gonderilememesi, basarili eklemede alanin temizlenmesi, silme
//  yetkisinin (kendi yorumu / PM / baskasi) dogru uygulanmasi ve silmeden
//  once ZORUNLU gerekce istenmesi.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'
import CommentsTab from '../CommentsTab.jsx'

// Oturum, testten teste degistirilebilsin diye degisken uzerinden okunur.
let session = { id: 'user-1', name: 'Ahmet Yilmaz', isPM: true }
vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ currentUser: session, isPM: session.isPM }),
  AuthProvider: ({ children }) => children,
}))

const Wrap = ({ children }) => <LanguageProvider>{children}</LanguageProvider>

const COMMENTS = [
  {
    id: 'c1',
    authorId: 'user-1',
    authorName: 'Ahmet Yilmaz',
    authorRole: 'Product Manager',
    text: 'Kabul kriterlerini netlestirebilir miyiz?',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'c2',
    authorId: 'personnel-9',
    authorName: 'Ayse Demir',
    authorRole: 'Business Analyst',
    text: 'Ilgili kismi guncelledim.',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
]

const renderTab = (props = {}) =>
  render(
    <Wrap>
      <CommentsTab
        comments={COMMENTS}
        loading={false}
        error={null}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </Wrap>,
  )

describe('CommentsTab', () => {
  afterEach(() => {
    cleanup()
    session = { id: 'user-1', name: 'Ahmet Yilmaz', isPM: true }
  })

  it('yükleniyor durumunu gösterir', () => {
    renderTab({ comments: [], loading: true })
    expect(screen.getByText(/yükleniyor/i)).toBeInTheDocument()
  })

  it('hiç yorum yoksa boş durum mesajı gösterir', () => {
    renderTab({ comments: [] })
    expect(screen.getByText('Henüz yorum yok.')).toBeInTheDocument()
    expect(screen.getByText(/ilk yorumu siz yapın/i)).toBeInTheDocument()
  })

  it('yükleme hatasını gösterir', () => {
    renderTab({ comments: [], error: 'boom' })
    expect(screen.getByText(/yüklenemedi/i)).toBeInTheDocument()
  })

  it('her yorumda ad, rol, göreli zaman ve metin gösterir', () => {
    renderTab()
    expect(screen.getByText('Ahmet Yilmaz')).toBeInTheDocument()
    expect(screen.getByText('Product Manager')).toBeInTheDocument()
    expect(screen.getByText('Kabul kriterlerini netlestirebilir miyiz?')).toBeInTheDocument()
    expect(screen.getByText(/10 dk önce/)).toBeInTheDocument()
    expect(screen.getAllByTestId('comment-item')).toHaveLength(2)
  })

  it('boş yorum gönderilemez (buton pasif)', () => {
    renderTab()
    const btn = screen.getByTestId('comment-submit')
    expect(btn).toBeDisabled()
    // Yalnizca bosluk da yeterli degil.
    fireEvent.change(screen.getByTestId('comment-input'), { target: { value: '   ' } })
    expect(btn).toBeDisabled()
  })

  it('yorum ekler ve başarıda alanı temizler', async () => {
    const onAdd = vi.fn().mockResolvedValue({ id: 'c3' })
    renderTab({ onAdd })
    const input = screen.getByTestId('comment-input')
    fireEvent.change(input, { target: { value: '  Yeni yorum  ' } })
    fireEvent.click(screen.getByTestId('comment-submit'))

    // Metin trim'lenerek gonderilir.
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Yeni yorum'))
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('ekleme hatası kullanıcıya gösterilir', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Sunucu reddetti.'))
    renderTab({ onAdd })
    fireEvent.change(screen.getByTestId('comment-input'), { target: { value: 'deneme' } })
    fireEvent.click(screen.getByTestId('comment-submit'))
    expect(await screen.findByText('Sunucu reddetti.')).toBeInTheDocument()
  })

  it('PM tüm yorumları silebilir', () => {
    renderTab()
    expect(screen.getByTestId('comment-delete-c1')).toBeInTheDocument()
    expect(screen.getByTestId('comment-delete-c2')).toBeInTheDocument()
  })

  it('PM olmayan kullanıcı YALNIZCA kendi yorumunu silebilir', () => {
    session = { personnelId: 'personnel-9', name: 'Ayse Demir', isPM: false }
    renderTab()
    // Kendi yorumu (c2) silinebilir, baskasininki (c1) silinemez.
    expect(screen.getByTestId('comment-delete-c2')).toBeInTheDocument()
    expect(screen.queryByTestId('comment-delete-c1')).not.toBeInTheDocument()
  })

  it('silmeden önce ZORUNLU gerekçe ister ve gerekçeyle siler', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderTab({ onDelete })

    fireEvent.click(screen.getByTestId('comment-delete-c2'))
    const textarea = await screen.findByTestId('reason-modal-textarea')
    // Gerekce bos iken onay butonu pasif.
    expect(screen.getByTestId('reason-modal-confirm')).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'Konu disi yorum.' } })
    fireEvent.click(screen.getByTestId('reason-modal-confirm'))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c2', 'Konu disi yorum.'))
  })
})
