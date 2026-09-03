// ============================================================================
//  useBulkSelection.test.jsx — useBulkSelection hook regresyon testleri.
//  Gorunen id listesi ile secim durumunun tutarliligi (effective filter),
//  toggle/toggleAll/clear davranislari.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBulkSelection } from '../useBulkSelection.js'

describe('useBulkSelection', () => {
  it('baslangicta hicbir secili yok', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b', 'c']))
    expect(result.current.selectedSet.size).toBe(0)
    expect(result.current.count).toBe(0)
    expect(result.current.allSelected).toBe(false)
    expect(result.current.someSelected).toBe(false)
  })

  it('toggleRow bir id ekler, sonra cikarir', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b', 'c']))

    act(() => result.current.toggleRow('a'))
    expect(result.current.selectedSet.has('a')).toBe(true)
    expect(result.current.count).toBe(1)
    expect(result.current.someSelected).toBe(true)

    act(() => result.current.toggleRow('a'))
    expect(result.current.selectedSet.has('a')).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('toggleAll: tum gorunenleri secer, tekrar tiklama hepsini kaldirir', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b', 'c']))

    act(() => result.current.toggleAll())
    expect(result.current.allSelected).toBe(true)
    expect(result.current.count).toBe(3)

    act(() => result.current.toggleAll())
    expect(result.current.allSelected).toBe(false)
    expect(result.current.count).toBe(0)
  })

  it('gorunmeyen id secimi "effective" listesinden duser', () => {
    const { result, rerender } = renderHook(({ ids }) => useBulkSelection(ids), {
      initialProps: { ids: ['a', 'b', 'c'] },
    })

    act(() => result.current.toggleRow('a'))
    act(() => result.current.toggleRow('b'))
    expect(result.current.count).toBe(2)

    // Gorunen liste "a"ya indi — "b" artik effective degil.
    rerender({ ids: ['a'] })
    expect(result.current.count).toBe(1)
    expect(result.current.selectedSet.has('a')).toBe(true)
    expect(result.current.selectedSet.has('b')).toBe(false)
  })

  it('clear tum secimleri temizler', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b']))
    act(() => result.current.toggleAll())
    expect(result.current.count).toBe(2)

    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
    expect(result.current.allSelected).toBe(false)
  })

  it('bos visibleIds durumunda allSelected false doner', () => {
    const { result } = renderHook(() => useBulkSelection([]))
    expect(result.current.allSelected).toBe(false)
    expect(result.current.count).toBe(0)
  })
})
