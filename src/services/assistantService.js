// ============================================================================
//  assistantService.js  —  Yerel AI Asistan Niyet (Intent) Motoru.
//  İnternete çıkmaz; kelime eşleştirme + regex tabanlı çalışır.
//
//  v2 — AKILLI ASISTAN: artik yalnizca sayfa yonlendirmesi yapmaz; canli
//  uygulamanin "yoneticisi" gibi davranir:
//    * FILTRELEME : dogal dil -> Gereksinimler sayfasinda otomatik filtre.
//        Orn. "DAL A olanlari listele", "Onceligi High olan yazilim
//             gereksinimlerini goster", "Testi eksik sistem gereksinimleri".
//    * AKSIYON    : tek bir gereksinim uzerinde islem.
//        Orn. "REQ-SW-001 onceligini Low yap", "REQ-SYS-002 durumunu incele".
//
//  Bu modul SAF'tir (veriye erismez): yalnizca mesaji ayristirip yapilandirilmis
//  bir niyet nesnesi dondurur. Niyeti CALISTIRMAK (filtre uygula / servis cagir)
//  AIAssistant bileseninin gorevidir; boylece veri katmani soyutlamasi korunur.
// ============================================================================
import { REQ_TYPE, PRIORITY, STATUS, DAL, CATEGORY } from '../utils/constants.js'

// --- Sayfa yonlendirme niyetleri --------------------------------------------
const NAV_INTENTS = [
  {
    patterns: [/dashboard|ana\s*ekran|gosterge|gösterge|panel|anasayfa|ana\s*sayfa|başlangıç|baslangic|eve\s*git|home/i],
    target: 'dashboard',
    emoji: '🏠',
    reply: 'Gosterge Paneli\'ne yönlendiriyorum.',
  },
  {
    patterns: [/gereksinim|requirement|req[\s-]|liste|ekle.*gereksinim|yeni.*gereksinim/i],
    target: 'requirements',
    emoji: '📋',
    reply: 'Gereksinimler sayfasına gidiyoruz.',
  },
  {
    patterns: [/izlenebilirlik|traceability|matris|matrix|bağlantı|baglanti|link|satisfies|verifies/i],
    target: 'traceability',
    emoji: '🔗',
    reply: 'İzlenebilirlik Matrisi\'ne yönlendiriyorum.',
  },
  {
    patterns: [/kapsam|coverage|rapor|report|do[\s-]?178|test.*kapsam|kapsam.*disi/i],
    target: 'coverage',
    emoji: '🛡️',
    reply: 'DO-178C Kapsam Raporu\'na gidiyoruz.',
  },
  {
    patterns: [/belge|doküman|dokuman|document|analiz|yükle|yukle|içe\s*aktar|ice\s*aktar|pdf|metin.*oku|yapay\s*zeka.*belge/i],
    target: 'documents',
    emoji: '✨',
    reply: 'AI Belge Analizi sayfasına yönlendiriyorum.',
  },
  {
    patterns: [/audit|denetim|değişiklik|degisiklik|tarihce|tarihçe|log|history|geçmiş|gecmis/i],
    target: 'audit',
    emoji: '📜',
    reply: 'Değişiklik Tarihçesi\'ne yönlendiriyorum.',
  },
]

const HELP_PATTERNS = /yardım|yardim|help|ne\s*yapabilir|neler|komut|sayfalar|nereye/i
const GREETING_PATTERNS = /^(merhaba|selam|hey|hi|hello|naber|nasılsın|nasilsin)\b/i

const SUGGESTIONS = [
  { text: 'Gereksinimler', emoji: '📋' },
  { text: 'Kapsam Raporu', emoji: '🛡️' },
  { text: 'İzlenebilirlik', emoji: '🔗' },
  { text: 'AI Belge Analizi', emoji: '✨' },
  { text: 'Audit Log', emoji: '📜' },
]

// Akilli komut ornekleri (Welcome kartinda gosterilir; tiklayinca calisir).
const SMART_EXAMPLES = [
  'DAL A olanları listele',
  'Önceliği High olan yazılım gereksinimleri',
  'Testi eksik sistem gereksinimlerini getir',
  'REQ-SW-001 önceliğini Low yap',
  'REQ-SYS-002 durumunu incele',
]

// ---------------------------------------------------------------------------
//  Varlik (entity) ayristiricilar.
// ---------------------------------------------------------------------------
const DAL_MAP = { a: DAL.A, b: DAL.B, c: DAL.C, d: DAL.D, e: DAL.E }

