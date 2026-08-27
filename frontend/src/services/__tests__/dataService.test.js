// ============================================================================
//  dataService.test.js — getImpact helper regresyon testi (Issue #46).
//  Frontend tarafinda etki analizi backend'den cekilir; helper dogru
//  endpoint'i ve parametreyi cagiriyor mu?
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../apiClient.js', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

import * as api from '../apiClient.js'
import { getImpact } from '../dataService.js'

describe('getImpact (Issue #46)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({
      root: {},
      parents: [],
      tests: [],
      summary: { testCount: 0, parentCount: 0, documentCount: 0 },
    })
  })

  it('backend etki agacini dogru URL ve reqId ile ceker', async () => {
    const pid = 'p-1'
    const reqId = 'r-99'
    await getImpact(pid, reqId)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith(`/projects/${pid}/impact`, { reqId })
  })
})
