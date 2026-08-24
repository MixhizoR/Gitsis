// ============================================================================
//  documentService.js  —  Gelismis Yerel (Offline) Belge Analiz Motoru.
// ----------------------------------------------------------------------------
//  Amac: Kullanicinin yukledigi bir gereksinim belgesini (txt / md / csv /
//  json / pdf veya yapistirilmis metin) OKUYUP ANLAMAYA calisir:
//    1. Metni cumlelere/satirlara ayirir.
//    2. Gereksinim niteligi tasiyan cumleleri tespit eder ("shall" dili,
//       olculebilir kriter, REQ kodu, zorunluluk fiili...).
//    3. Her aday gereksinimin TIP'ini (System/Software/Hardware/Test Case) ve
//       ALAN'ini (HMI/Veritabani/Sunucu/Donanim...) anahtar kelimelerle tahmin
//       eder.
//    4. aiService.analyzeRequirement ile DO-178C kalite analizi yapar.
//    5. Belge ozeti + oneriler + iceri aktarilabilir gereksinim taslaklari uretir.
//
//  >>> TAMAMEN OFFLINE <<<  (metin formatlari icin internet gerektirmez)
//  Yalnizca PDF metni cikarmak gerektiginde pdf.js kutuphanesi CDN'den
//  tembel (lazy) yuklenir; basarisiz olursa kullaniciya metni yapistirmasi
//  onerilir. Mimari: UI -> services/documentService.js (diger servislerle
//  ayni katman). Bir backend NLP servisine gecmek istenirse yalnizca bu
//  dosyadaki fonksiyonlarin govdesi degistirilir.
// ============================================================================
import { analyzeRequirement } from './aiService.js'
import { REQ_TYPE, CATEGORY, PRIORITY, STATUS, DAL } from '../utils/constants.js'

// ---------------------------------------------------------------------------
//  1) DOSYA OKUMA
// ---------------------------------------------------------------------------

/** Duz metin dosyalarini okur (txt / md / csv / json / log ...). */
function readPlainText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Dosya okunamadi.'))
    reader.readAsText(file, 'utf-8')
  })
}

// pdf.js CDN'den yalnizca bir kez yuklenir.
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.mjs'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs'
let _pdfjsPromise = null

async function loadPdfJs() {
  if (_pdfjsPromise) return _pdfjsPromise
  _pdfjsPromise = (async () => {
    // Dinamik ESM importu (Vite bunu paketlemez; calisma aninda CDN'den ceker).
    const mod = await import(/* @vite-ignore */ PDFJS_CDN)
    const pdfjs = mod.default || mod
    if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
    return pdfjs
  })()
  return _pdfjsPromise
}

/** PDF dosyasindan metin cikarir (CDN uzerinden pdf.js ile). */
async function readPdfText(file) {
  let pdfjs
  try {
    pdfjs = await loadPdfJs()
  } catch {
    throw new Error(
      'PDF okuma kutuphanesi yuklenemedi (cevrimdisi olabilirsiniz). ' +
      'Lutfen belgenin metnini kopyalayip asagidaki alana yapistirin ya da .txt / .md dosyasi kullanin.'
    )
  }
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buf }).promise
  let out = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    out += content.items.map((it) => it.str).join(' ') + '\n'
  }
  return out
}

/**
 * Yuklenen dosyadan duz metin cikarir. Desteklenen: txt, md, csv, json, log, pdf.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractTextFromFile(file) {
  const name = (file.name || '').toLowerCase()
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf'
  if (isPdf) return readPdfText(file)
  return readPlainText(file)
}

// ---------------------------------------------------------------------------
//  2) METNI CUMLELERE AYIRMA
// ---------------------------------------------------------------------------

const BULLET_RE = /^\s*(?:[-*•·▪◦]|\d+[.)]|[a-zA-Z][.)]|REQ-[A-Z]+-\d+\s*[:.-]?)\s*/

/** Metni anlamli segmentlere (satir + cumle) boler ve temizler. */
export function splitSegments(text) {
  if (!text) return []
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const segments = []
  for (const line of lines) {
    const clean = line.replace(BULLET_RE, '').trim()
    if (!clean) continue
    // Cok uzun satirlari cumlelere de ayir.
    const parts = clean.split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/)
    for (const p of parts) {
      const s = p.trim()
      if (s.length >= 8) segments.push(s)
    }
  }
  return segments
}

// ---------------------------------------------------------------------------
//  3) GEREKSINIM TESPITI + SINIFLANDIRMA
// ---------------------------------------------------------------------------

