// ============================================================================
//  viewConfig.test.js — Kayitli Gorunum (Saved View) yapilandirmasi.
//  Kapsam: sutun katalogu, kaydedilmis duzenin GUNCEL katalogla birlesmesi
//  (silinen oznitelik duser, yeni oznitelik eklenir), kilitli sutun,
//  siralama (bos degerler sonda) ve sayfalama.
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  columnCatalog,
  defaultColumnLayout,
  entityAttrDefs,
  mergeColumnLayout,
  moveColumn,
  normalizeRowLayout,
  paginate,
  sortRows,
  sortOptionsFromCatalog,
  toggleColumn,
  visibleColumnKeys,
} from '../viewConfig.js'

// i18n yerine anahtari aynen donen sahte ceviri — test dile bagli olmasin.
const t = (k) => k

const attrDefs = [
  { id: 'a1', key: 'priority', label: 'Priority', entityType: 'both', order: 0 },
  { id: 'a2', key: 'risk', label: 'Risk', entityType: 'requirement', order: 1 },
]

const catalogOf = (over = {}) =>
  columnCatalog({ t, columns: ['type', 'field', 'status', 'links'], attrDefs, ...over })

describe('viewConfig — sutun katalogu', () => {
  it('sayfanin cizebilecegi TUM sutunlari varsayilan sirayla uretir', () => {
    expect(catalogOf().map((c) => c.key)).toEqual([
      'code',
      'title',
      'type',
      'field',
      'status',
      'attr:priority',
      'attr:risk',
      'links',
      'actions',
    ])
  })

  it('sayfada anlamsiz sutunlari (orn. tip kilitli) katalogdan cikarir', () => {
    const keys = catalogOf({ columns: ['field', 'status', 'links'] }).map((c) => c.key)
    expect(keys).not.toContain('type')
  })

  it('onay sutunlari yalnizca showApproval ile gelir', () => {
    const keys = catalogOf({ showApproval: true }).map((c) => c.key)
    expect(keys).toContain('approval')
    expect(keys).toContain('approvalStatus')
  })

  it('KOD sutunu kilitlidir (gizlenemez)', () => {
    expect(catalogOf().find((c) => c.key === 'code').locked).toBe(true)
    const layout = toggleColumn(defaultColumnLayout(catalogOf()), 'code', catalogOf())
    expect(layout.find((c) => c.key === 'code').visible).toBe(true)
  })

  it('entityAttrDefs varliga uymayan tanimlari eler ve order ile siralar', () => {
    const defs = entityAttrDefs(
      [
        { key: 'b', entityType: 'testcase', order: 0 },
        { key: 'a', entityType: 'both', order: 2 },
        { key: 'c', entityType: 'requirement', order: 1 },
      ],
      'requirement',
    )
    expect(defs.map((d) => d.key)).toEqual(['c', 'a'])
  })
})

describe('viewConfig — kaydedilmis duzenin birlesmesi', () => {
  it('kaydedilmis sirayi ve gorunurlugu korur', () => {
    const saved = [
      { key: 'code', visible: true },
      { key: 'status', visible: true },
      { key: 'field', visible: false },
      { key: 'title', visible: true },
      { key: 'type', visible: true },
      { key: 'attr:priority', visible: true },
      { key: 'attr:risk', visible: true },
      { key: 'links', visible: false },
      { key: 'actions', visible: true },
    ]
    const merged = mergeColumnLayout(catalogOf(), saved)
    expect(merged.map((c) => c.key)).toEqual(saved.map((c) => c.key))
    expect(visibleColumnKeys(merged)).not.toContain('field')
    expect(visibleColumnKeys(merged)).not.toContain('links')
  })

  it('silinen oznitelik duser, yeni oznitelik sona GORUNUR eklenir', () => {
    const saved = [
      { key: 'code', visible: true },
      { key: 'attr:silinmis', visible: true },
      { key: 'title', visible: false },
    ]
    const merged = mergeColumnLayout(catalogOf(), saved)
    expect(merged.map((c) => c.key)).not.toContain('attr:silinmis')
    // Kaydedilmemis sutunlar sona, gorunur olarak eklenir.
    expect(merged.map((c) => c.key)).toContain('attr:risk')
    expect(merged.find((c) => c.key === 'attr:risk').visible).toBe(true)
    // Kaydedilen gorunurluk korunur.
    expect(merged.find((c) => c.key === 'title').visible).toBe(false)
  })

  it('duzen yoksa varsayilana duser (hepsi gorunur)', () => {
    const merged = mergeColumnLayout(catalogOf(), null)
    expect(visibleColumnKeys(merged)).toEqual(catalogOf().map((c) => c.key))
  })

  it('moveColumn sutunu tasir, sinirlarda no-op olur', () => {
    const layout = defaultColumnLayout(catalogOf())
    expect(moveColumn(layout, 'title', -1).map((c) => c.key)[0]).toBe('title')
    expect(moveColumn(layout, 'code', -1).map((c) => c.key)).toEqual(layout.map((c) => c.key))
  })
})

