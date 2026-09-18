// ============================================================================
//  viewConfig.js  —  Kayitli Gorunum (Saved View) yapilandirmasi.
//
//  Bir gorunum UC parcadan olusur ve uculu birlikte saklanir:
//    filters   : useEntityFilters semasi (arama + tip/alan/durum/atanan + attrs)
//    columns   : SIRALI [{ key, visible }] — EntityTable'in sutun duzeni
//    rowLayout : { pageSize, sortBy, sortDir } — satir duzeni
//
//  Sutun anahtarlari EntityTable ile ORTAKTIR; modular oznitelik sutunlari
//  'attr:<key>' biciminde tasinir (sutun kumesi projeye gore degistigi icin
//  sabit bir liste YETMEZ). Kaydedilmis bir duzen ile sayfanin O ANKI sutun
//  katalogu arasindaki fark `mergeColumnLayout` ile kapatilir: silinen
//  oznitelik duser, yeni eklenen oznitelik sona GORUNUR olarak eklenir —
//  boylece eski bir gorunum yeni bir projede de bozulmadan acilir.
//
//  Sunucu tarafi ayni semayi dogrular (backend/src/views.js); iki taraf
//  degisirse IKISI BIRDEN degismelidir.
// ============================================================================

// Siralama olcutleri (ana kolonlar). Ayrica 'attr:<key>' de gecerlidir.
export const SORT_KEYS = ['text_id', 'title', 'type', 'field', 'status', 'createdAt', 'updatedAt']

// Sayfa boyutu secenekleri; 0 => tumu (sayfalama kapali).
export const PAGE_SIZES = [10, 25, 50, 100, 200, 0]

export const DEFAULT_ROW_LAYOUT = { pageSize: 25, sortBy: 'text_id', sortDir: 'asc' }

export const ATTR_PREFIX = 'attr:'

/** 'attr:priority' -> 'priority'; ana kolonlarda null doner. */
export const attrKeyOf = (key) =>
  typeof key === 'string' && key.startsWith(ATTR_PREFIX) ? key.slice(ATTR_PREFIX.length) : null

/**
 * Bir varlik tipinin (requirement | testcase) SUTUN uretecek oznitelik
 * tanimlari: tanimlanan siraya gore. EntityTable ile sayfa (View katalogu)
 * AYNI listeyi kullanmak ZORUNDADIR — aksi halde 'attr:<key>' anahtarlari
 * tutmaz ve kaydedilmis duzen sessizce duser.
 */
export function entityAttrDefs(attributeDefs, entityType) {
  if (!entityType) return []
  return (attributeDefs || [])
    .filter((d) => d.entityType === entityType || d.entityType === 'both')
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/**
 * Sayfanin O ANKI sutun katalogu: EntityTable'in cizebilecegi tum sutunlar,
 * VARSAYILAN sirayla. `columns` eski (legacy) sutun listesidir — hangi
 * opsiyonel sutunlarin sayfada anlamli oldugunu soyler (orn. tip kilitliyse
 * 'type' yok). `locked: true` olan sutun gizlenemez (kod sutunu kaydin
 * kimligidir; gizlenirse satir tanimlanamaz hale gelir).
 */
export function columnCatalog({
  t,
  columns = [],
  attrDefs = [],
  showApproval = false,
  statusLabel = null,
}) {
  const has = (c) => columns.includes(c)
  const out = [
    { key: 'code', label: t('tbl.th.code'), locked: true },
    { key: 'title', label: t('tbl.th.title') },
  ]
  if (has('type')) out.push({ key: 'type', label: t('tbl.th.type') })
  if (has('field')) out.push({ key: 'field', label: t('form.field') })
  if (has('status')) out.push({ key: 'status', label: statusLabel || t('tbl.th.status') })
  for (const d of attrDefs) out.push({ key: `${ATTR_PREFIX}${d.key}`, label: d.label })
  if (has('links')) out.push({ key: 'links', label: t('tbl.th.links') })
  if (showApproval) {
    out.push({ key: 'approval', label: t('tbl.th.approval') })
    out.push({ key: 'approvalStatus', label: t('tbl.th.approvalStatus') })
  }
  out.push({ key: 'actions', label: t('tbl.th.actions') })
  return out
}

/** Katalogdan varsayilan duzen: hepsi gorunur, katalog sirasinda. */
export function defaultColumnLayout(catalog) {
  return catalog.map((c) => ({ key: c.key, visible: true }))
}

/**
 * Kaydedilmis duzeni GUNCEL katalogla birlestirir:
 *   - katalogda olmayan (silinmis oznitelik) anahtarlar duser,
 *   - kaydedilmemis YENI sutunlar sona gorunur olarak eklenir,
 *   - kilitli sutunlar her zaman gorunur kalir.
 * Kaydedilmis duzen yoksa varsayilan duzen doner.
 */
export function mergeColumnLayout(catalog, saved) {
  const known = new Map(catalog.map((c) => [c.key, c]))
  const out = []
  const seen = new Set()
  for (const item of Array.isArray(saved) ? saved : []) {
    const key = typeof item === 'string' ? item : item?.key
    if (!key || seen.has(key) || !known.has(key)) continue
    seen.add(key)
    const locked = Boolean(known.get(key).locked)
    out.push({ key, visible: locked ? true : item?.visible !== false })
  }
  for (const c of catalog) {
    if (seen.has(c.key)) continue
    out.push({ key: c.key, visible: true })
  }
  return out
}

/** Duzeni EntityTable'in bekledigi "gorunur anahtarlar" listesine indirger. */
export function visibleColumnKeys(layout) {
  return (layout || []).filter((c) => c.visible !== false).map((c) => c.key)
}

/** Sutunu listede bir adim yukari/asagi tasir (View duzenleyicisi icin). */
export function moveColumn(layout, key, delta) {
  const list = (layout || []).map((c) => ({ ...c }))
  const i = list.findIndex((c) => c.key === key)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return list
  ;[list[i], list[j]] = [list[j], list[i]]
  return list
}

/** Sutun gorunurlugunu degistirir; kilitli sutun daima gorunur kalir. */
export function toggleColumn(layout, key, catalog = []) {
  const locked = catalog.find((c) => c.key === key)?.locked
  return (layout || []).map((c) =>
    c.key === key ? { ...c, visible: locked ? true : c.visible === false } : c,
  )
}

/** Satir duzenini gecerli degerlere indirger (bozuk/eksik kayitlara karsi). */
export function normalizeRowLayout(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const size = Number(r.pageSize)
  const sortBy = String(r.sortBy || '')
  const sortByOk = SORT_KEYS.includes(sortBy) || Boolean(attrKeyOf(sortBy))
  return {
    pageSize: PAGE_SIZES.includes(size) ? size : DEFAULT_ROW_LAYOUT.pageSize,
    sortBy: sortByOk ? sortBy : DEFAULT_ROW_LAYOUT.sortBy,
    sortDir: r.sortDir === 'desc' ? 'desc' : 'asc',
  }
}

// --- Siralama ---------------------------------------------------------------
//  Kodlar (text_id) sayisal-duyarli karsilastirilir ki REQ-2, REQ-10'dan once
//  gelsin. Sayi ve tarih degerleri gercek tipleriyle karsilastirilir; bos
//  degerler yonden BAGIMSIZ olarak SONA atilir (bos satirlar listenin
//  basini kaplamasin).
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function cellValue(row, sortBy) {
  const attr = attrKeyOf(sortBy)
  if (attr) return (row.attributes || {})[attr]
  return row[sortBy]
}

function compareValues(a, b) {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b)
  const na = Number(a)
  const nb = Number(b)
  if (
    Number.isFinite(na) &&
    Number.isFinite(nb) &&
    String(a).trim() !== '' &&
    String(b).trim() !== ''
  )
    return na - nb
  return collator.compare(String(a), String(b))
}