const OBLIGATION_RE = /\b(olmal[iı]d[iı]r|olmal[iı]|zorunludur|gereklidir|gerekir|sa[gğ]lanmal[iı]d[iı]r|yap[iı]lmal[iı]d[iı]r|edilmelidir|verilmelidir|desteklemelidir|i[çc]ermelidir|gostermelidir|g[oö]stermelidir|korumalidir|korumal[iı]d[iı]r|islemelidir|i[şs]lemelidir|sunmal[iı]d[iı]r|tutmal[iı]d[iı]r|shall|must|is\s+required)\b/i
const REQCODE_RE = /\bREQ[-_ ]?[A-Z]{1,4}[-_ ]?\d{1,4}\b/i
const MEASURE_RE = /\d+\s*(ms|sn|s\b|saniye|dk|dakika|saat|mb|gb|kb|hz|mhz|ghz|%|yuzde|kullanici|istek|nit|db|volt|v\b|bar|°c|metre|m\b|kbit|cekirdek|core)/i

/** Bir segmentin gereksinim niteligi tasiyip tasimadigini soyler. */
function looksLikeRequirement(seg) {
  if (REQCODE_RE.test(seg)) return true
  if (OBLIGATION_RE.test(seg)) return true
  // Olculebilir kriter + yeterli uzunluk (zayif sinyal).
  if (MEASURE_RE.test(seg) && seg.length >= 30) return true
  return false
}

const TYPE_KEYWORDS = [
  { type: REQ_TYPE.TEST_CASE, re: /\b(test|senaryo|dogrula|do[gğ]rula|olc[uü]l[uü]r|enjekte|verify|verifi|kabul kriteri)\b/i },
  { type: REQ_TYPE.HARDWARE, re: /\b(donanim|donan[iı]m|devre|kart|islemci|i[şs]lemci|sensor|sens[oö]r|batarya|kablo|cip|[çc]ip|hoparlor|ekran donanim|blendaj|fiziksel|gerilim|guc kayna|g[uü][çc] kayna)\b/i },
  { type: REQ_TYPE.SYSTEM, re: /\b(sistem|sistemin)\b/i },
]

/** Segmentin gereksinim TIP'ini tahmin eder. */
export function guessType(seg) {
  for (const { type, re } of TYPE_KEYWORDS) {
    if (re.test(seg)) return type
  }
  return REQ_TYPE.SOFTWARE
}

const CATEGORY_KEYWORDS = [
  { cat: CATEGORY.HMI, re: /\b(aray[uü]z|arayuz|ekran|buton|menu|men[uü]|renk|pilot.*g[oö]ster|g[oö]rsel|hmi|gosterge|g[oö]sterge|tema|alarm|uyari|uyar[iı]|kullanici dostu|ses)/i },
  { cat: CATEGORY.DATABASE, re: /\b(veritaban|veri taban|kay[iı]t|kaydet|sakla|depola|database|sql|tablo|indeks|sorgu|tampon|sikistir|s[iı]k[iı][şs]t[iı]r)/i },
  { cat: CATEGORY.SERVER, re: /\b(sunucu|server|rest|api|telemetri|istemci|client|oturum|yayin|yay[iı]n|backend|servis|yuk|y[uü]k)/i },
  { cat: CATEGORY.COMMS, re: /\b(haberlesme|haberle[şs]me|paket|crc|arinc|iletim|protokol|veri yolu|bus|baglanti|ba[gğ]lant[iı]|mesaj)/i },
  { cat: CATEGORY.SAFETY, re: /\b(guvenli|g[uü]venli|yetki|parola|sifre|[şs]ifre|kimlik|ariza|ar[iı]za|fdir|emniyet|denetim|audit|rol|kisitla|k[iı]s[iı]tla)/i },
  { cat: CATEGORY.PERFORMANCE, re: /\b(\d+\s*(ms|sn|saniye|hz|mhz|ghz)|gecikme|tepki s[uü]re|performans|h[iı]z|throughput|jitter|periyot)/i },
  { cat: CATEGORY.HARDWARE, re: /\b(donanim|donan[iı]m|devre|islemci|i[şs]lemci|sensor|sens[oö]r|batarya|guc|g[uü][çc]|kablo|blendaj|nit|volt)/i },
]

/** Segmentin ALAN (kategori/disiplin) tahminini yapar. */
export function guessCategory(seg) {
  for (const { cat, re } of CATEGORY_KEYWORDS) {
    if (re.test(seg)) return cat
  }
  return CATEGORY.SOFTWARE
}

/** Segmentten kisa bir baslik turetir. */
function deriveTitle(seg) {
  let t = seg.replace(REQCODE_RE, '').trim()
  // Ilk virgule veya ilk 8 kelimeye kadar al.
  const comma = t.indexOf(',')
  if (comma > 12 && comma < 60) t = t.slice(0, comma)
  const words = t.split(/\s+/).slice(0, 9).join(' ')
  let title = words.replace(/[.;:]+$/, '')
  if (title.length > 70) title = title.slice(0, 67) + '…'
  // Bas harfi buyut.
  return title.charAt(0).toLocaleUpperCase('tr-TR') + title.slice(1)
}

