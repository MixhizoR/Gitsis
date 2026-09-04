// ============================================================================
//  NavManager.test.jsx — Menu duzeni yonetimi (Issue #9 / Adim 6).
//
//  ONEMLI: Yeniden adlandirma ve silme SATIR ICI yapilir; window.prompt() /
//  window.confirm() KULLANILMAZ. Gomulu tarayicilarda prompt() "not supported"
//  hatasi firlatir, confirm() ise sessizce false doner — bu testler her iki
//  islemin de o tuzaga geri dusmedigini garanti eder.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'

const { navMock, actions } = vi.hoisted(() => ({
  navMock: { value: null },
  actions: {
    materializeNav: vi.fn(),
    addNavGroup: vi.fn(),
    renameNavGroup: vi.fn(),
    removeNavGroup: vi.fn(),
    assignNavItem: vi.fn(),
  },
}))

vi.mock('../../../context/AppContext.jsx', () => ({
  useApp: () => ({ nav: navMock.value, ...actions }),
  AppProvider: ({ children }) => children,
}))

import NavManager from '../NavManager.jsx'

const materializedNav = {
  materialized: true,
  groups: [
    {
      id: 'g-req',
      name: 'Gereksinimler',
      nameKey: null,
      order: 0,
      items: [{ pageKey: 'req-user' }, { pageKey: 'req-system' }, { pageKey: 'req-subsystem' }],
    },
    {
      id: 'g-test',
      name: 'Testler',
      nameKey: null,
      order: 1,
      items: [{ pageKey: 'test-acceptance' }],
    },
  ],
  ungrouped: [{ pageKey: 'glossary' }],
}

const renderMgr = () =>
  render(
    <LanguageProvider>
      <NavManager open={true} onClose={() => {}} />
    </LanguageProvider>,
  )

describe('NavManager — grup yeniden adlandirma / silme', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navMock.value = materializedNav
  })

  afterEach(() => {
    cleanup()
  })

  it('kalem dugmesi SATIR ICI input acar (window.prompt kullanmaz)', async () => {
    // prompt cagrilirsa test patlasin: gercek tarayicilarda da hata firlatiyor.
    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => {
      throw new Error('prompt() is not supported.')
    })
    renderMgr()

    fireEvent.click(screen.getByRole('button', { name: /Gereksinimler Yeniden adlandır/i }))

    expect(await screen.findByTestId('nav-group-rename-input')).toHaveValue('Gereksinimler')
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('yeni ad girilip kaydedilince renameNavGroup cagrilir', async () => {
    renderMgr()
    fireEvent.click(screen.getByRole('button', { name: /Gereksinimler Yeniden adlandır/i }))

    const input = await screen.findByTestId('nav-group-rename-input')
    fireEvent.change(input, { target: { value: 'Sistem Gereksinim Grubu' } })
    fireEvent.click(screen.getByRole('button', { name: /^Kaydet$/i }))

    await waitFor(() => expect(actions.renameNavGroup).toHaveBeenCalledTimes(1))
    expect(actions.renameNavGroup).toHaveBeenCalledWith('g-req', 'Sistem Gereksinim Grubu')
  })

  it('Enter tusu ile de kaydedilir, Escape ile vazgecilir', async () => {
    renderMgr()
    fireEvent.click(screen.getByRole('button', { name: /Testler Yeniden adlandır/i }))
    const input = await screen.findByTestId('nav-group-rename-input')

    fireEvent.change(input, { target: { value: 'Dogrulama' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(actions.renameNavGroup).toHaveBeenCalledWith('g-test', 'Dogrulama'))

    cleanup()
    vi.clearAllMocks()
    renderMgr()
    fireEvent.click(screen.getByRole('button', { name: /Testler Yeniden adlandır/i }))
    const input2 = await screen.findByTestId('nav-group-rename-input')
    fireEvent.keyDown(input2, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByTestId('nav-group-rename-input')).not.toBeInTheDocument(),
    )
    expect(actions.renameNavGroup).not.toHaveBeenCalled()
  })

  it('ayni ad girilirse API cagrilmaz', async () => {
    renderMgr()
    fireEvent.click(screen.getByRole('button', { name: /Gereksinimler Yeniden adlandır/i }))
    const input = await screen.findByTestId('nav-group-rename-input')
    fireEvent.click(screen.getByRole('button', { name: /^Kaydet$/i }))

    await waitFor(() =>
      expect(screen.queryByTestId('nav-group-rename-input')).not.toBeInTheDocument(),
    )
    expect(actions.renameNavGroup).not.toHaveBeenCalled()
    expect(input).not.toBeInTheDocument()
  })

  it('cop dugmesi SATIR ICI onay gosterir (window.confirm kullanmaz)', async () => {
    // confirm() gomulu tarayicida her zaman false doner -> silme sessizce
    // calismazdi. Kullanilmadigini garanti et.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderMgr()

    fireEvent.click(screen.getByRole('button', { name: /Gereksinimler Sil/i }))

    expect(await screen.findByTestId('nav-group-delete-confirm')).toBeInTheDocument()
    // Onay metni, ilgili grubun SATIRI icinde gorunmeli (modal ipucu degil).
    const row = screen.getByTestId('nav-group-Gereksinimler')
    expect(within(row).getByText(/grupsuz seviyeye taşınır/i)).toBeInTheDocument()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(actions.removeNavGroup).not.toHaveBeenCalled() // heniz onaylanmadi
  })

  it('silme onaylandiginda removeNavGroup cagrilir', async () => {
    renderMgr()
    fireEvent.click(screen.getByRole('button', { name: /Gereksinimler Sil/i }))
    fireEvent.click(await screen.findByTestId('nav-group-delete-confirm'))

    await waitFor(() => expect(actions.removeNavGroup).toHaveBeenCalledTimes(1))
    expect(actions.removeNavGroup).toHaveBeenCalledWith('g-req')
  })

  it('silme onayindan vazgecilirse API cagrilmaz', async () => {
    renderMgr()
    fireEvent.click(screen.getByRole('button', { name: /Gereksinimler Sil/i }))
    await screen.findByTestId('nav-group-delete-confirm')
    fireEvent.click(screen.getAllByRole('button', { name: /^Vazgeç$/i })[0])

    await waitFor(() =>
      expect(screen.queryByTestId('nav-group-delete-confirm')).not.toBeInTheDocument(),
    )
    expect(actions.removeNavGroup).not.toHaveBeenCalled()
  })

  it('sayfa sayisi gruptaki oge sayisini gosterir', () => {
    renderMgr()
    const reqRow = screen.getByTestId('nav-group-Gereksinimler')
    expect(reqRow).toHaveTextContent('3 sayfa')
    expect(screen.getByTestId('nav-group-Testler')).toHaveTextContent('1 sayfa')
  })
})
