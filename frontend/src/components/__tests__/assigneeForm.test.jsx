// ============================================================================
//  assigneeForm.test.jsx — Gereksinim ve test formlarindaki "Atanan Kişi"
//  alani. Sozlukteki "Assigned To" izlenebilirlik BAGI ile ilgisi yoktur.
//
//  Kapsam:
//   - Dropdown proje personelinden beslenir ("Ad Soyad")
//   - Secim payload'a assigneeId olarak gider
//   - Duzenlemede mevcut atama secili gelir; "(atanmamış)" secilince
//     bos dize gonderilir (backend bunu null'a cevirip atamayi kaldirir)
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const { addRequirement, editRequirement, addTestCase, editTestCase, appMock } = vi.hoisted(() => ({
  addRequirement: vi.fn(),
  editRequirement: vi.fn(),
  addTestCase: vi.fn(),
  editTestCase: vi.fn(),
  appMock: { personnel: [] },
}))

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    addRequirement,
    editRequirement,
    addTestCase,
    editTestCase,
    addField: vi.fn(),
    fields: [],
    attributeDefs: [],
    personnel: appMock.personnel,
  }),
  AppProvider: ({ children }) => children,
}))

import RequirementForm from '../requirements/RequirementForm.jsx'
import TestForm from '../tests/TestForm.jsx'

const REQ_CONFIG = {
  key: 'req-user',
  lockedType: 'User Requirement',
  typeOptions: ['User Requirement'],
  addLabel: 'Gereksinim Ekle',
}
const TEST_CONFIG = { key: 'test-acceptance', lockedType: 'Acceptance Test', addLabel: 'Test Ekle' }

const renderReq = (props = {}) =>
  render(
    <LanguageProvider>
      <RequirementForm open onClose={vi.fn()} editing={null} pageConfig={REQ_CONFIG} {...props} />
    </LanguageProvider>,
  )

const renderTest = (props = {}) =>
  render(
    <LanguageProvider>
      <TestForm open onClose={vi.fn()} editing={null} pageConfig={TEST_CONFIG} {...props} />
    </LanguageProvider>,
  )

describe('Formlarda "Atanan Kişi" secimi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appMock.personnel = [
      { id: 'p1', firstName: 'Ayse', lastName: 'Demir' },
      { id: 'p2', firstName: 'Mehmet', lastName: 'Kaya' },
    ]
  })

  afterEach(() => cleanup())

  it('gereksinim formunda dropdown personelden beslenir', () => {
    renderReq()
    const select = screen.getByTestId('form-assignee')
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels).toContain('Ayse Demir')
    expect(labels).toContain('Mehmet Kaya')
  })

  it('gereksinim olustururken secilen kisi assigneeId olarak gonderilir', async () => {
    renderReq()
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: 'p2' } })
    fireEvent.change(screen.getByPlaceholderText('Kısa başlık'), {
      target: { value: 'Yeni gereksinim' },
    })
    fireEvent.submit(document.getElementById('req-form'))

    await waitFor(() => expect(addRequirement).toHaveBeenCalled())
    expect(addRequirement.mock.calls[0][0]).toMatchObject({ assigneeId: 'p2' })
  })

  it('duzenlemede mevcut atama secili gelir ve kaldirilabilir', async () => {
    renderReq({
      editing: {
        id: 'r-1',
        text_id: 'EH-USR-001',
        title: 'Var olan',
        type: 'User Requirement',
        assigneeId: 'p1',
        attributes: {},
      },
    })
    expect(screen.getByTestId('form-assignee')).toHaveValue('p1')

    // "(atanmamış)" -> bos dize; backend bunu null'a cevirip atamayi kaldirir.
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: '' } })
    fireEvent.submit(document.getElementById('req-form'))

    await waitFor(() => expect(editRequirement).toHaveBeenCalled())
    expect(editRequirement.mock.calls[0][1]).toMatchObject({ assigneeId: '' })
  })

  it('test formunda da atama secilir ve payload ile gider', async () => {
    renderTest()
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByPlaceholderText('Kısa test başlığı'), {
      target: { value: 'Yeni test' },
    })
    fireEvent.submit(document.getElementById('test-form'))

    await waitFor(() => expect(addTestCase).toHaveBeenCalled())
    expect(addTestCase.mock.calls[0][0]).toMatchObject({ assigneeId: 'p1' })
  })

  it('projede personel yoksa yalnizca "(atanmamış)" secenegi kalir', () => {
    appMock.personnel = []
    renderReq()
    expect([...screen.getByTestId('form-assignee').options]).toHaveLength(1)
  })
})
