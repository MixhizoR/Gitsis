// ============================================================================
//  Sidebar.test.jsx — Menu gruplari (Issue #9 / Adim 6).
//  Kapsam: gruplar ve altlarindaki sayfalar render ediliyor, grup ac/kapa
//  calisiyor, grupsuz sayfa gorunuyor, "Menuyu duzenle" yalnizca PM'e acik.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'

const { navMock, authMock, actions } = vi.hoisted(() => ({
  navMock: { value: null },
  authMock: { isPM: true },
  actions: {
    addNavItem: vi.fn().mockResolvedValue({}),
    materializeNav: vi.fn(),
  },
}))

vi.mock('../../../context/AppContext.jsx', () => ({
  useApp: () => ({ nav: navMock.value, ...actions }),
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
    vi.clearAllMocks()
    actions.addNavItem.mockResolvedValue({})
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

  it('grubun yanindaki "+" ile Menuyu duzenle acmadan sayfa eklenir (materialize edilmis grup)', async () => {
    navMock.value = {
      materialized: true,
      groups: [
        {
          id: 'g-test',
          name: 'Testler',
          nameKey: null,
          order: 0,
          items: [{ pageKey: 'test-acceptance' }],
        },
      ],
      ungrouped: [],
    }
    renderSidebar()

    fireEvent.click(screen.getByTestId('nav-group-quickadd-Testler'))
    expect(await screen.findByTestId('nav-quickadd-form')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('nav-quickadd-submit'))

    await waitFor(() => expect(actions.addNavItem).toHaveBeenCalledTimes(1))
    expect(actions.addNavItem).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'g-test', pageKey: 'req-user' }),
    )
    expect(actions.materializeNav).not.toHaveBeenCalled()
  })

  it('grubun yanindaki "+" varsayilan (id\'siz) grup icin once materialize eder', async () => {
    actions.materializeNav.mockResolvedValue({
      groups: [{ id: 'g-req-real', name: 'Gereksinimler', nameKey: null, order: 0, items: [] }],
    })
    renderSidebar()

    fireEvent.click(screen.getByTestId('nav-group-quickadd-Gereksinimler'))
    fireEvent.click(await screen.findByTestId('nav-quickadd-submit'))

    await waitFor(() => expect(actions.addNavItem).toHaveBeenCalledTimes(1))
    expect(actions.materializeNav).toHaveBeenCalledTimes(1)
    expect(actions.addNavItem).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'g-req-real' }),
    )
  })

  it('"+" yalnizca PM icin gorunur', () => {
    authMock.isPM = false
    renderSidebar()
    expect(screen.queryByTestId('nav-group-quickadd-Testler')).not.toBeInTheDocument()
  })

  it('hizli eklemede "req-subsystem" secilince Tip filtresi (Software/Hardware) cikar', async () => {
    navMock.value = {
      materialized: true,
      groups: [{ id: 'g-test', name: 'Testler', nameKey: null, order: 0, items: [] }],
      ungrouped: [],
    }
    renderSidebar()

    fireEvent.click(screen.getByTestId('nav-group-quickadd-Testler'))
    // Varsayilan tip (req-user) icin tip filtresi yok.
    expect(screen.queryByTestId('nav-quickadd-typefilter')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('nav-quickadd-type'), {
      target: { value: 'req-subsystem' },
    })
    const typeFilterSelect = await screen.findByTestId('nav-quickadd-typefilter')
    fireEvent.change(typeFilterSelect, { target: { value: 'Software Requirement' } })
    fireEvent.click(screen.getByTestId('nav-quickadd-submit'))

    await waitFor(() => expect(actions.addNavItem).toHaveBeenCalledTimes(1))
    expect(actions.addNavItem).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'g-test',
        pageKey: 'req-subsystem',
        typeFilter: 'Software Requirement',
      }),
    )
  })

  // "Bana Atananlar" personelin kendi is kuyrugudur; PM'in personel kimligi
  // olmadigi icin ona atanmis is de olamaz — menude gosterilmez.
  it('"Bana Atananlar" yalnizca personel oturumunda gorunur', () => {
    navMock.value = defaultNav
    authMock.isPM = false
    renderSidebar()
    expect(screen.getByRole('button', { name: /Bana Atananlar/i })).toBeInTheDocument()

    cleanup()
    authMock.isPM = true
    renderSidebar()
    expect(screen.queryByRole('button', { name: /Bana Atananlar/i })).not.toBeInTheDocument()
  })
})
