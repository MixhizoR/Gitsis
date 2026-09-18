// ============================================================================
//  useEntityViews.js  —  Kayitli Gorunumler (Saved Views) durum yonetimi.
//
//  NEDEN: useEntityFilters filtreleri yalnizca sessionStorage'da tutar —
//  sekme kapaninca kaybolur ve ayni filtre setini her seferinde yeniden
//  kurmak gerekir. Tablo sutunlari ise tamamen sabitti. Bu hook, bir liste
//  sayfasinin FILTRE + SUTUN DUZENI + SATIR DUZENI ucgenini isimlendirip
//  BACKEND'de (kullanici bazli, kalici) saklar.
//
//  DAVRANIS KURALLARI:
//    - Gorunum SECILMEDIGINDE sayfa eskisi gibi calisir: filtreler
//      sessionStorage'dan gelir, sutunlar varsayilan sirada ve hepsi
//      goruniur, satir duzeni varsayilandir. Hicbir eski davranis bozulmaz.
//    - Sayfa ilk acildiginda VARSAYILAN gorunum (isDefault) otomatik
//      uygulanir; kisisel varsayilan, proje geneli varsayilandan onceliklidir.
//    - Sayfalar arasi gezinirken secim sessionStorage'da tasinir; oturum
//      kapaninca secim dusser ama VARSAYILAN gorunum yine devreye girer —
//      yani kullanici ayni sonucu tekrar gorur (kabul kriteri).
//    - Secili gorunum uzerinde degisiklik yapilirsa `dirty` true olur;
//      kullanici "Guncelle" ile kaydeder veya "Farkli kaydet" ile yenisini
//      olusturur. Kaydedilmeyen degisiklik tabloyu yine de etkiler (anlik
//      onizleme) — yalnizca KALICI hale gelmez.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as data from '../services/dataService.js'
import {
  DEFAULT_ROW_LAYOUT,
  defaultColumnLayout,
  mergeColumnLayout,
  normalizeRowLayout,
  visibleColumnKeys,
} from '../utils/viewConfig.js'

const SELECTION_PREFIX = 'ehsim_view:'

// Kullanicinin bu sekmede gorunumu BILEREK kapattigini isaretler. Bos dize
// "hic secim yapilmadi" ile karisirdi; o durumda varsayilan gorunum
// uygulanmalidir, bu durumda ise UYGULANMAMALIDIR.
const NONE = '__none__'

function readSelection(navKey) {
  try {
    return sessionStorage.getItem(SELECTION_PREFIX + navKey)
  } catch {
    return null
  }
}

function writeSelection(navKey, id) {
  try {
    sessionStorage.setItem(SELECTION_PREFIX + navKey, id || NONE)
  } catch {
    /* yok say — secim kalici olmasa da gorunum calisir */
  }
}

