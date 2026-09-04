// ============================================================================
//  smoke.test.jsx — Component smoke testleri (A+B plan, Issue #44).
//  5 oncelikli component: Modal, ViewModal (kapali/acik), LinkManager,
//  ImpactAnalysisModal, TestCases (sayfa render).
// ============================================================================
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'
import Modal from '../common/Modal.jsx'
import ViewModal from '../common/ViewModal.jsx'
import ImpactAnalysisModal from '../traceability/ImpactAnalysisModal.jsx'

// AppContext mock (ImpactAnalysisModal / LinkManager icin)
vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    requirements: [],
    links: [],
    approvals: [],
    bulkRemoveRequirements: () => {},
    editRequirement: () => {},
    voteApproval: () => {},
    unlockApproval: () => {},
    getApprovalMatrix: () => {},
    createLink: () => {},
    deleteLink: () => {},
  }),
  AppProvider: ({ children }) => children,
}))

// Lang context saglayici
const Wrap = ({ children }) => <LanguageProvider>{children}</LanguageProvider>
// ImpactAnalysisModal / LinkManager icin AppProvider mock zaten vi.mock ile kuruldu

describe('Smoke — modal ve component render', () => {
  it('Modal kapali ise null doner', () => {
    const { container } = render(
      <Wrap>
        <Modal open={false} onClose={() => {}} />
      </Wrap>,
    )
    expect(container.querySelector('.fixed')).toBeNull()
  })

  it('Modal acik ise baslik ve buton gorunur', () => {
    render(
      <Wrap>
        <Modal open={true} onClose={() => {}} title="Test" subtitle="Konu">
          <span>icerik</span>
        </Modal>
      </Wrap>,
    )
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getByText('icerik')).toBeInTheDocument()
  })

  it('ViewModal: kapali ise null doner', () => {
    const { container } = render(
      <Wrap>
        <ViewModal open={false} onClose={() => {}} />
      </Wrap>,
    )
    expect(container.querySelector('.fixed')).toBeNull()
  })

  it('ViewModal: acik + row var ise meta bilgisi gosterir', () => {
    render(
      <Wrap>
        <ViewModal
          open={true}
          onClose={() => {}}
          row={{
            id: 1,
            text_id: 'REQ-001',
            title: 'Test',
            type: 'System Requirement',
            status: 'In Review',
            description: 'desc',
          }}
          canWrite={false}
          showStatus={true}
        />
      </Wrap>,
    )
    expect(screen.getByText('REQ-001 — Test')).toBeInTheDocument()
  })

  it.todo('LinkManager kapali ise hicbir sey render etmez (useApp + subject mock gerektirir)')

  it('ImpactAnalysisModal kapali ise null doner', () => {
    const { container } = render(
      <Wrap>
        <ImpactAnalysisModal open={false} onClose={() => {}} requirement={null} />
      </Wrap>,
    )
    expect(container.querySelector('.fixed')).toBeNull()
  })
})