describe('viewConfig — satir duzeni', () => {
  const rows = [
    { id: '1', text_id: 'REQ-10', title: 'Beta', status: 'Approved', attributes: { risk: 5 } },
    { id: '2', text_id: 'REQ-2', title: 'Alfa', status: 'In Review', attributes: { risk: 12 } },
    { id: '3', text_id: 'REQ-1', title: '', status: 'Rejected', attributes: {} },
  ]

  it('text_id sayisal-duyarli siralanir', () => {
    expect(sortRows(rows, { sortBy: 'text_id', sortDir: 'asc' }).map((r) => r.text_id)).toEqual([
      'REQ-1',
      'REQ-2',
      'REQ-10',
    ])
    expect(sortRows(rows, { sortBy: 'text_id', sortDir: 'desc' }).map((r) => r.text_id)).toEqual([
      'REQ-10',
      'REQ-2',
      'REQ-1',
    ])
  })

  it('bos degerler her iki yonde de SONDA kalir', () => {
    expect(sortRows(rows, { sortBy: 'title', sortDir: 'asc' }).map((r) => r.id)).toEqual([
      '2',
      '1',
      '3',
    ])
    expect(sortRows(rows, { sortBy: 'title', sortDir: 'desc' }).map((r) => r.id)).toEqual([
      '1',
      '2',
      '3',
    ])
  })

  it('oznitelik degerine gore (sayisal) siralar', () => {
    expect(sortRows(rows, { sortBy: 'attr:risk', sortDir: 'asc' }).map((r) => r.id)).toEqual([
      '1',
      '2',
      '3',
    ])
  })

  it('gecersiz siralama olcutu varsayilana duser', () => {
    expect(normalizeRowLayout({ sortBy: 'drop table', sortDir: 'x', pageSize: 7 })).toEqual({
      sortBy: 'text_id',
      sortDir: 'asc',
      pageSize: 25,
    })
  })

  it('sayfalar; pageSize=0 tum satirlari doner', () => {
    const p1 = paginate(rows, 2, 1)
    expect(p1.rows.map((r) => r.id)).toEqual(['1', '2'])
    expect(p1.pageCount).toBe(2)
    const p2 = paginate(rows, 2, 2)
    expect(p2.rows.map((r) => r.id)).toEqual(['3'])
    // Liste kisalinca gecerli araliga cekilir.
    expect(paginate(rows, 2, 9).page).toBe(2)
    expect(paginate(rows, 0).rows).toHaveLength(3)
  })

  it('siralama secenekleri katalogdan + tarih alanlarindan turer', () => {
    const values = sortOptionsFromCatalog(catalogOf(), t).map((o) => o.value)
    expect(values).toEqual([
      'text_id',
      'title',
      'type',
      'field',
      'status',
      'attr:priority',
      'attr:risk',
      'createdAt',
      'updatedAt',
    ])
  })
})
