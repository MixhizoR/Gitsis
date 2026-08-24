// ============================================================================
//  Badge.test.jsx — RTL kurulumunu dogrulayan smoke + temel davranis testi.
// ============================================================================
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { StatusBadge, CategoryBadge } from '../Badge.jsx'

describe('Badge bilesenleri', () => {
  it('StatusBadge degerini render eder', () => {
    render(<StatusBadge value="Approved" />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('CategoryBadge bos deger icin hicbir sey render etmez', () => {
    const { container } = render(<CategoryBadge value="" />)
    expect(container).toBeEmptyDOMElement()
  })
})