const PRIORITY_MAP = [
  { re: /(high|yüksek|yuksek|kritik)/i, val: PRIORITY.HIGH },
  { re: /(medium|orta)/i, val: PRIORITY.MEDIUM },
  { re: /(low|düşük|dusuk)/i, val: PRIORITY.LOW },
]

const TYPE_MAP = [
  { re: /(sistem|system|sys)\b/i, val: REQ_TYPE.SYSTEM },
  { re: /(yazıl|yazil|software|\bsw\b)/i, val: REQ_TYPE.SOFTWARE },
  { re: /(donan|hardware|\bhw\b)/i, val: REQ_TYPE.HARDWARE },
  { re: /(test\s*senaryo|test\s*case|\btc\b|test edilen)/i, val: REQ_TYPE.TEST_CASE },
]

const STATUS_MAP = [
  { re: /(approved|onayl|onaylanm)/i, val: STATUS.APPROVED },
  { re: /(rejected|redded|reddedil|\bred\b)/i, val: STATUS.REJECTED },
  { re: /(in.?review|incelemede|beklemede|review|incele\s*durum)/i, val: STATUS.IN_REVIEW },
  { re: /(draft|taslak)/i, val: STATUS.DRAFT },
]

const CATEGORY_MAP = [
  { re: /(arayüz|arayuz|hmi)/i, val: CATEGORY.HMI },
  { re: /(yazılım|yazilim|kontrol)/i, val: CATEGORY.SOFTWARE },
  { re: /(donanım|donanim)/i, val: CATEGORY.HARDWARE },
  { re: /(veritaban|database)/i, val: CATEGORY.DATABASE },
  { re: /(sunucu|altyapı|altyapi|server)/i, val: CATEGORY.SERVER },
  { re: /(haberleşme|haberlesme|comms|iletişim|iletisim)/i, val: CATEGORY.COMMS },
  { re: /(güvenlik|guvenlik|emniyet|safety)/i, val: CATEGORY.SAFETY },
  { re: /(performans|performance)/i, val: CATEGORY.PERFORMANCE },
  { re: /(genel|general)/i, val: CATEGORY.GENERAL },
]

const TEXT_ID_RE = /\bREQ-[A-Z]+-\d{1,4}\b/i
const UNCOVERED_RE = /(test.{0,8}eksik|kapsam.?d[ıi]ş|test edilm|doğrulanma|dogrulanma|tc yok|test yok|verifies yok|eksik test)/i

function matchFirst(map, text) {
  for (const m of map) if (m.re.test(text)) return m.val
  return null
}

// DAL seviyesini serbest ifadelerden yakalar:
//   "DAL B", "dal b", "B seviyesi", "seviye b", "level c" ...
function parseDal(text) {
  const m =
    text.match(/\bdal\s*([a-e])\b/i) ||
    text.match(/\b([a-e])\s*seviye/i) ||
    text.match(/\bseviye\w*\s*([a-e])\b/i) ||
    text.match(/\blevel\s*([a-e])\b/i)
  return m ? DAL_MAP[m[1].toLowerCase()] : null
}

function parseFilters(text) {
  const filters = {}
  const type = matchFirst(TYPE_MAP, text)
  if (type) filters.type = type
  const priority = matchFirst(PRIORITY_MAP, text)
  if (priority) filters.priority = priority
  const status = matchFirst(STATUS_MAP, text)
  if (status) filters.status = status
  const category = matchFirst(CATEGORY_MAP, text)
  if (category) filters.category = category
  const dal = parseDal(text)
  if (dal) filters.dal_level = dal
  if (UNCOVERED_RE.test(text)) filters.uncovered = true
  return filters
}

// "listeleme" niyeti tetikleyici fiiller (filtre talebi oldugunu gosterir).
const LIST_VERB_RE = /(listele|getir|göster|goster|filtrele|bul|hangileri|olanlar|olanları|olanlari|görmek istiyorum|gormek istiyorum|ları getir|leri getir)/i

// Aksiyon (deger atama) fiilleri.
const SET_VERB_RE = /(yap|ayarla|değiştir|degistir|güncelle|guncelle|olsun|olarak ayarla|set et|ata)/i
// Inceleme fiilleri.
const INSPECT_RE = /(incele|durumunu|detay|analiz et|göster|goster|nedir|kapsam.?ı|durum.?u)/i

