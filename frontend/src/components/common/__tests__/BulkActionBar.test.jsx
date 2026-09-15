// ============================================================================
//  BulkActionBar.test.jsx — Toplu islem seridinin eylem gorunurlugu.
//  Issue #120: "Toplu Ata" yalnizca izin VARSA gorunur; izin kurali tek tek
//  duzenlemeyle aynidir (write) ve cagiran taraf `canAssign` ile gecer.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'
import BulkActionBar from '../BulkActionBar.jsx'

const renderBar = (props = {}) =>
  render(
    <LanguageProvider>
      <BulkActionBar count={3} onDelete={vi.fn()} onClear={vi.fn()} {...props} />
    </LanguageProvider>,
  )

describe('BulkActionBar — Toplu Ata (Issue #120)', () => {
  afterEach(() => cleanup())

  it('izin varsa "Toplu Ata" gorunur ve tiklanabilir', () => {
    const onAssign = vi.fn()
    renderBar({ onAssign, canAssign: true })
    const btn = screen.getByTestId('bulk-assign-btn')
    fireEvent.click(btn)
    expect(onAssign).toHaveBeenCalledTimes(1)
  })

  it('izin yoksa "Toplu Ata" HIC gosterilmez', () => {
    renderBar({ onAssign: vi.fn(), canAssign: false })
    expect(screen.queryByTestId('bulk-assign-btn')).not.toBeInTheDocument()
  })

  it('eylem verilmediyse buton gosterilmez (sayfa desteklemiyor)', () => {
    renderBar({ canAssign: true })
    expect(screen.queryByTestId('bulk-assign-btn')).not.toBeInTheDocument()
  })

  it('2 kayittan az secimde serit hic acilmaz', () => {
    renderBar({ count: 1, onAssign: vi.fn() })
    expect(screen.queryByTestId('bulk-assign-btn')).not.toBeInTheDocument()
  })
})
