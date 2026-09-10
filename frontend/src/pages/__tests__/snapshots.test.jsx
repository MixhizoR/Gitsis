// ============================================================================
//  snapshots.test.jsx — Smoke test for SnapshotsPage (Issue #8).
//  TDD: bu test önce (RED), sonra component eklendikten sonra yeşile döner (GREEN).
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const getSnapshot = vi.fn()
vi.mock('../../services/dataService.js', () => ({
  getSnapshot: (...a) => getSnapshot(...a),
}))

// AppContext mock (SnapshotsPage için) - module level mock
const snapshotsMock = { value: [] }
vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    snapshots: snapshotsMock.value,
    projectId: 'p-1',
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

// vitest globals kapali oldugu icin otomatik cleanup yok; DOM'u elle temizle
// (bu dosyada artik birden fazla render() cagrisi var).
afterEach(cleanup)

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

// Kullanıcı talebi: snapshot artık (1) modular öznitelikleri ve (2) o anki
// menü grubu/sayfa düzenini de yakalar. Bu blok, detay modalının bu iki
// yeni veri türünü doğru gösterdiğini kanıtlar.
describe('SnapshotDetailModal — modular öznitelikler + menü yapısı', () => {
  const SNAPSHOT_DETAIL = {
    id: 'snap-1',
    name: 'Sprint 5 sonu',
    createdBy: 'pm-1',
    createdAt: '2026-01-10T10:00:00.000Z',
    items: [
      {
        id: 'i-req',
        entityType: 'requirement',
        entityId: 'r-1',
        data: {
          text_id: 'REQ-USR-001',
          title: 'Örnek gereksinim',
          type: 'User Requirement',
          status: 'In Review',
          attributes: { priority: 'High', risk_score: 7 },
        },
      },
      {
        id: 'i-def-priority',
        entityType: 'attributeDef',
        entityId: 'def-priority',
        data: {
          id: 'def-priority',
          entityType: 'both',
          key: 'priority',
          label: 'Priority',
          dataType: 'select',
          order: 0,
        },
      },
      {
        id: 'i-def-risk',
        entityType: 'attributeDef',
        entityId: 'def-risk',
        data: {
          id: 'def-risk',
          entityType: 'requirement',
          key: 'risk_score',
          label: 'Risk Skoru',
          dataType: 'number',
          order: 1,
        },
      },
      {
        id: 'i-nav',
        entityType: 'navLayout',
        entityId: 'p-1',
        data: {
          groups: [
            {
              id: 'g-1',
              name: 'Gereksinimler',
              nameKey: null,
              order: 0,
              items: [
                {
                  id: 'ni-1',
                  pageKey: 'req-user',
                  label: null,
                  fieldFilter: null,
                  typeFilter: null,
                  order: 0,
                },
              ],
            },
          ],
          ungrouped: [],
          materialized: true,
        },
      },
    ],
  }

  const openDetail = async () => {
    snapshotsMock.value = [
      {
        id: 'snap-1',
        name: 'Sprint 5 sonu',
        createdBy: 'pm-1',
        createdAt: '2026-01-10T10:00:00.000Z',
        items: [],
      },
    ]
    getSnapshot.mockResolvedValue(SNAPSHOT_DETAIL)
    const SnapshotsPage = (await import('../Snapshots.jsx')).default
    render(
      <Wrap>
        <SnapshotsPage />
      </Wrap>,
    )
    fireEvent.click(screen.getByTitle('Görüntüle'))
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledWith('p-1', 'snap-1'))
    await screen.findByText('REQ-USR-001')
  }

  it('özel (custom) öznitelik için dinamik sütun gösterir (Priority/DAL ile sabitlenmemiş)', async () => {
    await openDetail()
    expect(screen.getByText('Risk Skoru')).toBeInTheDocument()
    const row = screen.getByText('REQ-USR-001').closest('tr')
    expect(within(row).getByText('7')).toBeInTheDocument()
  })

  it('Gereksinimler sekmesi tek büyük havuz yerine yakalanan menü sayfasına göre bölünür', async () => {
    await openDetail()
    // Requirements sekmesi varsayılan aktif; tek düz tablo yerine sayfa
    // başlığıyla ayrılmış bir bölüm görünmeli.
    // REQ_PAGES['req-user'].navLabel (frontend/src/utils/constants.js) — birebir
    // (projedeki mevcut yazımıyla, Türkçe noktalı ı olmadan).
    const pageHeading = screen.getByText('Kullanici Gereksinimleri')
    expect(pageHeading).toBeInTheDocument()
    // Gereksinim satırı hâlâ görünür, ve o bölümün altında yer alır.
    const row = screen.getByText('REQ-USR-001').closest('tr')
    expect(row).toBeInTheDocument()
    const section = pageHeading.closest('.card')
    expect(within(section).getByText('REQ-USR-001')).toBeInTheDocument()
  })

  it('"Hiçbir menü sayfasına ait değil" bölümü, hiçbir sayfa filtresine uymayan kayıtları gösterir', async () => {
    // İkinci bir gereksinim: hiçbir yakalanan sayfanın tipiyle eşleşmiyor
    // (System Requirement, ama navLayout'ta yalnızca req-user sayfası var).
    const detail = {
      ...SNAPSHOT_DETAIL,
      items: [
        ...SNAPSHOT_DETAIL.items,
        {
          id: 'i-req-2',
          entityType: 'requirement',
          entityId: 'r-2',
          data: {
            text_id: 'REQ-SYS-001',
            title: 'Sayfası olmayan gereksinim',
            type: 'System Requirement',
            status: 'In Review',
            attributes: {},
          },
        },
      ],
    }
    snapshotsMock.value = [
      {
        id: 'snap-1',
        name: 'Sprint 5 sonu',
        createdBy: 'pm-1',
        createdAt: '2026-01-10T10:00:00.000Z',
        items: [],
      },
    ]
    getSnapshot.mockResolvedValue(detail)
    const SnapshotsPage = (await import('../Snapshots.jsx')).default
    render(
      <Wrap>
        <SnapshotsPage />
      </Wrap>,
    )
    fireEvent.click(screen.getByTitle('Görüntüle'))
    await screen.findByText('REQ-USR-001')

    expect(screen.getByText('Hiçbir menü sayfasına ait değil')).toBeInTheDocument()
    const unassignedSection = screen.getByText('Hiçbir menü sayfasına ait değil').closest('.card')
    expect(within(unassignedSection).getByText('REQ-SYS-001')).toBeInTheDocument()
  })
})
