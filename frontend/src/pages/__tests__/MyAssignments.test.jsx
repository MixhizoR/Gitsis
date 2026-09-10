// ============================================================================
//  MyAssignments.test.jsx — "Bana Atananlar" sayfasi.
//
//  Kapsam:
//   - YALNIZCA oturum acan personele atanmis kayitlar listelenir
//     (baskasinin isi ve atanmamis kayitlar gorunmez)
//   - Gereksinimler ve test senaryolari ayri bolumlerde, toplam sayaciyla
//   - PM oturumunda sayfa is listesi yerine aciklama gosterir (PM'in personel
//     kimligi yoktur, dolayisiyla atamasi da olamaz)
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const { appMock, authMock } = vi.hoisted(() => ({
  appMock: { requirements: [], testCases: [], links: [] },
  authMock: { value: { isPM: false, currentUser: { personnelId: 'p1' }, can: () => true } },
}))

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    requirements: appMock.requirements,
    testCases: appMock.testCases,
    links: appMock.links,
    attributeDefs: [],
    personnel: [{ id: 'p1', firstName: 'Ayse', lastName: 'Demir' }],
  }),
  AppProvider: ({ children }) => children,
}))

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => authMock.value,
  AuthProvider: ({ children }) => children,
}))

vi.mock('../../components/common/ViewModal.jsx', () => ({ default: () => null }))

import MyAssignments from '../MyAssignments.jsx'

const renderPage = () =>
  render(
    <LanguageProvider>
      <MyAssignments />
    </LanguageProvider>,
  )

const req = (over = {}) => ({
  id: 'r-1',
  text_id: 'EH-USR-001',
  title: 'Gereksinim',
  description: '',
  type: 'User Requirement',
  field: 'Arayuz / HMI',
  status: 'In Review',
  attributes: {},
  ...over,
})

const tc = (over = {}) => ({
  id: 'tc-1',
  text_id: 'EH-TC-ACC-001',
  title: 'Test',
  description: '',
  type: 'Acceptance Test',
  field: 'Arayuz / HMI',
  status: 'Approved',
  attributes: {},
  ...over,
})

describe('MyAssignments — Bana Atananlar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.value = { isPM: false, currentUser: { personnelId: 'p1' }, can: () => true }
    appMock.links = []
    appMock.requirements = [
      req({ id: 'r-1', text_id: 'EH-USR-001', assigneeId: 'p1' }),
      req({ id: 'r-2', text_id: 'EH-USR-002', assigneeId: 'p2' }), // baskasinin isi
      req({ id: 'r-3', text_id: 'EH-USR-003', assigneeId: null }), // atanmamis
    ]
    appMock.testCases = [
      tc({ id: 'tc-1', text_id: 'EH-TC-ACC-001', assigneeId: 'p1' }),
      tc({ id: 'tc-2', text_id: 'EH-TC-ACC-002', assigneeId: 'p2' }),
    ]
  })

  afterEach(() => cleanup())

  it('yalnizca oturum acan kisiye atanmis kayitlari listeler', () => {
    renderPage()
    expect(screen.getByText('EH-USR-001')).toBeInTheDocument()
    expect(screen.getByText('EH-TC-ACC-001')).toBeInTheDocument()
    expect(screen.queryByText('EH-USR-002')).not.toBeInTheDocument()
    expect(screen.queryByText('EH-USR-003')).not.toBeInTheDocument()
    expect(screen.queryByText('EH-TC-ACC-002')).not.toBeInTheDocument()
  })

  it('toplam sayac gereksinim + test atamalarini birlikte sayar', () => {
    renderPage()
    expect(screen.getByTestId('mywork-total')).toHaveTextContent('2')
  })

  it('hic atama yoksa bilgilendirme gosterir', () => {
    appMock.requirements = []
    appMock.testCases = []
    renderPage()
    expect(screen.getAllByText('Size atanmış kayıt yok.')).toHaveLength(2)
  })

  it('atamalar degisince liste guncellenir', () => {
    appMock.requirements = [req({ id: 'r-9', text_id: 'EH-USR-009', assigneeId: 'p1' })]
    appMock.testCases = []
    renderPage()
    expect(screen.getByText('EH-USR-009')).toBeInTheDocument()
    expect(screen.getByTestId('mywork-total')).toHaveTextContent('1')
  })

  it('PM oturumunda is listesi yerine aciklama gosterilir', () => {
    authMock.value = { isPM: true, currentUser: { id: 'u1' }, can: () => true }
    renderPage()
    expect(screen.queryByText('EH-USR-001')).not.toBeInTheDocument()
    expect(screen.getByText(/personel oturumuna özeldir/i)).toBeInTheDocument()
  })
})
