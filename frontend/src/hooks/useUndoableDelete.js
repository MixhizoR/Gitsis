// ============================================================================
//  useUndoableDelete.js  —  5 saniyelik "Geri Al" (soft-delete) zamanlayicisi.
//
//  Mantik: silme istegi geldiginde HICBIR API cagrisi yapilmaz. Bunun yerine
//  ilgili id'ler "pending" (bekleyen) olarak isaretlenir; cagiran sayfa bu
//  id'leri tablodan gizler ve geri sayimli bir toast gosterir.
//    * 5 sn icinde "Geri Al" -> pending temizlenir, satirlar geri gelir,
//      HICBIR silme yapilmaz.
//    * 5 sn dolarsa           -> commitFn(ids) cagrilir (gercek toplu silme).
//
//  Guvenlik: yeni bir silme beklerken baska bir silme gelirse, oncekini hemen
//  isler (commit) ve yenisini baslatir. Bilesen unmount olursa bekleyen silme
//  veri kaybi olmasin diye aninda islenir.
// ============================================================================
import { useState, useRef, useEffect, useCallback } from 'react'

export function useUndoableDelete(commitFn, { seconds = 5 } = {}) {
  const [pending, setPending] = useState(null) // { ids, label } | null
  const [secondsLeft, setSecondsLeft] = useState(seconds)

  const timeoutRef = useRef(null)
  const intervalRef = useRef(null)
  const pendingRef = useRef(null)
  const commitRef = useRef(commitFn)
  commitRef.current = commitFn

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    timeoutRef.current = null
    intervalRef.current = null
  }, [])

  // Bekleyen silmeyi gercekten uygula (API).
  const commitNow = useCallback(async () => {
    const p = pendingRef.current
    clearTimers()
    pendingRef.current = null
    setPending(null)
    if (p && p.ids.length) {
      try { await commitRef.current(p.ids) } catch { /* sessiz: refresh zaten calisir */ }
    }
  }, [clearTimers])

  // Yeni bir soft-delete zamanla.
  const schedule = useCallback(async (ids, meta = {}) => {
    if (!ids || ids.length === 0) return
    // Onceki bekleyen varsa hemen isle.
    if (pendingRef.current) {
      const prev = pendingRef.current
      clearTimers()
      pendingRef.current = null
      if (prev.ids.length) {
        try { await commitRef.current(prev.ids) } catch { /* yut */ }
      }
    }
    const p = { ids: [...ids], ...meta }
    pendingRef.current = p
    setPending(p)
    setSecondsLeft(seconds)
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 1 ? s - 1 : s))
    }, 1000)
    timeoutRef.current = setTimeout(() => { commitNow() }, seconds * 1000)
  }, [seconds, clearTimers, commitNow])

  // Geri al: hicbir sey silme.
  const undo = useCallback(() => {
    clearTimers()
    pendingRef.current = null
    setPending(null)
  }, [clearTimers])

  // Unmount olursa bekleyeni kaybetme; hemen isle.
  useEffect(() => () => {
    const p = pendingRef.current
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (p && p.ids.length) { try { commitRef.current(p.ids) } catch { /* yut */ } }
  }, [])

  return {
    pending,
    pendingIds: pending ? pending.ids : [],
    secondsLeft,
    isPending: Boolean(pending),
    schedule,
    undo,
    commitNow,
  }
}
