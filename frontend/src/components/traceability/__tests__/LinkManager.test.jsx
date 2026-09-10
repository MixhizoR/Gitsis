// ============================================================================
//  LinkManager.test.jsx — Satisfies bağı HER İKİ yönden kurulabilir, System
//  seviyesi atlanarak (skip-level) doğrudan User<->Sub-system bağlanabilir,
//  ve birden fazla hedef tipi mümkünse önce TİP (gerekirse Sub-system'in
//  Software/Hardware alt tipi) seçilir, sonra hedef kaydı seçilir — kullanıcı
//  talebi: "yukarı bağlarken önce User mı System mi, aşağı bağlarken önce
//  System mi Sub-system mi (ve hangi sub-system) diye sorulsun."
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../../context/LanguageContext.jsx'

const link = vi.fn()
const unlink = vi.fn()

const USER_REQ = {
  id: 'r-user-1',
  text_id: 'REQ-USR-001',
  title: 'Kullanıcı gereksinimi',
  type: 'User Requirement',
}
const SYS_REQ = {
  id: 'r-sys-1',
  text_id: 'REQ-SYS-001',
  title: 'Sistem gereksinimi',
  type: 'System Requirement',
}
const SYS_REQ_2 = {
  id: 'r-sys-2',
  text_id: 'REQ-SYS-002',
  title: 'Sistem gereksinimi 2',
  type: 'System Requirement',
}
const SW_REQ = {
  id: 'r-sw-1',
  text_id: 'REQ-SW-001',
  title: 'Yazılım gereksinimi',
  type: 'Software Requirement',
}
const HW_REQ = {
  id: 'r-hw-1',
  text_id: 'REQ-HW-001',
  title: 'Donanım gereksinimi',
  type: 'Hardware Requirement',
}

// requirements/links'i her testte kendi ihtiyacına göre ayarlayabilmek için
// mutable bir kutu içinde tutuyoruz (module-level vi.mock closure'ı erken
// bağlanır, bu yüzden doğrudan değişken yerine kutu kullanılır).
const appState = { requirements: [], testCases: [], glossary: [], links: [] }

vi.mock('../../../context/AppContext.jsx', () => ({
  useApp: () => ({
    requirements: appState.requirements,
    testCases: appState.testCases,
    glossary: appState.glossary,
    links: appState.links,
    link,
    unlink,
  }),
  AppProvider: ({ children }) => children,
}))

const Wrap = ({ children }) => <LanguageProvider>{children}</LanguageProvider>

const renderSubject = async (subject) => {
  const LinkManager = (await import('../LinkManager.jsx')).default
  render(
    <Wrap>
      <LinkManager open subject={subject} subjectKind="requirement" onClose={() => {}} />
    </Wrap>,
  )
}

