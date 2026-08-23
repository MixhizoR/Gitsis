// ============================================================================
//  aiService.js  —  Yerel AI Gereksinim Analiz Motoru (DO-178C uyumlu).
//  Hiçbir dış bağlantı kullanmaz; saf kural + regex tabanlı analiz yapar.
//  Mimari: UI → services/aiService.js (diğer servislerle aynı katmanda).
// ============================================================================

// --- Muğlak / belirsiz kelime desenleri (DO-178C §6.3b Testability ihlali) -
const VAGUE_PATTERNS = [
  { pattern: /\b(h[iı]zl[iı]|yavaş|hızlıca|yavaşça)\b/i,       label: 'hızlı/yavaş' },
  { pattern: /\b(iyi|güzel|kötü|berbat|süper)\b/i,               label: 'iyi/kötü/güzel' },
  { pattern: /\b(verimli|etkin|etkili|verimsiz)\b/i,             label: 'verimli/etkin' },
  { pattern: /\b(g[uü][çc]l[uü]|zayıf|güçsüz)\b/i,              label: 'güçlü/zayıf' },
  { pattern: /\b(güvenilir|kararlı|stabil|güvenilmez)\b/i,       label: 'güvenilir/stabil' },
  { pattern: /\b(uygun|yeterli|yeterliyse|makul|kabul\s*edilebilir)\b/i, label: 'uygun/yeterli/makul' },
  { pattern: /\b(modern|gelişmiş|ileri|eski|eskimiş)\b/i,        label: 'modern/gelişmiş' },
  { pattern: /\b(kolay|basit|karmaşık|zor|simple)\b/i,           label: 'kolay/basit/zor' },
  { pattern: /\b(user[\s-]friendly|kullanıcı\s*dostu|sezgisel)\b/i, label: 'user-friendly' },
  { pattern: /\b(büyük|küçük|az|çok|birçok|birkaç|fazla|sınırlı)\b/i, label: 'büyük/küçük/az/çok' },
  { pattern: /\b(optimal|maksimal|minimal|robust|esnek|flexible)\b/i, label: 'optimal/robust/esnek' },
  { pattern: /\b(yüksek|düşük|orta)\s+(performans|kalite|seviye)\b/i, label: 'yüksek/düşük performans' },
  { pattern: /\b(pratik|kullanışlı|işlevsel)\b/i,                label: 'pratik/kullanışlı' },
]

// --- Ölçülebilirlik desenleri (sayısal kriter varlığı) --------------------
const MEASURABLE_PATTERNS = [
  /\d+\s*(ms|milisaniye|millisecond)/i,
  /\d+\s*(sn|s\b|saniye|second|sec)/i,
  /\d+\s*(dk|dakika|minute|min)/i,
  /\d+\s*(saat|hour|h\b)/i,
  /\d+\s*(mb|gb|kb|byte|bit)/i,
  /\d+\s*(%|yüzde|percent)/i,
  /\d+\s*(hz|mhz|ghz|rpm|fps)/i,
  /\d+\s*(kullanıcı|user|adet|tane|istek|request|işlem|transaction)/i,
  /(en\s*az|en\s*fazla|minimum|maksimum|max|min|en\s*çok|en\s*az)\s*\d+/i,
  /\d+\s*(altında|üstünde|üzerinde|içinde|ötesinde)/i,
  /\d+\s*(°C|kelvin|bar|psi|volt|amper|watt|newton)/i,
]

// --- Zorunluluk fiilleri (DO-178C "shall" dili) ---------------------------
const OBLIGATION_PATTERNS = [
  /\b(olmalıdır|olmaldır|olmali|olmalı)\b/i,
  /\b(zorunludur|gereklidir|gerekir|gereklidir)\b/i,
  /\b(sağlanmalıdır|saglanmalıdır|yapılmalıdır|edilmelidir|verilmelidir)\b/i,
  /\b(shall|must|is\s+required|is\s+mandatory)\b/i,
  /\b(garanti\s*edilmelidir|temin\s*edilmelidir)\b/i,
]

