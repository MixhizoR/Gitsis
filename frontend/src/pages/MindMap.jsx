// ============================================================================
//  MindMap.jsx  —  "Zihin Haritasi": izlenebilirlik zincirinin agac gorunumu.
//
//  Matris (Traceability) ve liste (LinkManager) gorunumleri bir gereksinimin
//  KOMSULARINI gosterir; burada amac ZINCIRIN TAMAMINI (User -> System ->
//  Sub-system -> Test) tek ekranda kavramaktir.
//
//  * Veri kaynagi AppContext'tir: proje verisi tazelendiginde (refresh)
//    harita da kendiliginden guncellenir — ayri bir "yenile" adimi yoktur.
//  * Acik/kapali dal durumu sayfa icinde korunur; YOL anahtariyla tutulur
//    (ayni kayit skip-level baglarla birden fazla dalda gorunebilir).
//  * "Bağlantı Ağacı" (PBS) sayfasi bundan BAGIMSIZDIR ve degismemistir:
//    orasi tek-ebeveynli urun agaci, burasi izlenebilirlik bag grafigidir.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { useProject } from '../context/ProjectContext.jsx'
import MindMapCanvas from '../components/traceability/MindMapCanvas.jsx'
import ViewModal from '../components/common/ViewModal.jsx'
import { componentKeyOf } from '../utils/permissions.js'
import {
  MIND_MAP_BRANCH_COLORS,
  MIND_MAP_LEVELS,
  buildMindMapGraph,
  buildMindMapSvg,
  collectExpandableKeys,
  layoutMindMap,
} from '../utils/mindMap.js'
import { IconDownload, IconSparkle } from '../components/common/Icons.jsx'

// Disa aktarim PNG'sinin piksel tavani (yaklasik 16 MP) — devasa haritalarda
// tarayicinin canvas belleginin tukenmesini onler.
const PNG_MAX_PIXELS = 16_000_000