const optionTextsOf = (select) => Array.from(select.options).map((o) => o.textContent)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LinkManager — Satisfies: yukarı + aşağı başlatma, kademeli tip seçimi, skip-level', () => {
  it('User Requirement subject: yukarı (satisfies-up) paneli YOK, çünkü User tepe seviyedir', async () => {
    appState.requirements = [USER_REQ, SYS_REQ]
    appState.links = []
    await renderSubject(USER_REQ)
    expect(screen.queryByTestId('link-option-satisfies-up')).not.toBeInTheDocument()
  })

  it('User Requirement subject: aşağı panelde önce TİP sorulur (System / Sub-system), hedef alanı tip seçilene kadar boş/pasif kalır', async () => {
    appState.requirements = [USER_REQ, SYS_REQ, SW_REQ, HW_REQ]
    appState.links = []
    await renderSubject(USER_REQ)
    const downPanel = screen.getByTestId('link-option-satisfies-down')

    const typeSelect = within(downPanel).getByTestId('link-type-select')
    const typeTexts = optionTextsOf(typeSelect)
    expect(typeTexts).toContain('System Requirement')
    expect(typeTexts).toContain('Sub-system Requirement')

    // Alt tip (Software/Hardware) sorusu henüz görünmemeli (üst tip seçilmedi).
    expect(within(downPanel).queryByTestId('link-subtype-select')).not.toBeInTheDocument()
    // Hedef select pasif, çünkü henüz bir tip çözülmedi.
    expect(within(downPanel).getByTestId('link-target-select')).toBeDisabled()
  })

  it('User Requirement subject: aşağıda "Sub-system Requirement" seçilince Software/Hardware sorusu çıkar; Software seçip bağlamak fromId=User, toId=Software gönderir (skip-level)', async () => {
    appState.requirements = [USER_REQ, SYS_REQ, SW_REQ, HW_REQ]
    appState.links = []
    await renderSubject(USER_REQ)
    const downPanel = screen.getByTestId('link-option-satisfies-down')

    fireEvent.change(within(downPanel).getByTestId('link-type-select'), {
      target: { value: 'subsystem' },
    })

    const subTypeSelect = within(downPanel).getByTestId('link-subtype-select')
    expect(optionTextsOf(subTypeSelect)).toEqual(
      expect.arrayContaining(['Software Requirement', 'Hardware Requirement']),
    )
    fireEvent.change(subTypeSelect, { target: { value: 'Software Requirement' } })

    const targetSelect = within(downPanel).getByTestId('link-target-select')
    expect(targetSelect).not.toBeDisabled()
    const targetTexts = optionTextsOf(targetSelect)
    expect(targetTexts.some((txt) => txt.includes('REQ-SW-001'))).toBe(true)
    expect(targetTexts.some((txt) => txt.includes('REQ-HW-001'))).toBe(false) // Hardware degil, sadece Software

    fireEvent.change(targetSelect, { target: { value: SW_REQ.id } })
    fireEvent.click(within(downPanel).getByText('Bağla'))

    expect(link).toHaveBeenCalledWith({ fromId: USER_REQ.id, toId: SW_REQ.id, type: 'Satisfies' })
  })

  it('User Requirement subject: aşağıda "System Requirement" tipi doğrudan hedef listesini System kayıtlarıyla doldurur (alt tip sorusu çıkmaz)', async () => {
    appState.requirements = [USER_REQ, SYS_REQ, SW_REQ]
    appState.links = []
    await renderSubject(USER_REQ)
    const downPanel = screen.getByTestId('link-option-satisfies-down')

    fireEvent.change(within(downPanel).getByTestId('link-type-select'), {
      target: { value: 'System Requirement' },
    })

    expect(within(downPanel).queryByTestId('link-subtype-select')).not.toBeInTheDocument()
    const targetSelect = within(downPanel).getByTestId('link-target-select')
    const targetTexts = optionTextsOf(targetSelect)
    expect(targetTexts.some((txt) => txt.includes('REQ-SYS-001'))).toBe(true)
    expect(targetTexts.some((txt) => txt.includes('REQ-SW-001'))).toBe(false)
  })

  it('Software Requirement subject: yukarı panelde önce TİP sorulur (System / User); User seçip bağlamak fromId=User, toId=Software gönderir', async () => {
    appState.requirements = [USER_REQ, SYS_REQ, SW_REQ]
    appState.links = []
    await renderSubject(SW_REQ)
    const upPanel = screen.getByTestId('link-option-satisfies-up')

    const typeSelect = within(upPanel).getByTestId('link-type-select')
    expect(optionTextsOf(typeSelect)).toEqual(
      expect.arrayContaining(['System Requirement', 'User Requirement']),
    )
    // Software/Hardware kendisi Sub-system grubuna GİRMEZ (o, ust tip degil, subject'in kendi tipi).
    expect(within(upPanel).queryByText('Sub-system Requirement')).not.toBeInTheDocument()

    fireEvent.change(typeSelect, { target: { value: 'User Requirement' } })
    const targetSelect = within(upPanel).getByTestId('link-target-select')
    fireEvent.change(targetSelect, { target: { value: USER_REQ.id } })
    fireEvent.click(within(upPanel).getByText('Bağla'))

    expect(link).toHaveBeenCalledWith({ fromId: USER_REQ.id, toId: SW_REQ.id, type: 'Satisfies' })
  })

  it('System Requirement subject: yukarı panelde tip sorusu YOK (tek seçenek: User) ama aşağı panelde Software/Hardware sorusu doğrudan çıkar (tek üst grup otomatik atlanır)', async () => {
    appState.requirements = [USER_REQ, SYS_REQ, SW_REQ, HW_REQ]
    appState.links = []
    await renderSubject(SYS_REQ)

    const upPanel = screen.getByTestId('link-option-satisfies-up')
    expect(within(upPanel).queryByTestId('link-type-select')).not.toBeInTheDocument()
    expect(within(upPanel).getByTestId('link-target-select')).not.toBeDisabled()

    const downPanel = screen.getByTestId('link-option-satisfies-down')
    // Tek ust secenek ("Sub-system Requirement") otomatik atlanir; dogrudan alt tip sorulur.
    expect(within(downPanel).queryByTestId('link-type-select')).not.toBeInTheDocument()
    expect(within(downPanel).getByTestId('link-subtype-select')).toBeInTheDocument()
  })

  it('zaten bağlı olan gereksinim aday listesinden çıkarılır (aynı bağ tekrar önerilmez)', async () => {
    appState.requirements = [USER_REQ, SYS_REQ, SYS_REQ_2]
    appState.links = [{ id: 'l1', fromId: USER_REQ.id, toId: SYS_REQ.id, type: 'Satisfies' }]
    await renderSubject(USER_REQ)
    const downPanel = screen.getByTestId('link-option-satisfies-down')
    fireEvent.change(within(downPanel).getByTestId('link-type-select'), {
      target: { value: 'System Requirement' },
    })
    const targetTexts = optionTextsOf(within(downPanel).getByTestId('link-target-select'))
    expect(targetTexts.some((txt) => txt.includes('REQ-SYS-001'))).toBe(false)
    expect(targetTexts.some((txt) => txt.includes('REQ-SYS-002'))).toBe(true)
  })
})
