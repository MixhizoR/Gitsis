// ============================================================================
//  suspect.test.js — Issue #57 supheli bag yardimcilari (saf, DB gerektirmez).
//  Backend kurali: suspect yalnizca degisen gereksinimin fromId oldugu
//  Satisfies/Verifies baglarinda olusur; alt degisimi ust baglarini etkilemez.
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  SUSPECT_LINK_TYPES,
  suspectLinksForRequirement,
  suspectLinksForTestCase,
  hasSuspectLinks,
  suspectCountFor,
} from '../suspect.js'

const LINK = (over) => ({
  id: 'l1',
  projectId: 'p1',
  fromId: 'req-a',
  toId: 'req-b',
  type: 'Satisfies',
  isSuspect: false,
  ...over,
})

describe('suspect: SUSPECT_LINK_TYPES', () => {
  it('yalnizca Satisfies + Verifies (backend ile senkron)', () => {
    expect(SUSPECT_LINK_TYPES).toEqual(['Satisfies', 'Verifies'])
    expect(SUSPECT_LINK_TYPES).not.toContain('Assigned To')
  })
})

describe('suspect: suspectLinksForRequirement', () => {
  it('fromId eslesen + isSuspect olan Satisfies/Verifies baglarini doner', () => {
    const links = [
      LINK({ id: 'a', fromId: 'req-a', toId: 'child-1', type: 'Satisfies', isSuspect: true }),
      LINK({ id: 'b', fromId: 'req-a', toId: 'tc-1', type: 'Verifies', isSuspect: true }),
      // Suspect degil -> haric
      LINK({ id: 'c', fromId: 'req-a', toId: 'child-2', type: 'Satisfies', isSuspect: false }),
      // Farkli kaynak -> haric
      LINK({ id: 'd', fromId: 'req-x', toId: 'child-3', type: 'Satisfies', isSuspect: true }),
      // Assigned To suspect olsa bile haric
      LINK({ id: 'e', fromId: 'req-a', toId: 'term-1', type: 'Assigned To', isSuspect: true }),
    ]
    const got = suspectLinksForRequirement(links, 'req-a')
    expect(got.map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('null/undefined links -> bos dizi', () => {
    expect(suspectLinksForRequirement(null, 'req-a')).toEqual([])
    expect(suspectLinksForRequirement(undefined, 'req-a')).toEqual([])
  })
})

describe('suspect: suspectLinksForTestCase', () => {
  it('toId eslesen + isSuspect olan Verifies baglarini doner', () => {
    const links = [
      LINK({ id: 'a', fromId: 'req-a', toId: 'tc-1', type: 'Verifies', isSuspect: true }),
      LINK({ id: 'b', fromId: 'req-b', toId: 'tc-1', type: 'Verifies', isSuspect: true }),
      // Suspect degil
      LINK({ id: 'c', fromId: 'req-c', toId: 'tc-1', type: 'Verifies', isSuspect: false }),
      // Farkli test
      LINK({ id: 'd', fromId: 'req-d', toId: 'tc-2', type: 'Verifies', isSuspect: true }),
      // Satisfies toId olsa bile sayilmaz (test target'i Verifies'tir)
      LINK({ id: 'e', fromId: 'req-e', toId: 'tc-1', type: 'Satisfies', isSuspect: true }),
    ]
    const got = suspectLinksForTestCase(links, 'tc-1')
    expect(got.map((l) => l.id)).toEqual(['a', 'b'])
  })
})

describe('suspect: hasSuspectLinks / suspectCountFor', () => {
  const links = [
    LINK({ id: 'a', fromId: 'req-a', toId: 'tc-1', type: 'Verifies', isSuspect: true }),
    LINK({ id: 'b', fromId: 'req-a', toId: 'tc-2', type: 'Verifies', isSuspect: true }),
  ]

  it('gereksinim icin dogru boolean + sayi', () => {
    expect(hasSuspectLinks(links, 'req-a', 'requirement')).toBe(true)
    expect(hasSuspectLinks(links, 'req-z', 'requirement')).toBe(false)
    expect(suspectCountFor(links, 'req-a', 'requirement')).toBe(2)
    expect(suspectCountFor(links, 'req-z', 'requirement')).toBe(0)
  })

  it('test icin dogru boolean + sayi (gelen Verifies)', () => {
    expect(hasSuspectLinks(links, 'tc-1', 'test')).toBe(true)
    expect(suspectCountFor(links, 'tc-1', 'test')).toBe(1)
    expect(suspectCountFor(links, 'tc-2', 'test')).toBe(1)
    expect(suspectCountFor(links, 'tc-3', 'test')).toBe(0)
  })
})
