import { describe, it, expect } from 'vitest'
import { triangulate } from './triangulate'
import { calculateAreaTable } from './area-calc'
import type { Polygon } from './types'

// vitest config の environment は 'jsdom' なので、 Browser 想定での import + 実行を確認
describe('cad library is browser-compatible (no Node fs etc.)', () => {
  it('triangulates and calculates area without Node-only APIs', () => {
    const rect: Polygon = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ]
    const tris = triangulate(rect)
    const table = calculateAreaTable('test', tris)
    expect(table.total).toBeGreaterThan(11)
    expect(table.total).toBeLessThanOrEqual(12)
  })
})