// ---------------------------------------------------------------------------
//  4) ANA ANALIZ FONKSIYONU
// ---------------------------------------------------------------------------

/**
 * Belge metnini analiz eder; aday gereksinimleri cikarir, siniflandirir ve
 * her birinin DO-178C kalite skorunu hesaplar.
 * @param {string} text
 * @returns {{
 *   totalSegments:number,
 *   requirements: Array<{
 *     id:number, raw:string, title:string, description:string,
 *     type:string, category:string, priority:string, status:string,
 *     dal_level:string, quality:{status:string, score:number, messages:string[], vagueWords:string[]}
 *   }>,
 *   summary: object
 * }}
 */
export function analyzeDocument(text) {
  const segments = splitSegments(text)
  const requirements = []
  let idSeq = 0

  for (const seg of segments) {
    if (!looksLikeRequirement(seg)) continue
    const type = guessType(seg)
    const category = guessCategory(seg)
    const quality = analyzeRequirement({ title: '', description: seg })
    // Oncelik: dusuk kaliteli/kritik kelimeli olanlara gore basit kural.
    const isCritical = /\b(kritik|guvenli|g[uü]venli|ariza|ar[iı]za|acil|emniyet)\b/i.test(seg)
    const priority = isCritical ? PRIORITY.HIGH : MEASURE_RE.test(seg) ? PRIORITY.MEDIUM : PRIORITY.LOW

    requirements.push({
      id: ++idSeq,
      raw: seg,
      title: deriveTitle(seg),
      description: seg,
      type,
      category,
      priority,
      status: STATUS.DRAFT,
      dal_level: isCritical ? DAL.B : DAL.C,
      quality,
    })
  }

  return {
    totalSegments: segments.length,
    requirements,
    summary: summarize(segments, requirements),
  }
}

// ---------------------------------------------------------------------------
//  5) BELGE OZETI + ONERILER
// ---------------------------------------------------------------------------

function summarize(segments, requirements) {
  const n = requirements.length
  const countBy = (key) =>
    requirements.reduce((acc, r) => {
      acc[r[key]] = (acc[r[key]] || 0) + 1
      return acc
    }, {})

  const avgScore = n
    ? Math.round(requirements.reduce((s, r) => s + r.quality.score, 0) / n)
    : 0

  const measurable = requirements.filter((r) => MEASURE_RE.test(r.raw)).length
  const vague = requirements.filter((r) => r.quality.vagueWords.length > 0).length
  const weak = requirements.filter((r) => r.quality.status === 'error').length

  const recommendations = []
  if (n === 0) {
    recommendations.push(
      'Belgede "olmalidir / zorunludur / shall" gibi zorunluluk dili tasiyan net bir gereksinim cumlesi bulunamadi. ' +
      'Cumleleri DO-178C shall-diliyle yeniden yazmaniz onerilir.'
    )
  } else {
    if (measurable / n < 0.5) {
      recommendations.push(
        `Gereksinimlerin yalnizca %${Math.round((measurable / n) * 100)}'i olculebilir bir kriter iceriyor. ` +
        'Sure, esik veya yuzde gibi sayisal degerler ekleyin (orn. "200 ms icinde").'
      )
    }
    if (vague > 0) {
      recommendations.push(
        `${vague} gereksinimde mugla ifade (orn. "hizli", "kullanici dostu") tespit edildi. ` +
        'Bunlar test edilebilir degildir; netlestirilmelidir.'
      )
    }
    if (weak > 0) {
      recommendations.push(
        `${weak} gereksinim "test edilemez" olarak isaretlendi. Iceri aktarmadan once gozden gecirin.`
      )
    }
    if (recommendations.length === 0) {
      recommendations.push('Belge genel olarak iyi yapilandirilmis; cikarilan gereksinimler iceri aktarmaya hazirdir.')
    }
  }

  return {
    extracted: n,
    avgScore,
    measurable,
    measurablePct: n ? Math.round((measurable / n) * 100) : 0,
    vague,
    weak,
    byType: countBy('type'),
    byCategory: countBy('category'),
    recommendations,
  }
}

// ---------------------------------------------------------------------------
//  6) ICERI AKTARMA YARDIMCISI
// ---------------------------------------------------------------------------

/** Cikarilan bir gereksinim taslagini createRequirement icin uygun nesneye cevirir. */
export function toRequirementInput(item) {
  // Yeni sema: 'category' -> 'field'. Durum backend'de otomatik hesaplanir
  // (baglanan test senaryolarindan); bu yuzden burada gonderilmez.
  return {
    title: item.title,
    description: item.description,
    type: item.type,
    field: item.category,
    priority: item.priority,
    dal_level: item.dal_level,
  }
}
