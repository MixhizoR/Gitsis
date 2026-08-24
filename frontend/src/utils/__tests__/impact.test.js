// ============================================================================
//  impact.test.js — impact.js regresyon testleri (saf fonksiyonlar).
//  Zincir kurulumu, dongu korumasi ve ozet sayimlari kapsanir.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { buildImpactTree, summarizeImpact } from '../impact.js'
import { LINK_TYPE, REQ_TYPE, DAL, STATUS } from '../constants.js'

const req = (id, type, docs = []) => ({
  id,
  text_id: id,
  title: `${id} baslik`,
  type,
  dal_level: DAL.C,
  status: STATUS.IN_REVIEW,
  relatedDocuments: docs,
})

// U1 (User) <- S1 (System) <- SW1 (Software) zinciri ve TC dogrulamalari.
const chainRequirements = [
  req('REQ-USR-001', REQ_TYPE.USER),
  req('REQ-SYS-001', REQ_TYPE.SYSTEM),
  req('REQ-SW-001', REQ_TYPE.SOFTWARE),
  req('TC-SUB-001', REQ_TYPE.TEST_CASE),
  req('TC-SUB-002', REQ_TYPE.TEST_CASE),
]
const chainLinks = [
  { id: 'L1', type: LINK_TYPE.SATISFIES, fromId: 'REQ-USR-001', toId: 'REQ-SYS-001' },
  { id: 'L2', type: LINK_TYPE.SATISFIES, fromId: 'REQ-SYS-001', toId: 'REQ-SW-001' },
  { id: 'L3', type: LINK_TYPE.VERIFIES, fromId: 'REQ-SYS-001', toId: 'TC-SUB-001' },
]

describe('buildImpactTree', () => {
  it('Satisfies/Verifies zincirini ust yone agac olarak kurar', () => {
    const tree = buildImpactTree('REQ-SW-001', chainRequirements, chainLinks)

    expect(tree).not.toBeNull()
    expect(tree.requirement.id).toBe('REQ-SW-001')
    // Yazilim gereksinimini karsilayan UST: System.
    expect(tree.parents.map((p) => p.requirement.id)).toEqual(['REQ-SYS-001'])
    // Onu dolayli karsilayan User dugumune kadar zincir tirmanir.
    const sysNode = tree.parents[0]
    expect(sysNode.parents.map((p) => p.requirement.id)).toEqual(['REQ-USR-001'])
    expect(sysNode.parents[0].parents).toHaveLength(0)
  })

  it('degisen gereksinimi dogrulayan testleri toplar', () => {
    const tree = buildImpactTree('REQ-SYS-001', chainRequirements, chainLinks)
    expect(tree.tests.map((t) => t.id)).toEqual(['TC-SUB-001'])
  })

  it('ilgili dokuman listesini gereksinimden tasir', () => {
    const withDocs = [
      { ...req('REQ-USR-001', REQ_TYPE.USER), relatedDocuments: ['SDD', 'ICD-01'] },
      ...chainRequirements.slice(1),
    ]
    const tree = buildImpactTree('REQ-USR-001', withDocs, [])
    expect(tree.documents).toEqual(['SDD', 'ICD-01'])
  })

  it('olmayan gereksinim icin null dondurur', () => {
    expect(buildImpactTree('REQ-YOK-999', chainRequirements, chainLinks)).toBeNull()
  })

  it('veri hatasindan kaynaklanan dongude sonsuz donguye girmez', () => {
    const cyclic = [
      req('REQ-A', REQ_TYPE.SYSTEM),
      req('REQ-B', REQ_TYPE.SOFTWARE),
    ]
    const cyclicLinks = [
      { id: 'L1', type: LINK_TYPE.SATISFIES, fromId: 'REQ-A', toId: 'REQ-B' },
      { id: 'L2', type: LINK_TYPE.SATISFIES, fromId: 'REQ-B', toId: 'REQ-A' },
    ]
    const tree = buildImpactTree('REQ-A', cyclic, cyclicLinks)
    expect(tree.requirement.id).toBe('REQ-A')
    expect(tree.parents).toHaveLength(1)
    // Dongu korumasi: B'nin geri dondugu A ayagi elenir.
    expect(tree.parents[0].parents).toHaveLength(0)
  })
})

describe('summarizeImpact', () => {
  it('benzersiz test / ust gereksinim / dokuman sayilarini cikarir', () => {
    const tree = buildImpactTree('REQ-SW-001', chainRequirements, [
      ...chainLinks,
      { id: 'L4', type: LINK_TYPE.VERIFIES, fromId: 'REQ-SW-001', toId: 'TC-SUB-002' },
    ])
    const summary = summarizeImpact(tree)
    expect(summary.testCount).toBe(2)
    expect(summary.parentCount).toBe(2) // System + User (kok haric)
    expect(summary.documentCount).toBe(0)
  })

  it('kok dugumun kendisini parent saymaz', () => {
    const summary = summarizeImpact(buildImpactTree('REQ-USR-001', chainRequirements, []))
    expect(summary.parentCount).toBe(0)
    expect(summary.testCount).toBe(0)
  })
})