// Hangi alanin guncellenecegini ve hedef degeri ayristirir.
function parseUpdate(text) {
  // "öncelik" sozcugu cekimlenince yumusayabilir (öncelik -> önceliğini);
  // bu yuzden "önceli/onceli" kokunu yakalamak yeterli.
  if (/(önceli|onceli|priority)/i.test(text)) {
    const val = matchFirst(PRIORITY_MAP, text)
    if (val) return { field: 'priority', value: val, fieldLabel: 'Öncelik' }
  }
  if (/(\bdal\b|seviye|kritiklik|assurance)/i.test(text)) {
    // "DAL A", "A seviyesi", "seviyesini A yap" gibi varyantlari yakala:
    // "dal" ve "seviye..." sozcuklerini temizleyip ilk tek harfli A-E'yi al.
    const cleaned = text.replace(/\bdal\b/gi, ' ').replace(/seviye\w*/gi, ' ')
    const dalMatch =
      text.match(/\bdal\s*([a-e])\b/i) || cleaned.match(/\b([a-e])\b/i)
    if (dalMatch) return { field: 'dal_level', value: DAL_MAP[dalMatch[1].toLowerCase()], fieldLabel: 'DAL' }
  }
  if (/(kategori|alan|domain|disiplin)/i.test(text)) {
    const val = matchFirst(CATEGORY_MAP, text)
    if (val) return { field: 'category', value: val, fieldLabel: 'Alan' }
  }
  return null
}

/**
 * Kullanıcı mesajını analiz eder, yapilandirilmis niyet nesnesi dondurur.
 *
 * Donen niyet tipleri:
 *   { type:'greeting'|'help'|'unknown', reply, suggestions? }
 *   { type:'navigate', target, reply }
 *   { type:'filter',   target:'requirements', filters:{...}, reply }
 *   { type:'action', op:'update', textId, field, value, fieldLabel }
 *   { type:'action', op:'inspect', textId }
 *
 * Not: 'action' ve kismen 'filter' niyetlerinin SON yaniti, gercek veriyle
 * AIAssistant bileseninde olusturulur (bu modul veriye erismez).
 */
export function detectIntent(text) {
  const t = (text || '').trim()
  if (!t) return null

  // 1) Selamlama
  if (GREETING_PATTERNS.test(t)) {
    return {
      type: 'greeting',
      reply: 'Merhaba! 👋 Size hem sayfalarda gezinmede hem de gereksinimleri filtrelemek/düzenlemekte yardımcı olabilirim. Birkaç örnek aşağıda.',
      suggestions: true,
    }
  }

  // 2) Tek gereksinim uzerinde AKSIYON (text_id iceriyorsa)
  const idMatch = t.match(TEXT_ID_RE)
  if (idMatch) {
    const textId = idMatch[0].toUpperCase()
    const update = parseUpdate(t)
    // Once "deger atama" mi? (set fiili + ayristirilabilir alan)
    if (update && SET_VERB_RE.test(t)) {
      return { type: 'action', op: 'update', textId, ...update }
    }
    // Degilse inceleme/durum sorgusu.
    if (INSPECT_RE.test(t) || /durum/i.test(t)) {
      return { type: 'action', op: 'inspect', textId }
    }
    // text_id var ama belirsiz: yine de inceleme yap.
    return { type: 'action', op: 'inspect', textId }
  }

  // 3) FILTRELEME niyeti.
  //    Artik LISTELEME fiili SART DEGIL: mesajda taninabilir herhangi bir
  //    varlik (tip / oncelik / durum / kategori / DAL / kapsam-disi) varsa
  //    dogrudan filtre uygulanir. Boylece "DAL B", "test case olanlar",
  //    "onceligi yuksek", "kapsam disi" gibi serbest ifadeler de calisir.
  const filters = parseFilters(t)
  const hasFilter = Object.keys(filters).length > 0
  if (hasFilter) {
    return {
      type: 'filter',
      target: 'requirements',
      filters,
      reply: '🔎 Filtreyi uyguluyorum ve Gereksinimler sayfasına götürüyorum…',
    }
  }

  // 4) Yardim
  if (HELP_PATTERNS.test(t)) {
    return {
      type: 'help',
      reply: 'Şunları yapabilirim: sayfalar arası geçiş, doğal dille filtreleme (örn. "DAL A olanları listele") ve gereksinim düzenleme (örn. "REQ-SW-001 önceliğini Low yap").',
      suggestions: true,
    }
  }

  // 5) Sayfa yonlendirme
  for (const intent of NAV_INTENTS) {
    if (intent.patterns.some((p) => p.test(t))) {
      return { type: 'navigate', target: intent.target, reply: `${intent.emoji} ${intent.reply}` }
    }
  }

  // 6) Anlasilamadi
  return {
    type: 'unknown',
    reply: 'Anlayamadım 🤔 Bir örnek deneyin: "Önceliği High olan yazılım gereksinimlerini listele" ya da "REQ-SYS-002 durumunu incele".',
    suggestions: true,
  }
}

export { SUGGESTIONS, SMART_EXAMPLES }
