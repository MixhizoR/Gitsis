// ============================================================================
//  useTreeNodes.js — PBS agaci icin lazy-load dugum yonetimi (Issue #9).
//
//  Tum agac TEK seferde cekilmez: mount'ta yalnizca kok dugumler gelir,
//  kullanici bir dugumu expand ettikce o dugumun cocuklari API'den dinamik
//  cekilir ve cache'lenir (ayni dugum ikinci kez acildiginda istek ATILMAZ).
//
//  `flatRows` gorunur satirlari DUZ bir liste olarak dondurur; her satirda:
//    _depth        girinti seviyesi (0 = kok)
//    _outline      DOORS tarzi anahat numarasi (1, 1.1, 3.3.2 ...)
//    _hasChildren  alt kirilimi var mi (ac/kapa oku icin)
//    _expanded     su an acik mi
//    _loading      cocuklari cekiliyor mu
//    _parentKey    hangi ust dugumun listesinde durdugu (kardes kontrolu icin)
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listTreeChildren, getAncestors } from '../services/dataService.js'

export const ROOT_KEY = '__root__'

export function useTreeNodes(projectId) {
  // dugum id -> cocuk listesi (kok icin ROOT_KEY). Cekilmis olanlar cache'lenir.
  const [childrenById, setChildrenById] = useState({})
  const [expanded, setExpanded] = useState(() => new Set())
  const [loadingIds, setLoadingIds] = useState(() => new Set())
  const [error, setError] = useState(null)
  // Cekilmis (veya cekilmekte olan) anahtarlar — ayni dugum icin ikinci bir
  // istek atilmasini onler (render'dan bagimsiz, senkron kontrol).
  const fetchedRef = useRef(new Set())

  const setLoading = useCallback((key, on) => {
    setLoadingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const fetchChildren = useCallback(
    async (parentId, { force = false } = {}) => {
      const key = parentId || ROOT_KEY
      if (!force && fetchedRef.current.has(key)) return
      fetchedRef.current.add(key)
      setLoading(key, true)
      try {
        const res = await listTreeChildren(projectId, parentId || undefined)
        setChildrenById((prev) => ({ ...prev, [key]: res?.items || [] }))
        setError(null)
      } catch (err) {
        fetchedRef.current.delete(key) // tekrar denenebilsin
        setError(err?.message || 'error')
      } finally {
        setLoading(key, false)
      }
    },
    [projectId, setLoading],
  )

  // Mount (ve proje degisiminde): cache'i sifirla, yalnizca kok dugumleri cek.
  useEffect(() => {
    if (!projectId) return
    fetchedRef.current = new Set()
    setChildrenById({})
    setExpanded(new Set())
    fetchChildren(null)
  }, [projectId, fetchChildren])

  const toggle = useCallback(
    async (node) => {
      const isOpen = expanded.has(node.id)
      setExpanded((prev) => {
        const next = new Set(prev)
        if (isOpen) next.delete(node.id)
        else next.add(node.id)
        return next
      })
      if (!isOpen) await fetchChildren(node.id)
    },
    [expanded, fetchChildren],
  )

  /** Verilen anahtarlarin cache'ini bosaltip yeniden ceker (mutasyon sonrasi). */
  const refreshKeys = useCallback(
    async (keys) => {
      const uniq = [...new Set(keys.filter(Boolean))]
      await Promise.all(uniq.map((k) => fetchChildren(k === ROOT_KEY ? null : k, { force: true })))
    },
    [fetchChildren],
  )

  /** Bir dugumun hangi ust anahtarin listesinde durdugunu bulur. */
  const findParentKey = useCallback(
    (nodeId) => {
      for (const [key, list] of Object.entries(childrenById)) {
        if (list?.some((n) => n.id === nodeId)) return key
      }
      return null
    },
    [childrenById],
  )

  /** Bir dugume kadar olan yolu acar (arama sonucuna atlama). */
  const revealPath = useCallback(
    async (reqId) => {
      const res = await getAncestors(projectId, reqId)
      const path = res?.path || []
      for (const node of path.slice(0, -1)) {
        await fetchChildren(node.id)
        setExpanded((prev) => new Set(prev).add(node.id))
      }
    },
    [projectId, fetchChildren],
  )

  // Gorunur satirlari duz listeye ac; anahat numarasini yol boyunca uret.
  const flatRows = useMemo(() => {
    const out = []
    const walk = (parentKey, depth, prefix) => {
      const nodes = childrenById[parentKey]
      if (!nodes) return
      nodes.forEach((node, i) => {
        const outline = prefix ? `${prefix}.${i + 1}` : String(i + 1)
        const isExpanded = expanded.has(node.id)
        out.push({
          ...node,
          _depth: depth,
          _outline: outline,
          _hasChildren: Boolean(node.hasChildren),
          _expanded: isExpanded,
          _loading: loadingIds.has(node.id),
          _parentKey: parentKey,
        })
        if (isExpanded) walk(node.id, depth + 1, outline)
      })
    }
    walk(ROOT_KEY, 0, '')
    return out
  }, [childrenById, expanded, loadingIds])

  return {
    flatRows,
    rootLoaded: Boolean(childrenById[ROOT_KEY]),
    rootLoading: loadingIds.has(ROOT_KEY),
    error,
    setError,
    toggle,
    refreshKeys,
    findParentKey,
    revealPath,
  }
}
