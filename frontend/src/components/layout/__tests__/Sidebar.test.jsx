// ============================================================================
//  Sidebar.test.jsx — Menu gruplari (Issue #9 / Adim 6).
//  Kapsam: gruplar ve altlarindaki sayfalar render ediliyor, grup ac/kapa
//  calisiyor, grupsuz sayfa gorunuyor, "Menuyu duzenle" yalnizca PM'e acik.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'

const { navMock, authMock } = vi.hoisted(() => ({
  navMock: { value: null },
  authMock: { isPM: true },
}))

vi.mock('../../../context/AppContext.jsx', () => ({
  useApp: () => ({ nav: navMock.value }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ isPM: authMock.isPM, can: () => false }),
  AuthProvider: ({ children }) => children,
}))

vi.mock('../../../context/ProjectContext.jsx', () => ({
  useProject: () => ({ activeProject: { name: 'Test Proje' }, closeProject: () => {} }),
  ProjectProvider: ({ children }) => children,
}))

// NavManager modali bu testin konusu degil; hafif bir stub yeterli.
vi.mock('../NavManager.jsx', () => ({ default: () => null }))

import Sidebar from '../Sidebar.jsx'

const defaultNav = {
  materialized: false,
  groups: [
    {
      id: null,
      name: 'Gereksinimler',
      nameKey: 'nav.groupRequirements',
      order: 0,
      items: [{ pageKey: 'req-user' }, { pageKey: 'req-system' }, { pageKey: 'req-subsystem' }],
    },
    {
      id: null,
      name: 'Testler',
      nameKey: 'nav.groupTests',
      order: 1,
      items: [
        { pageKey: 'test-acceptance' },
        { pageKey: 'test-system' },
        { pageKey: 'test-subsystem' },
      ],
    },
  ],
  ungrouped: [{ pageKey: 'glossary' }],
}

const renderSidebar = (active = 'dashboard') =>
  render(
    <LanguageProvider>
      <Sidebar active={active} onNavigate={() => {}} />
    </LanguageProvider>,
  )

describe('Sidebar — menu gruplari', () => {
  beforeEach(() => {
    navMock.value = defaultNav
    authMock.isPM = true
  })

  afterEach(() => {
    cleanup()
  })

  it('varsayilan iki grup ve altlarindaki sayfalar render edilir', () => {
    renderSidebar()
    // Not: ust seviyede de "Gereksinimler" adli bir sayfa var (PBS agaci),
    // o yuzden grup basligi testid ile hedeflenir.
    expect(screen.getByTestId('nav-group-btn-Gereksinimler')).toBeInTheDocument()
    expect(screen.getByTestId('nav-group-btn-Testler')).toBeInTheDocument()
    expect(screen.getByText('Kullanıcı Gereksinimleri')).toBeInTheDocument()
    expect(screen.getByText('Kabul Testleri')).toBeInTheDocument()
  })

  it('Sözlük bagimsiz (grupsuz) oge olarak gorunur', () => {
    renderSidebar()
    expect(screen.getByText('Sözlük')).toBeInTheDocument()
  })

  it('grup basligina tiklayinca alt ogeler gizlenir/gosterilir', () => {
    renderSidebar()
    expect(screen.getByText('Kullanıcı Gereksinimleri')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('nav-group-btn-Gereksinimler'))
    expect(screen.queryByText('Kullanıcı Gereksinimleri')).not.toBeInTheDocument()
    // Testler grubu etkilenmez
    expect(screen.getByText('Kabul Testleri')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('nav-group-btn-Gereksinimler'))
    expect(screen.getByText('Kullanıcı Gereksinimleri')).toBeInTheDocument()
  })

  it('kullanici tanimli grup adi (nameKey yok) duz metin olarak gosterilir', () => {
    navMock.value = {
      materialized: true,
      groups: [
        {
          id: 'g-1',
          name: 'Ozel Grubum',
          nameKey: null,
          order: 0,
          items: [{ pageKey: 'req-user' }],
        },
      ],
      ungrouped: [],
    }
    renderSidebar()
    expect(screen.getByTestId('nav-group-btn-Ozel Grubum')).toBeInTheDocument()
  })

  it('"Menüyü düzenle" yalnizca PM icin gorunur', () => {
    renderSidebar()
    expect(screen.getByText('Menüyü düzenle')).toBeInTheDocument()

    cleanup()
    authMock.isPM = false
    renderSidebar()
    expect(screen.queryByText('Menüyü düzenle')).not.toBeInTheDocument()
  })

  it('nav heniz yuklenmemisse (null) cokmeden render eder', () => {
    navMock.value = null
    renderSidebar()
    expect(screen.getByText('Gösterge Paneli')).toBeInTheDocument()
  })
})
