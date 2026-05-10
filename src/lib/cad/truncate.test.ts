import { describe, it, expect } from 'vitest'
import { truncateToFixed } from './truncate'

describe('truncateToFixed (ADR-0008 第 2 位切り捨て)', () => {
  it('truncates positive values to 2 fraction digits', () => {
    expect(truncateToFixed(1.236, 2)).toBe(1.23)
    expect(truncateToFixed(1.234, 2)).toBe(1.23)
    expect(truncateToFixed(1.239, 2)).toBe(1.23)
  })

  it('does not round (truncate, not banker)', () => {
    expect(truncateToFixed(2.999, 2)).toBe(2.99)
    expect(truncateToFixed(0.005, 2)).toBe(0)
  })

  it('handles zero and integer correctly', () => {
    expect(truncateToFixed(0, 2)).toBe(0)
    expect(truncateToFixed(5, 2)).toBe(5)
  })

  it('rejects negative fractionDigits', () => {
    expect(() => truncateToFixed(1.23, -1)).toThrow()
  })

  it('rejects non-integer fractionDigits', () => {
    expect(() => truncateToFixed(1.23, 1.5)).toThrow()
  })

  it('handles negative values by truncating toward zero', () => {
    expect(truncateToFixed(-1.236, 2)).toBe(-1.23)
    expect(truncateToFixed(-1.999, 2)).toBe(-1.99)
  })
})