/** Iki gorunum parcasini karsilastirmak icin kararli bir imza uretir. */
const signature = (filters, columnLayout, rowLayout) =>
  JSON.stringify({
    filters: {
      q: filters?.q || '',
      type: filters?.type || '',
      field: filters?.field || '',
      status: filters?.status || '',
      assignee: filters?.assignee || '',
      attrs: Object.fromEntries(
        Object.entries(filters?.attrs || {})
          .filter(([, v]) => v !== '' && v !== null && v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    },
    columns: (columnLayout || []).map((c) => [c.key, c.visible !== false]),
    rowLayout: normalizeRowLayout(rowLayout),
  })

/**
 * @param {object}   opts
 * @param {string}   opts.projectId  Aktif proje (yoksa hook pasiftir).
 * @param {string}   opts.navKey     Sayfa/nav-item anahtari (useEntityFilters ile ayni).
 * @param {Array}    opts.catalog    Sayfanin o anki sutun katalogu (viewConfig.columnCatalog).
 * @param {object}   opts.filters    useEntityFilters().filters
 * @param {Function} opts.onApplyFilters  useEntityFilters().replace
 */
export function useEntityViews({ projectId, navKey, catalog, filters, onApplyFilters }) {
  const [views, setViews] = useState([])
  const [selectedId, setSelectedId] = useState(() => {
    const saved = readSelection(navKey)
    return saved && saved !== NONE ? saved : ''
  })
  const [columnLayout, setColumnLayout] = useState(() => defaultColumnLayout(catalog || []))
  const [rowLayout, setRowLayout] = useState(DEFAULT_ROW_LAYOUT)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Ilk yuklemede varsayilan gorunum YALNIZCA BIR KEZ uygulanir; sonrasinda
  // kullanicinin secimi (ve "gorunum yok" secimi) korunur.
  const bootstrapped = useRef(false)

  const applyFilters = useCallback(
    (next) => {
      if (onApplyFilters) onApplyFilters(next)
    },
    [onApplyFilters],
  )

  // Katalog degisince (yeni oznitelik eklendi/silindi) duzeni guncelle:
  // silinen sutun duser, yeni sutun sona gorunur olarak eklenir.
  const catalogKey = useMemo(() => (catalog || []).map((c) => c.key).join('|'), [catalog])
  useEffect(() => {
    setColumnLayout((prev) => mergeColumnLayout(catalog || [], prev))
    // catalogKey degisimi yeterli — katalog her render'da yeni dizi olabilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogKey])

  const applyView = useCallback(
    (view) => {
      if (!view) return
      applyFilters(view.filters || {})
      setColumnLayout(mergeColumnLayout(catalog || [], view.columns))
      setRowLayout(normalizeRowLayout(view.rowLayout))
      setPage(1)
    },
    [applyFilters, catalog],
  )

  // --- Yukleme --------------------------------------------------------------
  useEffect(() => {
    if (!projectId || !navKey) return undefined
    let cancelled = false
    setLoading(true)
    data
      .listViews(projectId, navKey)
      .then((list) => {
        if (cancelled) return
        const rows = Array.isArray(list) ? list : []
        setViews(rows)
        setError(null)
        if (bootstrapped.current) return
        bootstrapped.current = true
        const saved = readSelection(navKey)
        // Oncelik: sekmede secili kalan gorunum > kisisel varsayilan >
        // proje geneli varsayilan. Hicbiri yoksa gorunum secilmez (eski
        // sessionStorage davranisi aynen surer). Kullanici bu sekmede
        // gorunumu bilerek kapattiysa (NONE) varsayilan da uygulanmaz.
        const chosen =
          saved === NONE
            ? null
            : rows.find((v) => v.id === saved) ||
              rows.find((v) => v.isDefault && v.scope !== 'project') ||
              rows.find((v) => v.isDefault)
        if (chosen) {
          setSelectedId(chosen.id)
          writeSelection(navKey, chosen.id)
          applyView(chosen)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Gorunumler yuklenemedi.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // applyView katalog degisiminde yeniden uretilir; yeniden fetch gerekmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, navKey])

  const selected = useMemo(
    () => views.find((v) => v.id === selectedId) || null,
    [views, selectedId],
  )

  // Filtre/sutun/satir duzeni degisince sayfa basa doner — aksi halde
  // kullanici 7. sayfada bos bir liste gorurdu.
  const resetKey = signature(filters, columnLayout, rowLayout)
  useEffect(() => {
    setPage(1)
  }, [resetKey])

  const dirty = useMemo(() => {
    if (!selected) return false
    const current = signature(filters, columnLayout, rowLayout)
    const saved = signature(
      selected.filters,
      mergeColumnLayout(catalog || [], selected.columns),
      selected.rowLayout,
    )
    return current !== saved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, filters, columnLayout, rowLayout, catalogKey])

  // --- Eylemler -------------------------------------------------------------
  const selectView = useCallback(
    (id) => {
      setSelectedId(id || '')
      writeSelection(navKey, id || '')
      if (!id) {
        // "Gorunum yok": sutun/satir duzeni varsayilana doner, filtreler
        // OLDUGU GIBI kalir (kullanicinin o anki calismasi silinmesin).
        setColumnLayout(defaultColumnLayout(catalog || []))
        setRowLayout(DEFAULT_ROW_LAYOUT)
        setPage(1)
        return
      }
      applyView(views.find((v) => v.id === id))
    },
    [navKey, views, applyView, catalog],
  )

  const payload = useCallback(
    () => ({
      navKey,
      filters,
      columns: columnLayout,
      rowLayout: normalizeRowLayout(rowLayout),
    }),
    [navKey, filters, columnLayout, rowLayout],
  )

  const refreshInto = useCallback(
    async (view) => {
      const list = await data.listViews(projectId, navKey)
      setViews(Array.isArray(list) ? list : [])
      if (view) {
        setSelectedId(view.id)
        writeSelection(navKey, view.id)
      }
      return view
    },
    [projectId, navKey],
  )

  /** Yeni gorunum: o anki filtre + sutun + satir duzenini isimle kaydeder. */
  const saveAs = useCallback(
    async (name, { scope = 'user', isDefault = false } = {}) => {
      const view = await data.createView(projectId, { ...payload(), name, scope, isDefault })
      return refreshInto(view)
    },
    [projectId, payload, refreshInto],
  )

  /** Secili gorunumu o anki duzenle gunceller. */
  const update = useCallback(async () => {
    if (!selected) return null
    const view = await data.updateView(projectId, selected.id, payload())
    return refreshInto(view)
  }, [projectId, selected, payload, refreshInto])

  const rename = useCallback(
    async (name) => {
      if (!selected) return null
      const view = await data.updateView(projectId, selected.id, { name })
      return refreshInto(view)
    },
    [projectId, selected, refreshInto],
  )

  const makeDefault = useCallback(async () => {
    if (!selected) return null
    const view = await data.setDefaultView(projectId, selected.id)
    return refreshInto(view)
  }, [projectId, selected, refreshInto])

  const remove = useCallback(async () => {
    if (!selected) return null
    await data.deleteView(projectId, selected.id)
    setSelectedId('')
    writeSelection(navKey, '')
    setColumnLayout(defaultColumnLayout(catalog || []))
    setRowLayout(DEFAULT_ROW_LAYOUT)
    return refreshInto(null)
  }, [projectId, navKey, selected, catalog, refreshInto])

  const columnKeys = useMemo(() => visibleColumnKeys(columnLayout), [columnLayout])

  return {
    views,
    selected,
    selectedId,
    selectView,
    columnLayout,
    setColumnLayout,
    columnKeys,
    rowLayout,
    setRowLayout,
    page,
    setPage,
    dirty,
    loading,
    error,
    saveAs,
    update,
    rename,
    makeDefault,
    remove,
  }
}
