// ============================================================================
//  DocumentTextView.jsx  —  Dokumanin duz metnini SECILEBILIR olarak gosterir
//  ve secimden gereksinim uretme akisini baslatir.
//
//  NASIL CALISIR
//   * Metin, backend'de yukleme aninda cikarilan `extractedText`tir. Karakter
//     araliklari (start/end) DAIMA bu metne goredir; bu yuzden metni burada
//     asla degistirmiyoruz (trim/normalize YOK) — aksi halde kaydedilmis
//     gereksinimlerin araliklari kayar.
//   * Metin, "segment" adli <span>'lere bolunerek cizilir. Her segmentin
//     data-offset'i, metnin basindan itibaren KACINCI karakterde basladigini
//     soyler. Boylece window.getSelection() ile secilen araligin global
//     karakter konumu, DOM'da gezinmeye gerek kalmadan hesaplanabilir.
//   * Zaten bir gereksinime kaynak olmus pasajlar ayri segment olarak
//     isaretlenir (sari vurgu) — kullanici neyin kullanildigini gorur.
//
//  ERISILEBILIRLIK (issue #18): yuzen dugme gercek bir <button>'dur
//  (aria-label + baslik), secim yapilinca odaklanilabilir hale gelir ve
//  klavyeden Alt+Enter kisayolu ile de tetiklenir.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconPlus } from '../common/Icons.jsx'
import { useLang } from '../../context/LanguageContext.jsx'

/**
 * Kaynak araliklarindan (highlights) cakisMAYAN, sirali segmentler uretir.
 * @param {string} text
 * @param {Array<{start:number,end:number,label:string}>} ranges
 * @returns {Array<{start:number,end:number,text:string,marks:string[]}>}
 */
export function buildSegments(text, ranges) {
  const valid = (ranges || [])
    .filter(
      (r) =>
        Number.isInteger(r.start) &&
        Number.isInteger(r.end) &&
        r.end > r.start &&
        r.start < text.length,
    )
    .map((r) => ({ ...r, end: Math.min(r.end, text.length) }))
  if (valid.length === 0) return [{ start: 0, end: text.length, text, marks: [] }]

  // Sinir noktalari: her araligin basi ve sonu bir segment sinirini belirler.
  const bounds = new Set([0, text.length])
  for (const r of valid) {
    bounds.add(r.start)
    bounds.add(r.end)
  }
  const points = [...bounds].sort((a, b) => a - b)

  const segments = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]
    if (end <= start) continue
    // Bu parcayi kapsayan tum kaynaklarin etiketleri.
    const marks = valid.filter((r) => r.start <= start && r.end >= end).map((r) => r.label)
    segments.push({ start, end, text: text.slice(start, end), marks })
  }
  return segments
}

/** Secilen metinden gereksinim basligi turetir: ilk cumle ya da ilk satir. */
export function deriveTitle(selected) {
  const clean = String(selected || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return ''
  // Once cumle sonu (. ! ?), yoksa ilk satir, yoksa tamami — 120 karakterle sinirli.
  const sentence = clean.split(/(?<=[.!?])\s/)[0]
  const candidate = sentence || clean
  return candidate.length > 120 ? candidate.slice(0, 117) + '…' : candidate
}

export default function DocumentTextView({ text, sources = [], onCreate }) {
  const { t } = useLang()
  const containerRef = useRef(null)
  // { text, start, end, x, y } — secim yoksa null (dugme de gorunmez).
  const [selection, setSelection] = useState(null)

  const segments = useMemo(() => buildSegments(text || '', sources), [text, sources])

  /** Secimin metin icindeki global karakter araligini hesaplar. */
  const readSelection = useCallback(() => {
    const sel = window.getSelection?.()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
    const value = sel.toString()
    // Bos ya da yalnizca bosluk iceren secimde dugme GOSTERILMEZ.
    if (!value.trim()) return null

    const range = sel.getRangeAt(0)
    const root = containerRef.current
    if (!root || !root.contains(range.commonAncestorContainer)) return null

    // Segmentin data-offset'i + dugum ici offset = global karakter konumu.
    const offsetOf = (node, nodeOffset) => {
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
      const seg = el?.closest?.('[data-offset]')
      if (!seg) return null
      return Number(seg.dataset.offset) + nodeOffset
    }
    const start = offsetOf(range.startContainer, range.startOffset)
    const end = offsetOf(range.endContainer, range.endOffset)
    if (start === null || end === null || end <= start) return null

    // Dugmeyi secimin hemen yanina koy (kapsayiciya gore).
    const rect = range.getBoundingClientRect()
    const box = root.getBoundingClientRect()
    return {
      text: value,
      start,
      end,
      x: rect.right - box.left + root.scrollLeft,
      y: rect.top - box.top + root.scrollTop,
    }
  }, [])

  // Secim degisimini dinle. mouseup/keyup yeterli degil: fare disariya
  // birakildiginda da secim degisebilir, bu yuzden selectionchange kullaniyoruz.
  useEffect(() => {
    const onSelectionChange = () => setSelection(readSelection())
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [readSelection])

  const fire = useCallback(() => {
    if (!selection) return
    onCreate?.({ text: selection.text, start: selection.start, end: selection.end })
  }, [selection, onCreate])

  // Klavye kisayolu: secim varken Alt+Enter (fare gerektirmez, WCAG #18).
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && e.key === 'Enter' && selection) {
        e.preventDefault()
        fire()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selection, fire])

  return (
    <div className="relative">
      <div
        ref={containerRef}
        data-testid="document-text"
        className="relative whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-4 font-mono text-[13px] leading-relaxed text-slate-800 selection:bg-brand-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:selection:bg-brand-700/60"
      >
        {segments.map((seg) => (
          <span
            key={seg.start}
            data-offset={seg.start}
            title={
              seg.marks.length ? t('docsel.alreadyUsed', { list: seg.marks.join(', ') }) : undefined
            }
            className={
              seg.marks.length
                ? 'rounded-sm bg-amber-100 underline decoration-amber-500 decoration-dotted underline-offset-2 dark:bg-amber-500/20'
                : undefined
            }
          >
            {seg.text}
          </span>
        ))}
      </div>

      {/* Yuzen "+" — yalnizca gecerli bir secim varken. */}
      {selection && (
        <button
          type="button"
          onClick={fire}
          data-testid="selection-add-btn"
          aria-label={t('docsel.addAria')}
          title={t('docsel.addTitle')}
          style={{ left: selection.x + 8, top: selection.y - 4 }}
          className="absolute z-10 flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-lg transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <IconPlus size={14} />
          {t('docsel.addShort')}
        </button>
      )}
    </div>
  )
}
