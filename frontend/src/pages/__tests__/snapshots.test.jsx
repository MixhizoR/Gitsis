// ============================================================================
//  snapshots.test.jsx — Smoke test for SnapshotsPage (Issue #8).
//  TDD: bu test önce (RED), sonra component eklendikten sonra yeşile döner (GREEN).
// ============================================================================
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

// AppContext mock (SnapshotsPage için) - module level mock
vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    snapshots: [],
    isPM: true,
    loading: false,
    createSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
    refresh: vi.fn(),
  }),
  AppProvider: ({ children }) => children,
}))

// AuthContext mock
vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    isPM: true,
    can: vi.fn(() => true),
  }),
  AuthProvider: ({ children }) => children,
}))

// Lang context sağlayici
const Wrap = ({ children }) => <LanguageProvider>{children}</LanguageProvider>

describe('Smoke — SnapshotsPage render', () => {
  it('SnapshotsPage import edilebilir', async () => {
    const SnapshotsPage = (await import('../Snapshots.jsx')).default
    expect(SnapshotsPage).toBeDefined()
  })

  it('SnapshotsPage boş snapshot listesi render eder', async () => {
    const SnapshotsPage = (await import('../Snapshots.jsx')).default
    render(
      <Wrap>
        <SnapshotsPage />
      </Wrap>,
    )
    // Boş state mesajı görünmeli
    expect(screen.getByText(/Henüz snapshot yok/i)).toBeInTheDocument()
  })

  it('SnapshotsPage PM için "Yeni Snapshot" butonu gösterir', async () => {
    const SnapshotsPage = (await import('../Snapshots.jsx')).default
    render(
      <Wrap>
        <SnapshotsPage />
      </Wrap>,
    )
    // Butonlardan en az biri görünmeli
    const buttons = screen.getAllByRole('button', { name: /Yeni Snapshot|New Snapshot/i })
    expect(buttons.length).toBeGreaterThanOrEqual(1)
  })
})
