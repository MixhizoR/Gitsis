// ============================================================================
//  aiEngineService.js  —  KOPRU: modern arayuz  <->  arkadasin LM Studio+Gemma
//  motoru (Python FastAPI: api_server.py).
// ----------------------------------------------------------------------------
//  Bu servis SADECE gereksinim CIKARIR (online motor). Veritabanina yazmaz,
//  test eslestirmesi yapmaz. Cikan adaylar DocumentAnalysis sayfasindaki ayni
//  tablo/secim akisiyla, mevcut addRequirement (gercek backend) uzerinden
//  sisteme eklenir. Yani calisan duzen bozulmaz; burasi yalniz bir "kaynak".
//
//  Motor adresi: .env icinde VITE_AI_URL ile degistirilebilir.
//    (varsayilan: http://localhost:8008)
// ============================================================================
import { REQ_TYPE, CATEGORY, PRIORITY, STATUS, DAL } from '../utils/constants.js'

const AI_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_AI_URL) ||
  'http://localhost:8008'

// Motor seviye anahtari -> sitemizin REQ_TYPE degeri (guvenlik icin ikinci kat).
const LEVEL_TO_TYPE = {
  user: REQ_TYPE.USER,
  system: REQ_TYPE.SYSTEM,
  subsystem: REQ_TYPE.SOFTWARE, // alt-sistem varsayilan Yazilim; kullanici satirda degistirebilir
}

/** Basit olculebilirlik sezgisi (oncelik/DAL tahmini icin). */
const MEASURE_RE =
  /\d+\s*(ms|sn|s\b|saniye|dk|dakika|saat|mb|gb|kb|hz|mhz|ghz|%|db|volt|v\b|bar|°c|mm|cm|metre|m\b|w\b|rpm|pulse|step|kg|g\b)/i
const CRITICAL_RE =
  /\b(kritik|guvenli|g[uü]venli|ariza|ar[iı]za|acil|emniyet|tasma|ta[şs]ma|kilit)\b/i

/**
 * Motorun dondurdugu ham maddeyi, DocumentAnalysis tablosunun bekledigi
 * gereksinim taslagi sekline getirir (offline motorla ayni alanlar).
 */
export function toDraft(item, idx) {
  const desc = item.description || item.title || ''
  const type = LEVEL_TO_TYPE[item.level] || item.type || REQ_TYPE.SOFTWARE
  const isCritical = CRITICAL_RE.test(desc)
  const measurable = MEASURE_RE.test(desc)
  return {
    id: item.id ?? idx + 1,
    level: item.level || null, // regenerate icin seviye korunur
    raw: desc,
    title: item.title || desc.slice(0, 60),
    description: desc,
    type,
    category: CATEGORY.GENERAL,
    priority: isCritical ? PRIORITY.HIGH : measurable ? PRIORITY.MEDIUM : PRIORITY.LOW,
    status: STATUS.DRAFT,
    dal_level: isCritical ? DAL.B : DAL.C,
    // Online motorda ayrintili kalite skoru yok; UI kirilmasin diye notr deger.
    quality: { status: 'ok', score: 100, messages: [], vagueWords: [] },
    source: 'gemma',
  }
}

/** Motor + LM Studio ayakta mi? */
export async function pingEngine() {
  const res = await fetch(`${AI_BASE}/health`, { method: 'GET' })
  if (!res.ok) throw new Error(`Motor yaniti: ${res.status}`)
  return res.json() // { ok, model, lmstudio_reachable, ... }
}

/**
 * Belgeyi motora gonderir, gereksinim adaylarini alir.
 * @param {{ file?:File, text?:string, counts:{user:number,system:number,subsystem:number} }} args
 * @returns {Promise<{ summary:object, requirements:Array, sourceText:string }>}
 */
export async function analyzeWithEngine({ file, text, counts }) {
  const form = new FormData()
  if (file) form.append('file', file)
  if (text) form.append('text', text)
  form.append('n_user', String(counts?.user ?? 0))
  form.append('n_system', String(counts?.system ?? 0))
  form.append('n_subsystem', String(counts?.subsystem ?? 0))

  const res = await fetch(`${AI_BASE}/analyze`, { method: 'POST', body: form })
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg)
  }
  const data = await res.json()
  const requirements = (data.requirements || []).map(toDraft)
  return {
    summary: data.summary || {},
    requirements,
    // regenerate icin belge metnini sakla (dosya yuklendiyse UI'da metin olmayabilir).
    sourceText: text || '',
  }
}

/**
 * Tek bir maddeyi ayni belge baglaminda yeniden uretir.
 * @param {{ level:string, sourceText:string, avoid?:string[] }} args
 * @returns {Promise<object>} yeni taslak (toDraft ciktisi)
 */
export async function regenerateItem({ level, sourceText, avoid }) {
  const res = await fetch(`${AI_BASE}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, source_text: sourceText, avoid: avoid || [] }),
  })
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg)
  }
  const data = await res.json()
  return toDraft(data.requirement, 0)
}

async function safeError(res) {
  try {
    const j = await res.json()
    return j.detail || j.error || `Motor hatasi (${res.status})`
  } catch {
    return `Motor hatasi (${res.status})`
  }
}

export { AI_BASE }
