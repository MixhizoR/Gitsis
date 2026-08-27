// ============================================================================
//  useUndoableDelete.test.jsx — useUndoableDelete hook regresyon testleri.
//  5 sn geri sayim, undo, schedule cakisma, unmount commit, commitNow.
//  Timer'lar jsdom fake-timer ile kontrol edilir.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoableDelete } from '../useUndoableDelete.js'

describe('useUndoableDelete', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('baslangicta pending yok, secondsLeft default 5', () => {
    const { result } = renderHook(() => useUndoableDelete(vi.fn()))
    expect(result.current.pending).toBeNull()
    expect(result.current.isPending).toBe(false)
    expect(result.current.pendingIds).toEqual([])
    expect(result.current.secondsLeft).toBe(5)
  })

  it('schedule sonrasi isPending true, pendingIds dolu, secondsLeft azalir', async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useUndoableDelete(commit))

    await act(async () => {
      await result.current.schedule(['x', 'y'])
    })
    expect(result.current.isPending).toBe(true)
    expect(result.current.pendingIds).toEqual(['x', 'y'])
    expect(result.current.secondsLeft).toBe(5)

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.secondsLeft).toBe(3)
  })

  it('5 sn sonunda commitFn otomatik cagrilir', async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useUndoableDelete(commit))

    await act(async () => {
      await result.current.schedule(['id-1'])
    })

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(commit).toHaveBeenCalledWith(['id-1'])
    expect(result.current.isPending).toBe(false)
  })

  it("undo pending'i iptal eder, commitFn cagrilmaz", async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useUndoableDelete(commit))

    await act(async () => {
      await result.current.schedule(['id-1'])
    })
    act(() => result.current.undo())

    expect(result.current.isPending).toBe(false)
    expect(result.current.pendingIds).toEqual([])

    await act(async () => {
      vi.advanceTimersByTime(10000)
    })
    expect(commit).not.toHaveBeenCalled()
  })

  it('yeni schedule gelince onceki pending aninda commit edilir', async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useUndoableDelete(commit))

    await act(async () => {
      await result.current.schedule(['first'])
    })
    // Cakisma: yeni schedule oncekini commit etmeli.
    await act(async () => {
      await result.current.schedule(['second'])
    })
    expect(commit).toHaveBeenCalledWith(['first'])
    expect(result.current.pendingIds).toEqual(['second'])
  })

  it('commitNow manuel tetikleme yapabilir', async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useUndoableDelete(commit))

    await act(async () => {
      await result.current.schedule(['id-1'])
    })
    await act(async () => {
      await result.current.commitNow()
    })
    expect(commit).toHaveBeenCalledWith(['id-1'])
    expect(result.current.isPending).toBe(false)
  })

  it('bos id listesi ile schedule no-op yapar', async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useUndoableDelete(commit))

    await act(async () => {
      await result.current.schedule([])
    })
    expect(result.current.isPending).toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })

  it('commitFn hata firlatsa bile state temizlenir', async () => {
    const commit = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useUndoableDelete(commit))

    await act(async () => {
      await result.current.schedule(['id-1'])
    })
    await act(async () => {
      await result.current.commitNow()
    })
    expect(commit).toHaveBeenCalledWith(['id-1'])
    expect(result.current.isPending).toBe(false)
  })
})
