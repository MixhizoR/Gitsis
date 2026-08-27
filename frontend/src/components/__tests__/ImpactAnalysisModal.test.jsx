// ============================================================================
//  ImpactAnalysisModal.test.jsx — Etki Analizi modal: backend entegrasyonu
//  (Issue #46). Modal acildiginda getImpact API cagrisi yapmali ve gelen
//  agaci render etmeli.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '../../context/LanguageContext.jsx'

const { getImpactMock } = vi.hoisted(() => ({ getImpactMock: vi.fn() }))

vi.mock('../../context/AppContext.jsx', () => ({
  useApp: () => ({
    projectId: 'p-99',
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

vi.mock('../../services/dataService.js', () => ({
  getImpact: getImpactMock,
}))

import ImpactAnalysisModal from '../traceability/ImpactAnalysisModal.jsx'

describe('ImpactAnalysisModal — backend entegrasyonu (Issue #46)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('open + requirement ile acildiginda backend getImpact cagirir', async () => {
    getImpactMock.mockResolvedValue({
      root: { id: 'r-1', text_id: 'REQ-1', title: 'T', type: 'System Requirement' },
      parents: [],
      tests: [],
      documents: [],
      summary: { testCount: 0, parentCount: 0, documentCount: 0 },
    })

    render(
      <LanguageProvider>
        <ImpactAnalysisModal
          open={true}
          onClose={() => {}}
          requirement={{ id: 'r-1', text_id: 'REQ-1', title: 'T', type: 'System Requirement' }}
        />
      </LanguageProvider>,
    )

    await waitFor(() => expect(getImpactMock).toHaveBeenCalledTimes(1))
    expect(getImpactMock).toHaveBeenCalledWith('p-99', 'r-1')
  })
})
