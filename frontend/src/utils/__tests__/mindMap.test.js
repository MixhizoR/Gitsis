// ============================================================================
//  mindMap.test.js — Zihin haritasi cekirdegi (Issue #122).
//  Kapsam: graf kurulumu (kok secimi, yon, gurultu filtresi), kademeli
//  yerlesim (kapali dal dolasilmaz), dongu/skip-level korumasi ve SVG
//  disa aktarimi.
// ============================================================================
import { describe, it, expect } from 'vitest'
import {
  buildMindMapGraph,
  buildMindMapSvg,
  collectExpandableKeys,
  defaultExpandedKeys,
  layoutMindMap,
  levelOfType,
  mindMapNodeKey,
} from '../mindMap.js'
import { LINK_TYPE, REQ_TYPE, TEST_TYPE } from '../constants.js'

const req = (id, text_id, type, title = `Baslik ${text_id}`) => ({ id, text_id, type, title })
const test_ = (id, text_id, type = TEST_TYPE.SYSTEM) => ({ id, text_id, type, title: text_id })
const link = (fromId, toId, type = LINK_TYPE.SATISFIES) => ({ fromId, toId, type })

// User -> System -> Software, ayrica System'i dogrulayan bir test.
const REQS = [
  req('u1', 'REQ-USR-001', REQ_TYPE.USER),
  req('s1', 'REQ-SYS-001', REQ_TYPE.SYSTEM),
  req('w1', 'REQ-SW-001', REQ_TYPE.SOFTWARE),
]
const TESTS = [test_('t1', 'TC-SYS-001')]
const LINKS = [link('u1', 's1'), link('s1', 'w1'), link('s1', 't1', LINK_TYPE.VERIFIES)]

describe('buildMindMapGraph', () => {
  it('kok = hicbir bagin ALT ucunda olmayan kayit', () => {
    const g = buildMindMapGraph(REQS, TESTS, LINKS)
    expect(g.rootIds).toEqual(['u1'])
    expect(g.children.get('u1')).toEqual(['s1'])
    expect(g.linkCount).toBe(3)
  })

  it('Satisfies + Verifies cocuklari seviye sirasiyla gelir (once gereksinim, sonra test)', () => {
    const g = buildMindMapGraph(REQS, TESTS, LINKS)
    expect(g.children.get('s1')).toEqual(['w1', 't1'])
  })

  it('ustu olmayan (orphan) kayit da kok olarak haritada kalir', () => {
    const g = buildMindMapGraph([...REQS, req('w9', 'REQ-SW-009', REQ_TYPE.SOFTWARE)], [], [])
    expect(g.rootIds).toContain('w9')
  })

  it('Assigned To bagi, ucu eksik bag ve kendine bag haritaya alinmaz', () => {
    const g = buildMindMapGraph(REQS, TESTS, [
      link('u1', 's1'),
      link('u1', 'yok-boyle-id'),
      link('s1', 's1'),
      link('u1', 'w1', LINK_TYPE.ASSIGNED_TO),
    ])
    expect(g.linkCount).toBe(1)
    expect(g.children.get('u1')).toEqual(['s1'])
  })

  it('ayni cift iki kez baglanmissa tek dal cizilir', () => {
    const g = buildMindMapGraph(REQS, TESTS, [link('u1', 's1'), link('u1', 's1')])
    expect(g.children.get('u1')).toEqual(['s1'])
    expect(g.linkCount).toBe(1)
  })

  it('tipler mind map seviyelerine eslenir', () => {
    expect(levelOfType(REQ_TYPE.USER)).toBe('user')
    expect(levelOfType(REQ_TYPE.SOFTWARE)).toBe('subsystem')
    expect(levelOfType(REQ_TYPE.HARDWARE)).toBe('subsystem')
    expect(levelOfType(TEST_TYPE.ACCEPTANCE)).toBe('test')
  })
})

