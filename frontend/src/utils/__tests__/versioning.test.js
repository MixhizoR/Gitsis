// ============================================================================
//  versioning.test.js — Issue #57 snapshot diff ozetleyici (saf, DB gerektirmez).
//  Yalnizca icerik alanlari (title/description/field + attributes icindeki
//  priority/dal_level) ozetlenir; otomatik alanlar gurultu olusturmaz.
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  changedFieldsSummary,
  HISTORY_DIFF_FIELDS,
  HISTORY_DIFF_ATTRIBUTE_KEYS,
} from '../versioning.js'

const SNAP = (over) => ({
  id: 'h1',
  version: 1,
  title: 'Baslik',
  description: '<p>aciklama</p>',
  field: null,
  attributes: { priority: 'Medium' },
  status: 'In Review',
  approvalStatus: 'Pending',
  locked: false,
  ...over,
})

describe('versioning: sabitler', () => {
  it('tetikleyici alan listesi backend ile senkron', () => {
    expect(HISTORY_DIFF_FIELDS).toEqual(['title', 'description', 'field'])
    expect(HISTORY_DIFF_ATTRIBUTE_KEYS).toEqual(['priority', 'dal_level'])
  })
})

describe('versioning: changedFieldsSummary', () => {
  it('degisen icerik alanlarini listeler', () => {
    const older = SNAP({ title: 'Eski baslik' })
    const newer = SNAP({ title: 'Yeni baslik', version: 2 })
    expect(changedFieldsSummary(older, newer)).toEqual(['title'])
  })

  it('priority degisimini yakalar (attributes JSONB)', () => {
    const older = SNAP({ attributes: { priority: 'Low' } })
    const newer = SNAP({ attributes: { priority: 'High' }, version: 2 })
    expect(changedFieldsSummary(older, newer)).toEqual(['priority'])
  })

  it('custom attribute degisimi OZETLENMEZ (tetikleyici degil)', () => {
    const older = SNAP({ attributes: { priority: 'Medium', risk_score: 3 } })
    const newer = SNAP({ attributes: { priority: 'Medium', risk_score: 9 }, version: 2 })
    expect(changedFieldsSummary(older, newer)).toEqual([])
  })

  it('otomatik alanlar (status/locked/approvalStatus) ozetlenmez', () => {
    const older = SNAP({ status: 'In Review', locked: false })
    const newer = SNAP({ status: 'Approved', locked: true, version: 2 })
    expect(changedFieldsSummary(older, newer)).toEqual([])
  })

  it('birden fazla alan ayni anda degisebilir', () => {
    const older = SNAP({ title: 'A', field: 'Ucus', attributes: { priority: 'Medium' } })
    const newer = SNAP({
      title: 'B',
      field: 'Gosterge',
      attributes: { priority: 'High' },
      version: 2,
    })
    const got = changedFieldsSummary(older, newer).sort()
    expect(got).toEqual(['field', 'priority', 'title'])
  })

  it('description degisimi yakalanir; null vs bos farklidir', () => {
    expect(
      changedFieldsSummary(
        SNAP({ description: '' }),
        SNAP({ description: '<p>x</p>', version: 2 }),
      ),
    ).toEqual(['description'])
    expect(changedFieldsSummary(SNAP({ field: null }), SNAP({ field: null, version: 2 }))).toEqual(
      [],
    )
    expect(
      changedFieldsSummary(SNAP({ field: null }), SNAP({ field: 'Yeni Alan', version: 2 })),
    ).toEqual(['field'])
  })

  it('eksik/null snapshot -> bos dizi', () => {
    expect(changedFieldsSummary(null, SNAP())).toEqual([])
    expect(changedFieldsSummary(SNAP(), null)).toEqual([])
    expect(changedFieldsSummary(undefined, undefined)).toEqual([])
  })
})
