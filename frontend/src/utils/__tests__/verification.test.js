// ============================================================================
//  verification.test.js — Issue #105: gereksinim dogrulama durumu turetme.
//  Kurallar backend cascade'i ile AYNI olmalidir (bkz. backend/src/cascade.js):
//    bagli test yok -> unverifiable | en az bir red -> failed
//    hepsi onayli   -> verified     | aksi          -> pending
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  VERIFICATION,
  buildVerificationIndex,
  verificationOf,
  summarizeVerification,
} from '../verification.js'

const link = (fromId, toId, type = 'Verifies') => ({ id: `${fromId}-${toId}`, type, fromId, toId })
const test = (id, status) => ({ id, text_id: id.toUpperCase(), title: id, status })

describe('buildVerificationIndex', () => {
  it('bagli test yoksa "doğrulanamaz" doner', () => {
    const index = buildVerificationIndex([], [])
    expect(verificationOf(index, 'r1').state).toBe(VERIFICATION.UNVERIFIABLE)
    expect(verificationOf(index, 'r1').total).toBe(0)
  })

  it('tum bagli testler onayliysa "doğrulandı"', () => {
    const index = buildVerificationIndex(
      [link('r1', 'tc1'), link('r1', 'tc2')],
      [test('tc1', 'Approved'), test('tc2', 'Approved')],
    )
    const info = verificationOf(index, 'r1')
    expect(info.state).toBe(VERIFICATION.VERIFIED)
    expect(info.approved).toBe(2)
    expect(info.total).toBe(2)
  })

  it('bir test bekliyorsa "doğrulanmayı bekliyor"', () => {
    const index = buildVerificationIndex(
      [link('r1', 'tc1'), link('r1', 'tc2')],
      [test('tc1', 'Approved'), test('tc2', 'In Review')],
    )
    const info = verificationOf(index, 'r1')
    expect(info.state).toBe(VERIFICATION.PENDING)
    expect(info.approved).toBe(1)
    expect(info.pending).toBe(1)
  })

  it('bir test reddedildiyse — bekleyen olsa bile — "doğrulama başarısız"', () => {
    const index = buildVerificationIndex(
      [link('r1', 'tc1'), link('r1', 'tc2'), link('r1', 'tc3')],
      [test('tc1', 'Approved'), test('tc2', 'Rejected'), test('tc3', 'In Review')],
    )
    const info = verificationOf(index, 'r1')
    expect(info.state).toBe(VERIFICATION.FAILED)
    expect(info.rejected).toBe(1)
  })

  it('Verifies disindaki baglar (Satisfies) dogrulama sayilmaz', () => {
    const index = buildVerificationIndex([link('r1', 'r2', 'Satisfies')], [])
    expect(verificationOf(index, 'r1').state).toBe(VERIFICATION.UNVERIFIABLE)
  })

  it('test kaydi yuklu degilse sonuc BILINMEZ kabul edilir (asla "doğrulandı" demez)', () => {
    const index = buildVerificationIndex([link('r1', 'tc1')], [])
    const info = verificationOf(index, 'r1')
    expect(info.state).toBe(VERIFICATION.PENDING)
    expect(info.pending).toBe(1)
  })

  it('bagli testler sonuclariyla birlikte listelenir (modal detayi)', () => {
    const index = buildVerificationIndex([link('r1', 'tc1')], [test('tc1', 'Rejected')])
    expect(verificationOf(index, 'r1').tests).toEqual([
      { id: 'tc1', text_id: 'TC1', title: 'tc1', status: 'Rejected' },
    ])
  })
})

describe('summarizeVerification', () => {
  it('durum dagilimini ve doğrulanmış yuzdesini hesaplar', () => {
    const index = buildVerificationIndex(
      [link('r1', 'tc1'), link('r2', 'tc2'), link('r3', 'tc3')],
      [test('tc1', 'Approved'), test('tc2', 'In Review'), test('tc3', 'Rejected')],
    )
    const sum = summarizeVerification(
      [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }],
      index,
    )
    expect(sum.counts).toEqual({
      [VERIFICATION.VERIFIED]: 1,
      [VERIFICATION.PENDING]: 1,
      [VERIFICATION.FAILED]: 1,
      [VERIFICATION.UNVERIFIABLE]: 1,
    })
    expect(sum.total).toBe(4)
    expect(sum.verifiedScore).toBe(25)
  })

  it('bos listede yuzde 0 doner (bolme hatasi yok)', () => {
    expect(summarizeVerification([], buildVerificationIndex([], [])).verifiedScore).toBe(0)
  })
})
