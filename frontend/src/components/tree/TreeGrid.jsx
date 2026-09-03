// ============================================================================
//  TreeGrid.jsx  —  PBS (Urun Agaci) lazy-load agac gorunumu (Issue #9).
//  Tum agac TEK findMany ile cekilmez: mount'ta yalnizca kok dugumler gelir,
//  kullanici bir dugumu expand ettikce o dugumun cocuklari API'den dinamik
//  cekilir ve `childrenById` cache'inde tutulur (ayni dugum ikinci kez
//  acildiginda tekrar istek ATILMAZ; collapse yalnizca gorunurlugu gizler).
//  Arama: AppContext'teki mevcut duz liste uzerinde client-side filtre; bir
//  sonuca tiklaninca /ancestors ile ust zincir cekilip yol boyunca expand
//  edilir ve hedef vurgulanir (jump-to).
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { listTreeChildren, getAncestors } from '../../services/dataService.js'
import { StatusBadge, TypeBadge, DalBadge } from '../common/Badge.jsx'
import { IconChevron, IconSearch, IconLoader } from '../common/Icons.jsx'

const INDENT_PX = 20
const ROOT_KEY = '__root__'

export default function TreeGrid() {
  const { projectId, requirements } = useApp()
  const { t } = useLang()

  // dugum id -> cocuk listesi (kok icin ROOT_KEY). Cekilmis olanlar cache'lenir.
  const [childrenById, setChildrenById] = useState({})
  const [expanded, setExpanded] = useState(() => new Set())
  const [loadingIds, setLoadingIds] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [highlightId, setHighlightId] = useState(null)
  const rowRefs = useRef({})
  // Cekilmis (veya cekilmekte olan) dugum anahtarlari — ayni dugum icin
  // ikinci bir istek atilmasini onler (render'dan bagimsiz, senkron kontrol).
  const fetchedRef = useRef(new Set())

  const setLoading = useCallback((key, on) => {
    setLoadingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  // Bir dugumun cocuklarini (henuz cekilmediyse) getirir ve cache'ler.
  const fetchChildren = useCallback(
    async (parentId) => {
      const key = parentId || ROOT_KEY
      if (fetchedRef.current.has(key)) return
      fetchedRef.current.add(key)
      setLoading(key, true)
      try {
        const res = await listTreeChildren(projectId, parentId || undefined)
        setChildrenById((prev) => ({ ...prev, [key]: res?.items || [] }))
        setError(null)
      } catch (err) {
        // Hata halinde cache isaretini geri al ki kullanici tekrar deneyebilsin.
        fetchedRef.current.delete(key)
        setError(err?.message || t('tree.error'))
      } finally {
        setLoading(key, false)
      }
    },
    [projectId, setLoading, t],
  )

  // Mount (ve proje degisiminde): cache'i sifirla, yalnizca kok dugumleri cek.
  useEffect(() => {
    if (!projectId) return
    fetchedRef.current = new Set()
    setChildrenById({})
    setExpanded(new Set())
    setHighlightId(null)
    fetchChildren(null)
    // fetchChildren yalnizca projectId'ye bagli; proje degisiminde yeniden kurulur.
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

  // --- Arama + jump-to --------------------------------------------------------
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return (requirements || [])
      .filter((r) => `${r.text_id} ${r.title}`.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [q, requirements])

  const jumpTo = useCallback(
    async (reqId) => {
      try {
        const res = await getAncestors(projectId, reqId)
        const path = res?.path || []
        // Yol boyunca her ust dugumu (hedefin kendisi haric) expand et.
        for (const node of path.slice(0, -1)) {
          await fetchChildren(node.id)
          setExpanded((prev) => new Set(prev).add(node.id))
        }
        setHighlightId(reqId)
        setQ('')
        // Satir DOM'a girdikten sonra kaydir.
        setTimeout(() => rowRefs.current[reqId]?.scrollIntoView({ block: 'center' }), 50)
      } catch (err) {
        setError(err?.message || t('tree.error'))
      }
    },
    [projectId, fetchChildren, t],
  )

  // --- Render -----------------------------------------------------------------
  const renderRows = (parentKey, depth) => {
    const nodes = childrenById[parentKey]
    if (!nodes) return null
    return nodes.map((node) => {
      const isOpen = expanded.has(node.id)
      const isLoading = loadingIds.has(node.id)
      return (
        <div key={node.id}>
          <div
            ref={(el) => {
              rowRefs.current[node.id] = el
            }}
            data-testid={`tree-row-${node.text_id}`}
            className={
              'flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm dark:border-slate-800 ' +
              (highlightId === node.id
                ? 'bg-brand-50 dark:bg-brand-900/30'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50')
            }
            style={{ paddingLeft: 12 + depth * INDENT_PX }}
          >
            {node.hasChildren ? (
              <button
                onClick={() => toggle(node)}
                aria-label={isOpen ? t('tree.collapse') : t('tree.expand')}
                aria-expanded={isOpen}
                className="rounded p-0.5 text-slate-500 transition-transform hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {isLoading ? (
                  <IconLoader size={14} className="animate-spin" />
                ) : (
                  <IconChevron size={14} className={isOpen ? 'rotate-90' : ''} />
                )}
              </button>
            ) : (
              <span className="w-[22px]" aria-hidden="true" />
            )}
            <span className="whitespace-nowrap font-mono text-xs font-bold text-brand-700 dark:text-brand-300">
              {node.text_id}
            </span>
            {/* min-w-0: flex icinde truncate'in calisabilmesi icin sart. */}
            <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">
              {node.title}
            </span>
            {/* Dar ekranda rozetler gizlenir; oncelik baslikta kalir. */}
            <span className="hidden shrink-0 items-center gap-2 lg:flex">
              <TypeBadge value={node.type} />
              <StatusBadge value={node.status} />
              <DalBadge value={node.dal_level} />
            </span>
          </div>
          {isOpen && renderRows(node.id, depth + 1)}
        </div>
      )
    })
  }

  const rootNodes = childrenById[ROOT_KEY]
  const rootLoading = loadingIds.has(ROOT_KEY)

  return (
    <div className="space-y-3">
      {/* Arama + jump-to */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <IconSearch size={16} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('tree.search')}
            className="flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
          />
        </div>
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => jumpTo(r.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="font-mono text-xs font-bold text-brand-700 dark:text-brand-300">
                  {r.text_id}
                </span>
                <span className="truncate text-slate-700 dark:text-slate-200">{r.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {rootLoading && !rootNodes ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500">
            <IconLoader size={16} className="animate-spin" />
            {t('app.loading')}
          </div>
        ) : rootNodes && rootNodes.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('tree.empty')}</div>
        ) : (
          renderRows(ROOT_KEY, 0)
        )}
      </div>
    </div>
  )
}
