// ============================================================================
//  MindMapCanvas.jsx  —  Zihin haritasinin CIZIM katmani (SVG).
//  Sorumlulugu tek sey: hazir bir duzeni (utils/mindMap.js) ekrana cizmek ve
//  yakinlastirma / kaydirma etkilesimini yonetmek. Veri, acik/kapali durumu
//  ve kayit detayi UST bilesenin (pages/MindMap.jsx) isidir.
//
//  PERFORMANS: 500+ dugumlu projelerde tum dugumleri DOM'a basmak pahalidir.
//  Iki kademeli koruma vardir:
//    1) KAPALI dallar zaten duzene hic girmez (kademeli yukleme),
//    2) duzene giren dugum sayisi esigi asarsa yalnizca GORUS ALANINA
//       dusenler cizilir (sanallastirma). Gorus dikdortgeni 200 birimlik
//       kovalara yuvarlanir; kucuk kaydirmalar yeniden hesap tetiklemez.
// ============================================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../../context/LanguageContext.jsx'
import { fitLabel, mindMapEdgePath, mindMapTheme } from '../../utils/mindMap.js'
import { IconPlus, IconReset, IconSearch } from '../common/Icons.jsx'

const MIN_ZOOM = 0.15
const MAX_ZOOM = 2.5
// Bu sayidan fazla dugum cizilecekse gorus alani disi dugumler atlanir.
const VIRTUALIZE_OVER = 220
// Sanallastirma penceresi payi ve kova boyu (dunya birimi).
const CULL_MARGIN = 320
const CULL_BUCKET = 200
// Bu yakinlastirma seviyesinin altinda etiket metni okunmaz; cizilmez de.
const LABEL_MIN_ZOOM = 0.45

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const bucketize = (v) => Math.floor(v / CULL_BUCKET) * CULL_BUCKET