// --- Çoklu gereksinim uyarısı (DO-178C atomicity) -------------------------
const MULTIPLE_REQ_PATTERNS = [
  /\bhem\b.{3,40}\bhem\b/i,
  /\bve\s+ayrıca\b/i,
  /\bve\s+aynı\s+zamanda\b/i,
  /\bve\s+bunun\s+yanı\s+sıra\b/i,
]

/**
 * Gereksinim metnini DO-178C kurallarına göre yerel olarak analiz eder.
 * @param {{ title?: string, description?: string }} param
 * @returns {{ status: 'ok'|'warning'|'error', messages: string[], score: number, vagueWords: string[] }}
 */
export function analyzeRequirement({ title = '', description = '' }) {
  const text = `${title} ${description}`.trim()

  if (text.length < 10) {
    return {
      status: 'error',
      messages: ['Analiz için yeterli metin yok. Başlık ve tanım alanlarını doldurun.'],
      score: 0,
      vagueWords: [],
    }
  }

  const messages = []
  const vagueWords = []
  let score = 100

  // --- Kural 1: Muğlak kelime kontrolü ------------------------------------
  for (const { pattern, label } of VAGUE_PATTERNS) {
    if (pattern.test(text)) vagueWords.push(label)
  }
  if (vagueWords.length > 0) {
    score -= Math.min(vagueWords.length * 18, 54)
    messages.push(
      `Muğlak ifade tespit edildi: "${vagueWords.join('", "')}". ` +
      `DO-178C §6.3 gereği gereksinimler test edilebilir olmalıdır — net ölçüt belirtin (ör: "< 200 ms içinde").`
    )
  }

  // --- Kural 2: Ölçülebilirlik kontrolü -----------------------------------
  const hasMeasurable = MEASURABLE_PATTERNS.some((p) => p.test(text))
  if (!hasMeasurable) {
    score -= 15
    messages.push(
      `Sayısal kriter bulunamadı. Süre, boyut veya eşik değeri eklemeniz önerilir ` +
      `(ör: "200 ms içinde", "en fazla 3 deneme", "%99,9 uptime").`
    )
  }

  // --- Kural 3: Zorunluluk fiili kontrolü ---------------------------------
  const hasObligation = OBLIGATION_PATTERNS.some((p) => p.test(text))
  if (!hasObligation) {
    score -= 10
    messages.push(
      `Zorunluluk fiili eksik. "olmalıdır", "zorunludur", "sağlanmalıdır" gibi ` +
      `ifadeler kullanın (DO-178C shall-dili geregi).`
    )
  }

  // --- Kural 4: Atomicity (tek gereksinim) --------------------------------
  const isMultiple = MULTIPLE_REQ_PATTERNS.some((p) => p.test(text))
  if (isMultiple) {
    score -= 10
    messages.push(
      `Birden fazla gereksinim tek cümlede görünüyor. Her gereksinim bağımsız olmalıdır ` +
      `(DO-178C atomicity kuralı).`
    )
  }

  score = Math.max(0, score)

  // Sonuç sınıflandırması
  const hasVagueAndNoMeasurable = vagueWords.length > 0 && !hasMeasurable
  if (hasVagueAndNoMeasurable || score < 40) {
    return {
      status: 'error',
      messages: [
        'Gereksinim test edilebilir değil — lütfen netleştirin.',
        ...messages,
      ],
      score,
      vagueWords,
    }
  }

  if (score >= 75 && messages.length === 0) {
    return {
      status: 'ok',
      messages: ['Gereksinim DO-178C standartlarına göre uygundur.'],
      score,
      vagueWords: [],
    }
  }

  return {
    status: score >= 75 ? 'ok' : 'warning',
    messages: messages.length > 0 ? messages : ['Gereksinim genel olarak uygundur, küçük iyileştirmeler önerilebilir.'],
    score,
    vagueWords,
  }
}