describe('layoutMindMap', () => {
  it('KAPALI dal hic dolasilmaz (kademeli yukleme)', () => {
    const g = buildMindMapGraph(REQS, TESTS, LINKS)
    const closed = layoutMindMap(g, new Set())
    expect(closed.nodes.map((n) => n.id)).toEqual(['u1'])
    expect(closed.nodes[0].hasChildren).toBe(true)
    expect(closed.nodes[0].expanded).toBe(false)
    expect(closed.nodes[0].childCount).toBe(1)
    expect(closed.edges).toHaveLength(0)
  })

  it('varsayilan acik kumesi kokleri acar, torunlar kapali kalir', () => {
    const g = buildMindMapGraph(REQS, TESTS, LINKS)
    const l = layoutMindMap(g, defaultExpandedKeys(g))
    expect(l.nodes.map((n) => n.id).sort()).toEqual(['s1', 'u1'])
  })

  it('dal acildikca derinlik ve renk seviyeye gore atanir', () => {
    const g = buildMindMapGraph(REQS, TESTS, LINKS)
    const l = layoutMindMap(g, collectExpandableKeys(g).keys)
    const byId = Object.fromEntries(l.nodes.map((n) => [n.id, n]))
    expect(byId.u1.depth).toBe(0)
    expect(byId.s1.depth).toBe(1)
    expect(byId.w1.depth).toBe(2)
    expect(byId.t1.depth).toBe(2)
    expect(byId.u1.x).toBeLessThan(byId.s1.x)
    expect(byId.u1.level).toBe('user')
    expect(byId.t1.level).toBe('test')
    expect(l.edges).toHaveLength(3)
  })

  it('ust dugum, cocuklarinin tam ortasina hizalanir', () => {
    const g = buildMindMapGraph(REQS, TESTS, LINKS)
    const l = layoutMindMap(g, collectExpandableKeys(g).keys)
    const byId = Object.fromEntries(l.nodes.map((n) => [n.id, n]))
    expect(byId.s1.y).toBeCloseTo((byId.w1.y + byId.t1.y) / 2, 5)
  })

  it('ayni kayit iki ustu karsiliyorsa (skip-level) iki ayri dalda gorunur', () => {
    const g = buildMindMapGraph(REQS, TESTS, [link('u1', 's1'), link('u1', 'w1'), link('s1', 'w1')])
    const l = layoutMindMap(g, collectExpandableKeys(g).keys)
    const sw = l.nodes.filter((n) => n.id === 'w1')
    expect(sw).toHaveLength(2)
    // Acik/kapali durumu YOLA baglidir; ayni kaydin iki kopyasi ayri anahtar alir.
    expect(new Set(sw.map((n) => n.key)).size).toBe(2)
    expect(sw.map((n) => n.key)).toContain(mindMapNodeKey(mindMapNodeKey(null, 'u1'), 'w1'))
  })

  it('dongulu bag sonsuz dolasmaz', () => {
    const g = buildMindMapGraph(REQS, [], [link('u1', 's1'), link('s1', 'w1'), link('w1', 'u1')])
    const { keys } = collectExpandableKeys(g)
    const l = layoutMindMap(g, keys)
    // Kok kalmadiginda (her dugumun bir ustu var) harita bostur; dolasma
    // yine de sonlanmalidir.
    expect(l.nodes.length).toBeLessThanOrEqual(3)
  })

  it('dugum ust siniri asilirsa duzen kesilir ve isaretlenir', () => {
    const g = buildMindMapGraph(REQS, TESTS, LINKS)
    const l = layoutMindMap(g, collectExpandableKeys(g).keys, { maxNodes: 2 })
    expect(l.truncated).toBe(true)
    expect(l.nodes.length).toBeLessThanOrEqual(2)
  })

  it('500+ dugumlu projede tum dallar makul surede yerlesir', () => {
    const many = [req('root', 'REQ-USR-000', REQ_TYPE.USER)]
    const manyLinks = []
    for (let i = 1; i <= 260; i += 1) {
      many.push(req(`s${i}`, `REQ-SYS-${String(i).padStart(3, '0')}`, REQ_TYPE.SYSTEM))
      many.push(req(`w${i}`, `REQ-SW-${String(i).padStart(3, '0')}`, REQ_TYPE.SOFTWARE))
      manyLinks.push(link('root', `s${i}`), link(`s${i}`, `w${i}`))
    }
    const g = buildMindMapGraph(many, [], manyLinks)
    const started = Date.now()
    const l = layoutMindMap(g, collectExpandableKeys(g).keys)
    expect(l.nodes).toHaveLength(521)
    expect(Date.now() - started).toBeLessThan(1000)
    // Kapali harita ise tek dugum kadar ucuzdur.
    expect(layoutMindMap(g, new Set()).nodes).toHaveLength(1)
  })
})

describe('buildMindMapSvg', () => {
  it('acik TUM dallari iceren bagimsiz bir SVG uretir', () => {
    const g = buildMindMapGraph(REQS, TESTS, LINKS)
    const l = layoutMindMap(g, collectExpandableKeys(g).keys)
    const svg = buildMindMapSvg(l, { theme: 'dark', title: 'Proje' })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('REQ-USR-001')
    expect(svg).toContain('REQ-SW-001')
    expect(svg).toContain('TC-SYS-001')
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('metinleri XML icin kacisla yazar', () => {
    const g = buildMindMapGraph([req('u1', 'REQ-USR-001', REQ_TYPE.USER, 'A & B <script>')], [], [])
    const svg = buildMindMapSvg(layoutMindMap(g, new Set()))
    expect(svg).toContain('A &amp; B &lt;script&gt;')
    expect(svg).not.toContain('<script>')
  })
})
