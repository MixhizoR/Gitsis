// ============================================================================
//  assigneeForm.test.jsx — Gereksinim ve test formlarindaki "Atanan Kişiler"
//  alani (AssigneePicker). Sozlukteki "Assigned To" izlenebilirlik BAGI ile
//  ilgisi yoktur.
//
//  Atama COKLUDUR: bir kayda birden fazla kisi atanabilir ve SIRA anlamlidir
//  (ilk kisi birincil sorumlu; backend legacy `assigneeId` kolonunu ona
//  esitler — bkz. backend/src/assignees.js).
//
//  Kapsam:
//   - Ekleme kutusu proje personelinden beslenir ("Ad Soyad")
//   - Secilenler payload'a SIRALI assigneeIds dizisi olarak gider
//   - Zaten atanmis kisi ekleme kutusunda tekrar gorunmez
//   - Duzenlemede mevcut atamalar rozet olarak gelir, tek tek kaldirilabilir
//   - Bos liste gonderimi atamalari kaldirir
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

  it('gereksinim formunda ekleme kutusu personelden beslenir', () => {
    renderReq()
    const select = screen.getByTestId('form-assignee')
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels).toContain('Ayse Demir')
    expect(labels).toContain('Mehmet Kaya')
  })

  it('gereksinim olustururken secilen kisiler SIRALI assigneeIds olarak gonderilir', async () => {
    renderReq()
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: 'p2' } })
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByPlaceholderText('Kısa başlık'), {
      target: { value: 'Yeni gereksinim' },
    })
    fireEvent.submit(document.getElementById('req-form'))

    await waitFor(() => expect(addRequirement).toHaveBeenCalled())
    expect(addRequirement.mock.calls[0][0].assigneeIds).toEqual(['p2', 'p1'])
  })

  it('zaten atanmis kisi ekleme kutusunda tekrar gorunmez', () => {
    renderReq()
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: 'p1' } })
    const values = [...screen.getByTestId('form-assignee').options].map((o) => o.value)
    expect(values).not.toContain('p1')
    expect(values).toContain('p2')
  })

  it('atananin sirasi yukari tasinabilir', async () => {
    renderReq()
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: 'p2' } })
    // p2 ikinci sirada; bir yukari alinca birincil sorumlu olur.
    fireEvent.click(screen.getAllByLabelText('Sırada yukarı taşı')[0])
    fireEvent.change(screen.getByPlaceholderText('Kısa başlık'), { target: { value: 'Sirali' } })
    fireEvent.submit(document.getElementById('req-form'))

    await waitFor(() => expect(addRequirement).toHaveBeenCalled())
    expect(addRequirement.mock.calls[0][0].assigneeIds).toEqual(['p2', 'p1'])
  })

  it('duzenlemede mevcut atamalar gelir ve tek tek kaldirilabilir', async () => {
    renderReq({
      editing: {
        id: 'r-1',
        text_id: 'EH-USR-001',
        title: 'Var olan',
        type: 'User Requirement',
        assigneeIds: ['p1', 'p2'],
        assigneeId: 'p1',
        attributes: {},
      },
    })
    expect(screen.getByTestId('assignee-chip-p1')).toHaveTextContent('Ayse Demir')
    expect(screen.getByTestId('assignee-chip-p2')).toHaveTextContent('Mehmet Kaya')

    fireEvent.click(screen.getByTestId('assignee-remove-p1'))
    fireEvent.submit(document.getElementById('req-form'))

    await waitFor(() => expect(editRequirement).toHaveBeenCalled())
    expect(editRequirement.mock.calls[0][1].assigneeIds).toEqual(['p2'])
  })

  it('tum atamalar kaldirilinca bos liste gonderilir', async () => {
    renderReq({
      editing: {
        id: 'r-1',
        text_id: 'EH-USR-001',
        title: 'Var olan',
        type: 'User Requirement',
        assigneeIds: ['p1'],
        attributes: {},
      },
    })
    fireEvent.click(screen.getByTestId('assignee-remove-p1'))
    fireEvent.submit(document.getElementById('req-form'))

    await waitFor(() => expect(editRequirement).toHaveBeenCalled())
    expect(editRequirement.mock.calls[0][1].assigneeIds).toEqual([])
  })

  it('eski tek-atama alani (assigneeId) duzenlemede hala okunur', () => {
    renderReq({
      editing: {
        id: 'r-1',
        text_id: 'EH-USR-001',
        title: 'Var olan',
        type: 'User Requirement',
        assigneeId: 'p2',
        attributes: {},
      },
    })
    expect(screen.getByTestId('assignee-chip-p2')).toHaveTextContent('Mehmet Kaya')
  })

  it('test formunda da coklu atama secilir ve payload ile gider', async () => {
    renderTest()
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByTestId('form-assignee'), { target: { value: 'p2' } })
    fireEvent.change(screen.getByPlaceholderText('Kısa test başlığı'), {
      target: { value: 'Yeni test' },
    })
    fireEvent.submit(document.getElementById('test-form'))

    await waitFor(() => expect(addTestCase).toHaveBeenCalled())
    expect(addTestCase.mock.calls[0][0].assigneeIds).toEqual(['p1', 'p2'])
  })

  it('projede personel yoksa yalnizca "(atanmamış)" secenegi kalir', () => {
    appMock.personnel = []
    renderReq()
    expect([...screen.getByTestId('form-assignee').options]).toHaveLength(1)
  })
})
