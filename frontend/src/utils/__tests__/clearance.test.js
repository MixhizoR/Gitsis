// ============================================================================
//  clearance.test.js — Issue #102: clearance 1-5 gosterim yardimcilari.
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  CLEARANCE_LEVELS,
  clearanceDisplay,
  clearanceLabelKey,
  isValidClearanceLevel,
} from '../clearance.js'

const t = (key) =>
  ({
    'clearance.l1': 'Açık',
    'clearance.l2': 'İç',
    'clearance.l3': 'Gizli',
    'clearance.l4': 'Kısıtlı',
    'clearance.l5': 'Çok Gizli',
  })[key] || key

describe('clearance utils (Issue #102)', () => {
  it('CLEARANCE_LEVELS 1..5 sabit araligini icerir', () => {
    expect(CLEARANCE_LEVELS).toEqual([1, 2, 3, 4, 5])
  })

  it('clearanceLabelKey gecerli seviyeler icin i18n anahtari uretir', () => {
    expect(clearanceLabelKey(1)).toBe('clearance.l1')
    expect(clearanceLabelKey(5)).toBe('clearance.l5')
    expect(clearanceLabelKey(6)).toBeNull()
  })

  it('clearanceDisplay "5 — Çok Gizli" gosterir', () => {
    expect(clearanceDisplay(5, t)).toBe('5 — Çok Gizli')
    expect(clearanceDisplay(1, t)).toBe('1 — Açık')
    expect(clearanceDisplay(6, t)).toBe('6')
  })

  it('isValidClearanceLevel 1..5 disini reddeder', () => {
    expect(isValidClearanceLevel(1)).toBe(true)
    expect(isValidClearanceLevel(5)).toBe(true)
    expect(isValidClearanceLevel(0)).toBe(false)
    expect(isValidClearanceLevel(6)).toBe(false)
    expect(isValidClearanceLevel('abc')).toBe(false)
    expect(isValidClearanceLevel(2.5)).toBe(false)
  })
})