/**
 * Satirlari gorunumun siralama olcutune gore siralar (kopya doner).
 * Bos degerler her iki yonde de sona duser; esitlikte text_id ile kararli
 * bir ikincil siralama uygulanir.
 */
export function sortRows(rows, rowLayout) {
  const { sortBy, sortDir } = normalizeRowLayout(rowLayout)
  const dir = sortDir === 'desc' ? -1 : 1
  return (rows || []).slice().sort((a, b) => {
    const va = cellValue(a, sortBy)
    const vb = cellValue(b, sortBy)
    const aEmpty = va === null || va === undefined || va === ''
    const bEmpty = vb === null || vb === undefined || vb === ''
    // Bos degerler yonden bagimsiz olarak sonda kalir.
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
    const cmp = compareValues(va, vb)
    if (cmp !== 0) return cmp * dir
    return collator.compare(String(a.text_id || ''), String(b.text_id || '')) * dir
  })
}

/**
 * Sayfalama. pageSize=0 => tumu. Sayfa numarasi 1 tabanlidir ve liste
 * kisaldiginda (filtre daraldi) gecerli araliga cekilir.
 */
export function paginate(rows, pageSize, page = 1) {
  const total = (rows || []).length
  const size = Number(pageSize) > 0 ? Number(pageSize) : 0
  if (!size) return { rows: rows || [], page: 1, pageCount: 1, total, pageSize: 0 }
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, Number(page) || 1), pageCount)
  const start = (current - 1) * size
  return {
    rows: (rows || []).slice(start, start + size),
    page: current,
    pageCount,
    total,
    pageSize: size,
  }
}

/**
 * Siralama olcutu secenekleri: sayfanin sutun katalogundan turetilir
 * (gorunmeyen bir sutuna gore siralamak anlamsiz degildir — katalogdaki
 * TUM siralanabilir sutunlar listelenir) + kayit/guncelleme tarihleri.
 * 'code' sutunu text_id'ye, 'attr:<key>' oznitelik degerine karsilik gelir.
 */
export function sortOptionsFromCatalog(catalog, t) {
  const map = { code: 'text_id', title: 'title', type: 'type', field: 'field', status: 'status' }
  const out = []
  for (const c of catalog || []) {
    if (map[c.key]) out.push({ value: map[c.key], label: c.label })
    else if (attrKeyOf(c.key)) out.push({ value: c.key, label: c.label })
  }
  out.push({ value: 'createdAt', label: t('sv.sortCreatedAt') })
  out.push({ value: 'updatedAt', label: t('sv.sortUpdatedAt') })
  return out
}
