// ============================================================================
//  ViewModalSource.test.jsx — Gereksinim detayindaki "Kaynak" satiri.
//  Kapsam: dokumandan turetilen gereksinimde kaynak gosterimi, kaynak
//  dokuman silindiginde "silinmis" uyarisi ve kaynagi olmayan kayitta
//  satirin hic cikmamasi.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'
import ViewModal from '../ViewModal.jsx'

vi.mock('../../../context/AppContext.jsx', () => ({
  useApp: () => ({ attributeDefs: [] }),
  AppProvider: ({ children }) => children,
}))

// RichTextEditor bu testin konusu degil; sade bir yer tutucuyla degistirilir.
vi.mock('../RichTextEditor.jsx', () => ({
  default: ({ value }) => <div data-testid="rte">{value}</div>,
}))

const BASE = {
  id: 'r1',
  text_id: 'EH-SYS-001',
  title: 'Espresso demleme suresi',
  description: 'Sistem 25 saniye icinde uretmelidir.',
  type: 'System Requirement',
  attributes: {},
}

const Wrap = ({ children }) => <LanguageProvider>{children}</LanguageProvider>

describe('ViewModal — kaynak izlenebilirligi', () => {
  afterEach(cleanup)

  it('kaynağı olmayan gereksinimde "Kaynak" satırı gösterilmez', () => {
    render(
      <Wrap>
        <ViewModal open row={BASE} onClose={vi.fn()} />
      </Wrap>,
    )
    expect(screen.queryByText('Kaynak')).not.toBeInTheDocument()
  })

  it('kaynak dokümanı ve alıntıyı gösterir; tıklanınca dokümanı açar', () => {
    const onOpenSource = vi.fn()
    render(
      <Wrap>
        <ViewModal
          open
          onClose={vi.fn()}
          onOpenSource={onOpenSource}
          row={{
            ...BASE,
            sourceDocumentId: 'doc-1',
            sourceDocumentName: 'SGD_v1.0.pdf',
            sourceStart: 100,
            sourceEnd: 160,
            sourceQuote: 'Sistem 25 saniye icinde uretmelidir.',
          }}
        />
      </Wrap>,
    )
    expect(screen.getByText('Kaynak')).toBeInTheDocument()
    const btn = screen.getByTestId('view-source-open')
    expect(btn).toHaveTextContent('SGD_v1.0.pdf')
    fireEvent.click(btn)
    expect(onOpenSource).toHaveBeenCalledTimes(1)
  })

  it('kaynak doküman silinmişse "silinmiş" uyarısı gösterilir, alıntı korunur', () => {
    render(
      <Wrap>
        <ViewModal
          open
          onClose={vi.fn()}
          row={{
            ...BASE,
            // Dokuman silininde FK SetNull ile bosa duser; ad ve alinti KALIR.
            sourceDocumentId: null,
            sourceDocumentName: 'SGD_v1.0.pdf',
            sourceQuote: 'Dokumandan alinan ham pasaj metni.',
          }}
        />
      </Wrap>,
    )
    expect(screen.getByText(/silinmiş/i)).toHaveTextContent('SGD_v1.0.pdf')
    // Dokuman yok: acma dugmesi de yok.
    expect(screen.queryByTestId('view-source-open')).not.toBeInTheDocument()
    // Alinti hala okunabilir olmali (izlenebilirlik kaybolmaz).
    expect(screen.getByText(/Dokumandan alinan ham pasaj metni/)).toBeInTheDocument()
  })
})
