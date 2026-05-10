import { describe, it, expect } from 'vitest'
import { validateAreaIntegrity } from './area-integrity'
import type { AreaTable } from './types'

describe('validateAreaIntegrity (ADR-0008)', () => {
  it('passes a correctly built table', () => {
    const table: AreaTable = {
      zoneName: '客室',
      triangles: [
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
          ],
          base: 5,
          height: 2.4,
          area: 6,
        },
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
          base: 5,
          height: 2.4,
          area: 6,
        },
      ],
      total: 12,
    }
    const result = validateAreaIntegrity(table)
    expect(result.ok).toBe(true)
  })

  it('detects per-triangle area mismatch (整合 2 violation)', () => {
    const table: AreaTable = {
      zoneName: 'NG',
      triangles: [
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
          ],
          base: 5,
          height: 2.4,
          area: 7,
        }, // wrong: should be 6
      ],
      total: 7,
    }
    const result = validateAreaIntegrity(table)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.violations).toContainEqual(expect.stringMatching(/triangle\[0\]/))
    }
  })

  it('detects total mismatch (整合 3 violation)', () => {
    const table: AreaTable = {
      zoneName: 'NG total',
      triangles: [
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
          ],
          base: 5,
          height: 2.4,
          area: 6,
        },
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
          base: 5,
          height: 2.4,
          area: 6,
        },
      ],
      total: 99, // wrong: should be 12
    }
    const result = validateAreaIntegrity(table)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.violations).toContainEqual(expect.stringMatching(/total/))
    }
  })

  it('passes empty table', () => {
    const table: AreaTable = { zoneName: 'empty', triangles: [], total: 0 }
    const result = validateAreaIntegrity(table)
    expect(result.ok).toBe(true)
  })

  it('reports multiple violations together', () => {
    const table: AreaTable = {
      zoneName: 'multi-bad',
      triangles: [
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
          ],
          base: 5,
          height: 2.4,
          area: 7,
        },
        {
          vertices: [
            { x: 0, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
          base: 5,
          height: 2.4,
          area: 7,
        },
      ],
      total: 99,
    }
    const result = validateAreaIntegrity(table)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.violations.length).toBeGreaterThanOrEqual(3) // 2 triangles + 1 total
    }
  })
})
