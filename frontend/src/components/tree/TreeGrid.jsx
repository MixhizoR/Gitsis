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
import { useAuth } from '../../context/AuthContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import {
  listTreeChildren,
  getAncestors,
  moveRequirement,
  splitRequirement,
  mergeRequirements,
} from '../../services/dataService.js'
import { StatusBadge, TypeBadge, DalBadge } from '../common/Badge.jsx'
import {
  IconChevron,
  IconSearch,
  IconLoader,
  IconLock,
  IconUnlink,
  IconLink,
} from '../common/Icons.jsx'
import SplitModal from './SplitModal.jsx'
import MergeModal from './MergeModal.jsx'
import { SATISFIES_PARENT_OF } from '../../utils/constants.js'
import { componentKeyOf } from '../../utils/permissions.js'

const INDENT_PX = 20
const ROOT_KEY = '__root__'

export default function TreeGrid() {
  const { projectId, requirements, refresh } = useApp()
  const { can } = useAuth()
  const { t } = useLang()

  // dugum id -> cocuk listesi (kok icin ROOT_KEY). Cekilmis olanlar cache'lenir.
  const [childrenById, setChildrenById] = useState({})
  const [expanded, setExpanded] = useState(() => new Set())
  const [loadingIds, setLoadingIds] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [highlightId, setHighlightId] = useState(null)
  // Surukleme durumu: tasinan dugum + o an uzerinde durulan gecerli/gecersiz hedef.
  const [dragNode, setDragNode] = useState(null)
  const [dropTarget, setDropTarget] = useState(null) // { key, valid }
  // Merge icin secim: id -> { node, parentKey } (kardes/tip on-kontrolu icin)
  const [selected, setSelected] = useState(() => new Map())
  const [splitNode, setSplitNode] = useState(null)
  const [mergeOpen, setMergeOpen] = useState(false)
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

  // --- Surukle-birak ile tasima ------------------------------------------------
  //  Client-side on-kontrol YALNIZCA UX icindir (anlik gorsel geri bildirim);
  //  nihai dogrulama backend'dedir (dongusel tasima / tip / kilit -> 400/403).
  // Tasima yetkisi: dugumun tipine karsilik gelen izin bileseninde 'write'.
  const canWrite = useCallback(
    (node) => can('write', componentKeyOf('requirement', node.type)),
    [can],
  )

  const canDropOn = useCallback(
    (node, targetNode) => {
      if (!node) return false
      if (targetNode && targetNode.id === node.id) return false // kendine
      const expectedParent = SATISFIES_PARENT_OF[node.type]
      if (!targetNode) return !expectedParent // koke yalnizca User Requirement
      return targetNode.type === expectedParent
    },
    [], // saf fonksiyon
  )

  // Bir dugumun hangi ust anahtarin cocuk listesinde durdugunu bulur.
  const findParentKey = useCallback(
    (nodeId) => {
      for (const [key, list] of Object.entries(childrenById)) {
        if (list?.some((n) => n.id === nodeId)) return key
      }
      return null
    },
    [childrenById],
  )

  const handleDrop = useCallback(
    async (targetNode) => {
      const node = dragNode
      setDragNode(null)
      setDropTarget(null)
      if (!node) return
      const newParentId = targetNode ? targetNode.id : null
      const sourceKey = findParentKey(node.id)
      const targetKey = newParentId || ROOT_KEY
      if (sourceKey === targetKey) return // ayni yer — no-op

      // 1) Optimistic: dugumu kaynaktan cikar, hedefe ekle.
      const snapshot = childrenById
      setChildrenById((prev) => {
        const next = { ...prev }
        if (sourceKey && next[sourceKey]) {
          next[sourceKey] = next[sourceKey].filter((n) => n.id !== node.id)
        }
        if (next[targetKey]) {
          next[targetKey] = [...next[targetKey], node].sort((a, b) =>
            String(a.text_id).localeCompare(String(b.text_id), undefined, { numeric: true }),
          )
        }
        return next
      })
      if (targetNode) setExpanded((prev) => new Set(prev).add(targetNode.id))

      try {
        await moveRequirement(projectId, node.id, newParentId)
        setError(null)
        // 2) Basarili: hem kaynak hem hedefin cache'ini tazele — `hasChildren`
        //    degismis olabilir (kaynak yaprak olabilir, hedef ilk cocugunu almis).
        for (const key of [sourceKey, targetKey].filter(Boolean)) {
          fetchedRef.current.delete(key)
        }
        await Promise.all([
          fetchChildren(sourceKey === ROOT_KEY ? null : sourceKey),
          fetchChildren(targetKey === ROOT_KEY ? null : targetKey),
        ])
        // Ust seviyelerdeki `hasChildren` de degismis olabilir: kok listesi ve
        // acik dugumler zaten yukaridaki iki cagri ile tazelendi.
      } catch (err) {
        // 3) Hata: taşımayı geri al (rollback) ve mesaji goster.
        setChildrenById(snapshot)
        setError(err?.message || t('tree.error'))
      }
    },
    [dragNode, childrenById, findParentKey, projectId, fetchChildren, t],
  )

  // --- Bolme (split) / Birlestirme (merge) -------------------------------------
  //  Yetki: split -> 'write'; merge kayit SILDIGI icin 'write' + 'delete'.
  const canSplit = useCallback((node) => canWrite(node) && !node.locked, [canWrite])
  const canMergeNode = useCallback(
    (node) =>
      canWrite(node) && can('delete', componentKeyOf('requirement', node.type)) && !node.locked,
    [canWrite, can],
  )

  const toggleSelect = useCallback((node, parentKey) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(node.id)) next.delete(node.id)
      else next.set(node.id, { node, parentKey })
      return next
    })
  }, [])

  const selectedList = useMemo(() => [...selected.values()], [selected])
  // Client-side on-kontrol (yalnizca UX): backend de ayni kurali uygular.
  // Merge yalnizca AYNI ust dugumdeki (kardes) ve AYNI tipteki kayitlar icin.
  const mergeBlockReason = (() => {
    if (selectedList.length < 2) return 'few'
    const first = selectedList[0]
    if (!selectedList.every((s) => s.parentKey === first.parentKey)) return 'notSiblings'
    if (!selectedList.every((s) => s.node.type === first.node.type)) return 'notSameType'
    return null
  })()

  // Bir islem sonrasi: etkilenen dugumlerin cache'ini tazele + duz listeleri
  // (AppContext) yenile ki Dashboard/tablolar da guncellensin.
  const refreshKeys = useCallback(
    async (keys) => {
      for (const key of keys.filter(Boolean)) fetchedRef.current.delete(key)
      await Promise.all(keys.filter(Boolean).map((k) => fetchChildren(k === ROOT_KEY ? null : k)))
      await refresh()
    },
    [fetchChildren, refresh],
  )

  const handleSplit = useCallback(
    async (newTitles) => {
      const node = splitNode
      await splitRequirement(projectId, node.id, newTitles)
      // Yeni kardesler orijinalin USTUNDE olusur -> o listeyi tazele.
      await refreshKeys([findParentKey(node.id) || ROOT_KEY])
      setError(null)
    },
    [splitNode, projectId, findParentKey, refreshKeys],
  )

  const handleMerge = useCallback(
    async (ids) => {
      const parentKeys = [...new Set(selectedList.map((s) => s.parentKey))]
      const survivor = await mergeRequirements(projectId, ids)
      setSelected(new Map())
      // Birlesenlerin cocuklari survivor'a tasindi: hem kardes listesini hem de
      // survivor'un kendi cocuk listesini tazele.
      await refreshKeys([...parentKeys, survivor?.id])
      setError(null)
      return survivor
    },
    [selectedList, projectId, refreshKeys],
  )

  // --- Render -----------------------------------------------------------------
  const renderRows = (parentKey, depth) => {
    const nodes = childrenById[parentKey]
    if (!nodes) return null
    return nodes.map((node) => {
      const isOpen = expanded.has(node.id)
      const isLoading = loadingIds.has(node.id)
      // Kilitli (onaylanmis) kayitlar surüklenemez; backend zaten 403 doner,
      // ama kullaniciya ONCEDEN gostermek daha iyi.
      const draggable = canWrite(node) && !node.locked
      const isDropTarget = dropTarget?.key === node.id
      return (
        <div key={node.id}>
          <div
            ref={(el) => {
              rowRefs.current[node.id] = el
            }}
            data-testid={`tree-row-${node.text_id}`}
            draggable={draggable}
            onDragStart={(e) => {
              setDragNode(node)
              e.dataTransfer?.setData?.('text/plain', node.id)
            }}
            onDragEnd={() => {
              setDragNode(null)
              setDropTarget(null)
            }}
            onDragOver={(e) => {
              if (!dragNode) return
              const valid = canDropOn(dragNode, node)
              if (valid) e.preventDefault() // yalnizca gecerli hedef birakmaya izin verir
              if (e.dataTransfer) e.dataTransfer.dropEffect = valid ? 'move' : 'none'
              setDropTarget({ key: node.id, valid })
            }}
            onDragLeave={() => setDropTarget((prev) => (prev?.key === node.id ? null : prev))}
            onDrop={(e) => {
              e.preventDefault()
              if (canDropOn(dragNode, node)) handleDrop(node)
              else setDropTarget(null)
            }}
            className={
              'group/row flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm dark:border-slate-800 ' +
              (draggable ? 'cursor-grab ' : '') +
              (isDropTarget && dropTarget.valid
                ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-400 dark:bg-emerald-900/30 '
                : isDropTarget
                  ? 'cursor-not-allowed bg-rose-50 ring-1 ring-inset ring-rose-400 dark:bg-rose-900/30 '
                  : highlightId === node.id
                    ? 'bg-brand-50 dark:bg-brand-900/30 '
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 ')
            }
            style={{ paddingLeft: 12 + depth * INDENT_PX }}
          >
            {/* Merge secimi — kilitli/yetkisiz satirlarda kapali */}
            <input
              type="checkbox"
              checked={selected.has(node.id)}
              disabled={!canMergeNode(node)}
              onChange={() => toggleSelect(node, parentKey)}
              aria-label={t('tree.selectRow', { id: node.text_id })}
              className="shrink-0 accent-brand-600 disabled:opacity-30"
            />
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
            {node.locked && (
              <IconLock
                size={13}
                className="shrink-0 text-amber-500"
                aria-label={t('tree.locked')}
              />
            )}
            {canSplit(node) && (
              <button
                onClick={() => setSplitNode(node)}
                aria-label={t('tree.split')}
                title={t('tree.split')}
                className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-700 focus:opacity-100 group-hover/row:opacity-100 dark:hover:bg-slate-700"
              >
                <IconUnlink size={14} />
              </button>
            )}
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

      {/* Secim aksiyon seridi (merge) */}
      {selectedList.length > 0 && (
        <div
          data-testid="tree-selection-bar"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm dark:border-brand-800 dark:bg-brand-900/30"
        >
          <span className="font-semibold text-brand-800 dark:text-brand-200">
            {t('tree.selected', { n: selectedList.length })}
          </span>
          <button
            onClick={() => setMergeOpen(true)}
            disabled={Boolean(mergeBlockReason)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconLink size={14} /> {t('tree.merge')}
          </button>
          {mergeBlockReason && mergeBlockReason !== 'few' && (
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {t(mergeBlockReason === 'notSiblings' ? 'merge.notSiblings' : 'merge.notSameType')}
            </span>
          )}
          <button
            onClick={() => setSelected(new Map())}
            className="ml-auto text-xs font-semibold text-slate-500 hover:underline dark:text-slate-400"
          >
            {t('tree.clearSelection')}
          </button>
        </div>
      )}

      {/* "Koke tasi" birakma alani — yalnizca surukleme sirasinda gorunur.
          Backend kuralina gore koke yalnizca User Requirement tasinabilir. */}
      {dragNode && (
        <div
          data-testid="tree-root-dropzone"
          onDragOver={(e) => {
            const valid = canDropOn(dragNode, null)
            if (valid) e.preventDefault()
            if (e.dataTransfer) e.dataTransfer.dropEffect = valid ? 'move' : 'none'
            setDropTarget({ key: ROOT_KEY, valid })
          }}
          onDragLeave={() => setDropTarget((prev) => (prev?.key === ROOT_KEY ? null : prev))}
          onDrop={(e) => {
            e.preventDefault()
            if (canDropOn(dragNode, null)) handleDrop(null)
            else setDropTarget(null)
          }}
          className={
            'rounded-lg border border-dashed px-3 py-2 text-center text-xs font-semibold ' +
            (dropTarget?.key === ROOT_KEY && dropTarget.valid
              ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400')
          }
        >
          {t('tree.dropToRoot')}
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

      <SplitModal
        open={Boolean(splitNode)}
        node={splitNode}
        onClose={() => setSplitNode(null)}
        onSubmit={handleSplit}
      />
      <MergeModal
        open={mergeOpen}
        nodes={selectedList.map((s) => s.node)}
        onClose={() => setMergeOpen(false)}
        onSubmit={handleMerge}
      />
    </div>
  )
}
