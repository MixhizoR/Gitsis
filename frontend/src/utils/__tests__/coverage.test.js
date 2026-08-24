// ============================================================================
//  coverage.test.js — coverage.js regresyon testleri (saf fonksiyonlar).
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  getCoveredRequirementIds,
  computeCoverage,
  computeSatisfyCoverage,
  getTraceForRequirement,
} from '../coverage.js'
import { LINK_TYPE, REQ_TYPE, DAL, STATUS } from '../constants.js'

const req = (id, type, dal = DAL.C) => ({
  id,
  text_id: id,
  title: `${id} baslik`,
  type,
  dal_level: dal,
  status: STATUS.IN_REVIEW,
})

describe('getCoveredRequirementIds', () => {
  it('yalnizca Verifies baginin kaynagindaki gereksinimleri kapsamis sayar', () => {
    const links = [
      { id: 'L1', type: LINK_TYPE.VERIFIES, fromId: 'U1', toId: 'TC1' },
      { id: 'L2', type: LINK_TYPE.SATISFIES, fromId: 'U1', toId: 'S1' },
    ]
    const covered = getCoveredRequirementIds(links)
    expect(covered.has('U1')).toBe(true)
    expect(covered.has('S1')).toBe(false)
    expect(covered.size).toBe(1)
  })
})

describe('computeCoverage', () => {
  it('kapsanmis/kapsanmamis sayimini ve yuzde skorunu hesaplar', () => {
    const requirements = [
      req('REQ-USR-001', REQ_TYPE.USER),
      req('REQ-SYS-001', REQ_TYPE.SYSTEM),
      req('REQ-SW-001', REQ_TYPE.SOFTWARE),
    ]
    const links = [
      { id: 'L1', type: LINK_TYPE.VERIFIES, fromId: 'REQ-USR-001', toId: 'TC-ACC-001' },
    ]

    const result = computeCoverage(requirements, links)

    expect(result.total).toBe(3)
    expect(result.coveredCount).toBe(1)
    expect(result.uncoveredCount).toBe(2)
    expect(result.score).toBe(33)
    expect(result.covered.map((r) => r.id)).toEqual(['REQ-USR-001'])
  })

  it('hic kapsanabilir gereksinim yoksa skor 0 dondurur', () => {
    const result = computeCoverage([], [])
    expect(result.total).toBe(0)
    expect(result.score).toBe(0)
  })

  it('kapsanmayanlari DAL agirligina gore azalan siralar (kritik en ustte)', () => {
    const requirements = [
      req('REQ-SW-003', REQ_TYPE.SOFTWARE, DAL.D),
      req('REQ-SW-001', REQ_TYPE.SOFTWARE, DAL.A),
      req('REQ-SW-002', REQ_TYPE.SOFTWARE, DAL.B),
    ]
    const result = computeCoverage(requirements, [])
    expect(result.uncovered.map((r) => r.id)).toEqual(['REQ-SW-001', 'REQ-SW-002', 'REQ-SW-003'])
  })
})

describe('computeSatisfyCoverage', () => {
  it('ust bagi olan sistem/yazilim gereksinimlerini kapsanmis sayar', () => {
    const requirements = [
      req('REQ-USR-001', REQ_TYPE.USER), // ust bagi gerektirmez
      req('REQ-SYS-001', REQ_TYPE.SYSTEM),
      req('REQ-SW-001', REQ_TYPE.SOFTWARE),
    ]
    // Satisfies depolama yonu: from = UST, to = ALT.
    const links = [
      { id: 'L1', type: LINK_TYPE.SATISFIES, fromId: 'REQ-SYS-001', toId: 'REQ-SW-001' },
    ]

    const result = computeSatisfyCoverage(requirements, links)

    expect(result.total).toBe(2)
    expect(result.satisfiedCount).toBe(1)
    expect(result.openCount).toBe(1)
    expect(result.score).toBe(50)
    expect(result.satisfied[0].id).toBe('REQ-SW-001')
    expect(result.open[0].id).toBe('REQ-SYS-001')
  })

  it('kapsanacak gereksinim yoksa skor 100 dondurur', () => {
    expect(computeSatisfyCoverage([req('REQ-USR-001', REQ_TYPE.USER)], []).score).toBe(100)
  })
})

describe('getTraceForRequirement', () => {
  it('cift yonlu izlenebilirligi dogru yonlerde toplar', () => {
    const requirements = [
      req('REQ-USR-001', REQ_TYPE.USER),
      req('REQ-SYS-001', REQ_TYPE.SYSTEM),
      { ...req('TC-SUB-001', 'Test Case'), status: STATUS.APPROVED },
    ]
    const links = [
      { id: 'L1', type: LINK_TYPE.SATISFIES, fromId: 'REQ-USR-001', toId: 'REQ-SYS-001' },
      { id: 'L2', type: LINK_TYPE.VERIFIES, fromId: 'REQ-SYS-001', toId: 'TC-SUB-001' },
    ]

    const sys = getTraceForRequirement('REQ-SYS-001', requirements, links)
    expect(sys.satisfies.map((x) => x.req.id)).toEqual(['REQ-USR-001']) // karsiladigi UST
    expect(sys.verifiedBy.map((x) => x.req.id)).toEqual(['TC-SUB-001']) // dogrulayan test

    const usr = getTraceForRequirement('REQ-USR-001', requirements, links)
    expect(usr.satisfiedBy.map((x) => x.req.id)).toEqual(['REQ-SYS-001']) // karsilanildigi ALT
    expect(usr.satisfies).toHaveLength(0)
  })

  it('bagi olmayan gereksinim icin bos listeler dondurur', () => {
    const requirements = [req('REQ-USR-001', REQ_TYPE.USER)]
    const trace = getTraceForRequirement('REQ-USR-001', requirements, [])
    expect(trace).toEqual({ satisfiedBy: [], satisfies: [], verifiedBy: [], verifies: [] })
  })
})