function slugify(text) {
  return (
    String(text || 'mind-map')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'mind-map'
  )
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function MindMap() {
  const { requirements, testCases, links, theme, refresh } = useApp()
  const { can } = useAuth()
  const { activeProject } = useProject()
  const { t } = useLang()

  const [expanded, setExpanded] = useState(() => new Set())
  const [viewRow, setViewRow] = useState(null) // { row, kind } | null
  const [exportError, setExportError] = useState('')
  // Ilk gorulduginde kendiliginden acilan kokler; kullanicinin sonradan
  // kapattigi bir kok TEKRAR acilmasin diye "gorulenler" ayri tutulur.
  const seenRoots = useRef(new Set())

  const graph = useMemo(
    () => buildMindMapGraph(requirements, testCases, links),
    [requirements, testCases, links],
  )

  // Canli gorunum: sayfa acildiginda ve sekmeye geri donuldugunde proje
  // verisi tazelenir. Mutasyonlar zaten AppContext uzerinden yayildigi icin
  // haritada ayri bir "yenile" butonu YOKTUR.
  useEffect(() => {
    refresh?.()
    const onFocus = () => refresh?.()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  // Yeni gorunen kokler kendiliginden acilir: boylece yeni eklenen bir kayit
  // (ya da bagi kopmus bir kayit) haritada dallariyla birlikte belirir.
  useEffect(() => {
    const fresh = graph.rootIds.filter((id) => !seenRoots.current.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) seenRoots.current.add(id)
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of fresh) next.add(id)
      return next
    })
  }, [graph])

  const mapLayout = useMemo(() => layoutMindMap(graph, expanded), [graph, expanded])

  const toggle = useCallback((key) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const expandAll = () => setExpanded(collectExpandableKeys(graph).keys)
  const collapseAll = () => setExpanded(new Set())

  // --- Kayit detayi ---------------------------------------------------------
  const canOpenNode = useCallback(
    (record) => can('read', componentKeyOf(record.node.kind, record.node.type)),
    [can],
  )
  const openNode = useCallback((record) => {
    setViewRow({ row: record.node.row, kind: record.node.kind })
  }, [])

  // --- Disa aktarim ---------------------------------------------------------
  //  Ekranda cizilen harita SANALLASTIRILDIGI icin gorsel, canli DOM'dan
  //  degil ayni duzenden uretilen bagimsiz SVG metninden olusturulur.
  const baseName = () =>
    `zihin-haritasi-${slugify(activeProject?.name)}-${new Date().toISOString().slice(0, 10)}`

  const exportSvg = () => {
    setExportError('')
    try {
      const svg = buildMindMapSvg(mapLayout, { theme, title: activeProject?.name || 'Mind Map' })
      download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${baseName()}.svg`)
    } catch {
      setExportError(t('mindmap.exportError'))
    }
  }

  const exportPng = () => {
    setExportError('')
    try {
      const svg = buildMindMapSvg(mapLayout, { theme, title: activeProject?.name || 'Mind Map' })
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
      const img = new Image()
      img.onload = () => {
        try {
          const scale = Math.min(
            2,
            Math.sqrt(PNG_MAX_PIXELS / Math.max(1, mapLayout.width * mapLayout.height)),
          )
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(mapLayout.width * scale))
          canvas.height = Math.max(1, Math.round(mapLayout.height * scale))
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          canvas.toBlob((blob) => {
            if (blob) download(blob, `${baseName()}.png`)
            else setExportError(t('mindmap.exportError'))
          }, 'image/png')
        } catch {
          setExportError(t('mindmap.exportError'))
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        setExportError(t('mindmap.exportError'))
      }
      img.src = url
    } catch {
      setExportError(t('mindmap.exportError'))
    }
  }

  const totalNodes = graph.nodes.size
  const isEmpty = totalNodes === 0

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Ozet + aciklama */}
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
          <IconSparkle size={22} />
        </div>
        <div className="min-w-[220px] flex-1">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('mindmap.intro')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {MIND_MAP_LEVELS.map((lvl) => (
            <span
              key={lvl}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: MIND_MAP_BRANCH_COLORS[lvl] }}
              />
              {t(`mindmap.level.${lvl}`)}
            </span>
          ))}
        </div>
      </div>

      {/* Arac cubugu */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={expandAll}
          data-testid="mindmap-expand-all"
          className="btn-secondary btn-sm"
        >
          {t('mindmap.expandAll')}
        </button>
        <button
          type="button"
          onClick={collapseAll}
          data-testid="mindmap-collapse-all"
          className="btn-secondary btn-sm"
        >
          {t('mindmap.collapseAll')}
        </button>
        <div className="flex-1" />
        <span
          data-testid="mindmap-counts"
          className="text-[11px] font-semibold text-slate-400 tabular-nums"
        >
          {t('mindmap.counts', {
            visible: mapLayout.nodes.length,
            total: totalNodes,
            links: graph.linkCount,
          })}
        </span>
        <button
          type="button"
          onClick={exportPng}
          data-testid="mindmap-export-png"
          className="btn-secondary btn-sm"
        >
          <IconDownload size={14} /> PNG
        </button>
        <button
          type="button"
          onClick={exportSvg}
          data-testid="mindmap-export-svg"
          className="btn-secondary btn-sm"
        >
          <IconDownload size={14} /> SVG
        </button>
      </div>

      {exportError && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          {exportError}
        </div>
      )}
      {mapLayout.truncated && (
        <div
          data-testid="mindmap-truncated"
          className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        >
          {t('mindmap.truncated', { n: mapLayout.nodes.length })}
        </div>
      )}

      {isEmpty ? (
        <div className="card flex-1 px-4 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('mindmap.empty')}
        </div>
      ) : (
        <MindMapCanvas
          mapLayout={mapLayout}
          theme={theme}
          onToggle={toggle}
          onOpenNode={openNode}
          canOpenNode={canOpenNode}
          className="min-h-[420px] flex-1"
        />
      )}

      {/* Dugumden kaydin detayina. Harita SALT OKUNURDUR: duzenleme kendi
          sayfasindan yapilir, burada aciklama kaydedilmez. */}
      <ViewModal
        open={Boolean(viewRow)}
        row={viewRow?.row || null}
        canWrite={false}
        showStatus={viewRow?.kind !== 'requirement'}
        showVerification={viewRow?.kind === 'requirement'}
        commentEntityType={viewRow?.kind === 'requirement' ? 'requirement' : 'testcase'}
        onClose={() => setViewRow(null)}
      />
    </div>
  )
}
