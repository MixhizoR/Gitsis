// ============================================================================
//  sanitize.js — RichTextEditor'dan gelen HTML aciklamalari icin XSS temizligi.
//  Beyaz liste yalnizca editorun URETEBILECEGI etiket/oznitelikleri icerir
//  (kalin/italik/altcizili, yazi tipi/boyut/renk, liste, gomulu PNG/JPG).
//  <script>, on* olay ozellikleri, javascript: semalari ve <img> disinda
//  harici kaynak URL'leri ayiklanir.
// ============================================================================
import sanitizeHtml from 'sanitize-html'

const OPTS = {
  allowedTags: ['b', 'i', 'u', 'strong', 'em', 'span', 'div', 'p', 'br', 'ul', 'ol', 'li', 'font', 'img'],
  allowedAttributes: {
    '*': ['style'],
    font: ['color', 'face', 'size'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/],
      'font-family': [/^[\w\s,'"-]+$/],
      'font-size': [/^\d+(px|pt)?$/],
      'text-decoration': [/^underline$/],
      'font-weight': [/^(bold|normal|\d+)$/],
      'font-style': [/^italic$/],
    },
  },
  allowedSchemes: [],
  allowedSchemesByTag: { img: ['data'] },
  disallowedTagsMode: 'discard',
  // allowedSchemesByTag semasiz (relative) src'leri filtrelemez (orn. src="x");
  // bu yuzden img'i ayrica yalnizca gomulu base64 gorsellerle sinirlariz.
  exclusiveFilter: (frame) => frame.tag === 'img' && !/^data:image\//i.test(frame.attribs.src || ''),
}

/** Bir aciklama (description) alanindaki HTML'i guvenli hale getirir. */
export function cleanRichText(html) {
  if (!html) return ''
  return sanitizeHtml(String(html), OPTS)
}
