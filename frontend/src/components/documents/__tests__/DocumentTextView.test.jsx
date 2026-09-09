// ============================================================================
//  DocumentTextView.test.jsx — Dokuman metninden gereksinim uretme akisi.
//  Kapsam: secim yokken "+" gorunmez / secim yapilinca gorunur, secilen
//  araligin karakter konumu, kaynak olmus pasajlarin vurgulanmasi ve
//  baslik turetme.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'
import DocumentTextView, { buildSegments, deriveTitle } from '../DocumentTextView.jsx'

const TEXT = 'Sistem, 200 ms icinde yanit vermelidir. Batarya 30 dakika beslemelidir.'

const Wrap = ({ children }) => <LanguageProvider>{children}</LanguageProvider>

/**
 * jsdom'da gercek fare secimi yok; window.getSelection() taklit edilir.
 * Verilen [start, end) araligini, DOM'daki dogru segment dugumune isaret
 * eden sahte bir Range ile dondurur.
 */
function mockSelection(container, start, end) {
  const segs = [...container.querySelectorAll('[data-offset]')]
  const nodeFor = (pos) => {
    // Konumu kapsayan segment (son segment icin ust sinir dahil).
    const seg =
      segs.find((el) => {
        const s = Number(el.dataset.offset)
        return pos >= s && pos < s + el.textContent.length
      }) || segs[segs.length - 1]
    return { node: seg.firstChild || seg, offset: pos - Number(seg.dataset.offset) }
  }
  const a = nodeFor(start)
  const b = nodeFor(end)
  const value = TEXT.slice(start, end)

  vi.stubGlobal('getSelection', () => ({
    isCollapsed: start === end,
    rangeCount: 1,
    toString: () => value,
    getRangeAt: () => ({
      startContainer: a.node,
      startOffset: a.offset,
      endContainer: b.node,
      endOffset: b.offset,
      commonAncestorContainer: container.querySelector('[data-testid="document-text"]'),
      getBoundingClientRect: () => ({ right: 120, top: 40 }),
    }),
  }))
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

describe('DocumentTextView — metinden gereksinim uretme', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('metin seçimi yokken + düğmesi görünmez', () => {
    render(
      <Wrap>
        <DocumentTextView text={TEXT} onCreate={vi.fn()} />
      </Wrap>,
    )
    expect(screen.queryByTestId('selection-add-btn')).not.toBeInTheDocument()
  })

  it('seçim yapılınca + düğmesi görünür ve seçilen aralığı bildirir', () => {
    const onCreate = vi.fn()
    const { container } = render(
      <Wrap>
        <DocumentTextView text={TEXT} onCreate={onCreate} />
      </Wrap>,
    )

    mockSelection(container, 0, 39)
    const btn = screen.getByTestId('selection-add-btn')
    expect(btn).toBeInTheDocument()
    // Erisilebilirlik: gercek buton + aria-label (klavye/ekran okuyucu).
    expect(btn).toHaveAttribute('aria-label')

    fireEvent.click(btn)
    expect(onCreate).toHaveBeenCalledWith({
      text: 'Sistem, 200 ms icinde yanit vermelidir.',
      start: 0,
      end: 39,
    })
  })

  it('yalnızca boşluktan oluşan seçimde + düğmesi görünmez', () => {
    const { container } = render(
      <Wrap>
        <DocumentTextView text={TEXT} onCreate={vi.fn()} />
      </Wrap>,
    )
    // 6-7: "," ve bosluk -> anlamli metin yok.
    mockSelection(container, 6, 8)
    // toString() bosluk donduruyorsa dugme cikmamali.
    vi.stubGlobal('getSelection', () => ({
      isCollapsed: false,
      rangeCount: 1,
      toString: () => '   ',
      getRangeAt: () => ({}),
    }))
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    expect(screen.queryByTestId('selection-add-btn')).not.toBeInTheDocument()
  })

  it('Alt+Enter kısayolu seçimi gereksinime çevirir (fare gerekmez)', () => {
    const onCreate = vi.fn()
    const { container } = render(
      <Wrap>
        <DocumentTextView text={TEXT} onCreate={onCreate} />
      </Wrap>,
    )
    mockSelection(container, 40, 71)
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true }))
    })
    expect(onCreate).toHaveBeenCalledWith({
      text: 'Batarya 30 dakika beslemelidir.',
      start: 40,
      end: 71,
    })
  })

  it('kaynak olmuş pasajlar vurgulanır', () => {
    const { container } = render(
      <Wrap>
        <DocumentTextView
          text={TEXT}
          sources={[{ start: 0, end: 39, label: 'REQ-SYS-001' }]}
          onCreate={vi.fn()}
        />
      </Wrap>,
    )
    const marked = container.querySelector('[data-offset="0"]')
    expect(marked.className).toMatch(/amber/)
    expect(marked).toHaveAttribute('title', expect.stringContaining('REQ-SYS-001'))
  })
})

describe('buildSegments / deriveTitle — saf fonksiyonlar', () => {
  it('vurgu yoksa tek segment üretir', () => {
    expect(buildSegments('abc', [])).toEqual([{ start: 0, end: 3, text: 'abc', marks: [] }])
  })

  it('vurgulu aralığı ayrı segmente böler', () => {
    const segs = buildSegments('abcdef', [{ start: 2, end: 4, label: 'R1' }])
    expect(segs.map((s) => s.text)).toEqual(['ab', 'cd', 'ef'])
    expect(segs[1].marks).toEqual(['R1'])
    expect(segs[0].marks).toEqual([])
  })

  it('metin sınırını aşan aralığı kırpar', () => {
    const segs = buildSegments('abc', [{ start: 1, end: 99, label: 'R1' }])
    expect(segs.map((s) => s.text)).toEqual(['a', 'bc'])
  })

  it('başlığı ilk cümleden türetir', () => {
    expect(deriveTitle('Sistem yanit vermelidir. Ikinci cumle.')).toBe('Sistem yanit vermelidir.')
    expect(deriveTitle('  ')).toBe('')
    expect(deriveTitle('x'.repeat(200)).length).toBeLessThanOrEqual(120)
    expect(deriveTitle('x'.repeat(200))).toMatch(/…$/)
  })
})