export default function MindMapCanvas({
  mapLayout,
  theme = 'dark',
  onToggle,
  onOpenNode,
  canOpenNode = () => true,
  className = '',
}) {
  const { t } = useLang()
  const boxRef = useRef(null)
  const svgRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [panning, setPanning] = useState(false)
  const panRef = useRef(null)
  const fittedRef = useRef(false)
  const colors = mindMapTheme(theme)
  const L = mapLayout.layout

  // --- Kapsayici olcusu -----------------------------------------------------
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return undefined
    const read = () => setSize({ w: el.clientWidth || 0, h: el.clientHeight || 0 })
    read()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // --- Haritayi ekrana sigdir ----------------------------------------------
  const fitView = useCallback(() => {
    const { w, h } = { w: size.w, h: size.h }
    if (!w || !h || !mapLayout.width || !mapLayout.height) return
    const k = clamp(Math.min(w / mapLayout.width, h / mapLayout.height), MIN_ZOOM, 1.1)
    setView({
      k,
      x: -mapLayout.minX * k + (w - mapLayout.width * k) / 2,
      y: -mapLayout.minY * k + (h - mapLayout.height * k) / 2,
    })
  }, [size.w, size.h, mapLayout.width, mapLayout.height, mapLayout.minX, mapLayout.minY])

  // Ilk anlamli duzende bir kez sigdir. SONRAKI tazelemelerde (canli
  // guncelleme) gorus BILEREK korunur — kullanicinin baktigi yer kaymasin.
  useEffect(() => {
    if (fittedRef.current) return
    if (!size.w || mapLayout.nodes.length === 0) return
    fittedRef.current = true
    fitView()
  }, [size.w, mapLayout.nodes.length, fitView])

  const zoomBy = useCallback(
    (factor, cx, cy) => {
      setView((v) => {
        const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM)
        if (k === v.k) return v
        const px = cx ?? size.w / 2
        const py = cy ?? size.h / 2
        return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) }
      })
    },
    [size.w, size.h],
  )

  // Tekerlek ile yakinlastirma. React'in onWheel'i pasif dinleyiciye baglandigi
  // icin sayfanin kaymasini engelleyebilmek adina elle baglanir.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  // --- Kaydirma (pan) -------------------------------------------------------
  const onPointerDown = (e) => {
    if (e.button !== 0) return
    if (e.target.closest?.('[data-mindmap-hit]')) return // dugum/nokta tiklamasi
    panRef.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y }
    setPanning(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    const p = panRef.current
    if (!p) return
    setView((v) => ({ ...v, x: p.x + (e.clientX - p.px), y: p.y + (e.clientY - p.py) }))
  }
  const endPan = (e) => {
    if (!panRef.current) return
    panRef.current = null
    setPanning(false)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  // --- Sanallastirma --------------------------------------------------------
  //  Gorus dikdortgeni kovalara yuvarlanir; kucuk kaydirmalarda memo korunur.
  const cullOn = size.w > 0 && mapLayout.nodes.length > VIRTUALIZE_OVER
  const win = cullOn
    ? {
        x1: bucketize(-view.x / view.k - CULL_MARGIN),
        y1: bucketize(-view.y / view.k - CULL_MARGIN),
        x2: bucketize((size.w - view.x) / view.k + CULL_MARGIN) + CULL_BUCKET,
        y2: bucketize((size.h - view.y) / view.k + CULL_MARGIN) + CULL_BUCKET,
      }
    : null

  const drawn = useMemo(() => {
    if (!win) return { nodes: mapLayout.nodes, edges: mapLayout.edges }
    const nodes = mapLayout.nodes.filter(
      (n) =>
        n.x + L.nodeWidth >= win.x1 &&
        n.x <= win.x2 &&
        n.y + L.nodeHeight >= win.y1 &&
        n.y - L.nodeHeight <= win.y2,
    )
    const edges = mapLayout.edges.filter(
      (e) =>
        Math.max(e.x1, e.x2) >= win.x1 &&
        Math.min(e.x1, e.x2) <= win.x2 &&
        Math.max(e.y1, e.y2) >= win.y1 &&
        Math.min(e.y1, e.y2) <= win.y2,
    )
    return { nodes, edges }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLayout, L.nodeWidth, L.nodeHeight, win?.x1, win?.y1, win?.x2, win?.y2])

  const showLabels = view.k >= LABEL_MIN_ZOOM

  const ctrl = (label, onClick, children, testId) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      data-testid={testId}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {children}
    </button>
  )

  return (
    <div
      ref={boxRef}
      data-testid="mindmap-canvas"
      className={`relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}
      style={{ background: colors.bg }}
    >
      <svg
        ref={svgRef}
        role="tree"
        aria-label={t('mindmap.canvasLabel')}
        width="100%"
        height="100%"
        className={panning ? 'cursor-grabbing' : 'cursor-grab'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <g>
            {drawn.edges.map((e) => (
              <path
                key={e.key}
                d={mindMapEdgePath(e)}
                fill="none"
                stroke={e.color}
                strokeWidth={2}
                strokeOpacity={0.75}
                strokeLinecap="round"
              />
            ))}
          </g>
          <g>
            {drawn.nodes.map((n) => {
              const top = n.y - L.nodeHeight / 2
              const openable = canOpenNode(n)
              return (
                <g
                  key={n.key}
                  role="treeitem"
                  aria-expanded={n.hasChildren ? n.expanded : undefined}
                >
                  <rect
                    data-mindmap-hit="node"
                    data-testid={`mindmap-node-${n.node.text_id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.node.text_id} ${n.node.label}`}
                    x={n.x}
                    y={top}
                    width={L.nodeWidth}
                    height={L.nodeHeight}
                    rx={10}
                    fill={colors.nodeBg}
                    stroke={n.color}
                    strokeWidth={1.5}
                    style={{ cursor: openable ? 'pointer' : 'default' }}
                    onClick={() => openable && onOpenNode?.(n)}
                    onKeyDown={(e) => {
                      if (openable && (e.key === 'Enter' || e.key === ' ')) onOpenNode?.(n)
                    }}
                  />
                  <rect
                    x={n.x}
                    y={top + 6}
                    width={4}
                    height={L.nodeHeight - 12}
                    rx={2}
                    fill={n.color}
                    pointerEvents="none"
                  />
                  {showLabels && (
                    <>
                      <text
                        x={n.x + 14}
                        y={top + 17}
                        fontSize={10}
                        fontWeight={700}
                        fill={n.color}
                        className="font-mono"
                        pointerEvents="none"
                      >
                        {n.node.text_id}
                        {n.node.typeSuffix ? (
                          <tspan fill={colors.subText}> · {n.node.typeSuffix}</tspan>
                        ) : null}
                      </text>
                      <text
                        x={n.x + 14}
                        y={top + 32}
                        fontSize={11}
                        fill={colors.nodeText}
                        pointerEvents="none"
                      >
                        {fitLabel(n.node.label, L.nodeWidth)}
                      </text>
                    </>
                  )}
                  {/* Dalin ucundaki nokta: dali acar / kapatir. */}
                  {n.hasChildren && (
                    <g
                      data-mindmap-hit="dot"
                      data-testid={`mindmap-toggle-${n.node.text_id}`}
                      role="button"
                      tabIndex={0}
                      aria-label={t(
                        n.expanded ? 'mindmap.collapseBranch' : 'mindmap.expandBranch',
                        {
                          id: n.node.text_id,
                          n: n.childCount,
                        },
                      )}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onToggle?.(n.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onToggle?.(n.key)
                      }}
                    >
                      <circle
                        cx={n.x + L.nodeWidth}
                        cy={n.y}
                        r={9}
                        fill={colors.dotBg}
                        stroke={n.color}
                        strokeWidth={2}
                      />
                      <path
                        d={
                          `M ${n.x + L.nodeWidth - 4} ${n.y} H ${n.x + L.nodeWidth + 4}` +
                          (n.expanded ? '' : ` M ${n.x + L.nodeWidth} ${n.y - 4} V ${n.y + 4}`)
                        }
                        stroke={n.color}
                        strokeWidth={1.9}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                      {!n.expanded && (
                        <text
                          x={n.x + L.nodeWidth + 16}
                          y={n.y + 4}
                          fontSize={10}
                          fontWeight={700}
                          fill={colors.subText}
                          pointerEvents="none"
                        >
                          {n.childCount}
                        </text>
                      )}
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      {/* Zoom kontrolleri */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        {ctrl(t('mindmap.zoomIn'), () => zoomBy(1.25), <IconPlus size={15} />, 'mindmap-zoom-in')}
        {ctrl(
          t('mindmap.zoomOut'),
          () => zoomBy(1 / 1.25),
          <span className="text-base font-bold leading-none">−</span>,
          'mindmap-zoom-out',
        )}
        {ctrl(t('mindmap.fit'), fitView, <IconSearch size={15} />, 'mindmap-fit')}
        {ctrl(
          t('mindmap.resetZoom'),
          () => setView((v) => ({ ...v, k: 1 })),
          <IconReset size={15} />,
          'mindmap-zoom-reset',
        )}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/40 px-2 py-1 text-[11px] font-semibold tabular-nums text-white">
        {Math.round(view.k * 100)}%
      </div>
    </div>
  )
}
