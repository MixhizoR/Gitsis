// ============================================================================
//  useBulkSelection.js  —  Tablo/kart listelerinde coklu secim durumu.
//  `visibleIds` (o an gorunen satirlarin id'leri) ile calisir; gorunmeyen
//  (silinmis/filtrelenmis) id'ler otomatik olarak secimden duser (effective).
// ============================================================================
import { useState, useMemo, useCallback } from 'react'

export function useBulkSelection(visibleIds) {
  const [selected, setSelected] = useState(() => new Set())

  // Yalnizca hala gorunur olan secimler gecerlidir.
  const effective = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected]
  )
  const selectedSet = useMemo(() => new Set(effective), [effective])
  const count = effective.length
  const allSelected = visibleIds.length > 0 && count === visibleIds.length
  const someSelected = count > 0 && !allSelected

  const toggleRow = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allSel = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSel) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }, [visibleIds])

  const clear = useCallback(() => setSelected(new Set()), [])

  return { selectedSet, selectedIds: effective, count, allSelected, someSelected, toggleRow, toggleAll, clear }
}
