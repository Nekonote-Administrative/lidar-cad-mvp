import { describe, it, expect } from 'vitest'
import { triangulate } from './triangulate'
import type { Polygon, Point } from './types'

function rawTriangleAreaMm2(v: [Point, Point, Point]): number {
  const [a, b, c] = v
  return Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2)
}

describe('triangulate', () => {
  it('triangulates a 4x3m rectangle into 2 triangles totaling 12_000_000 mm²', () => {
    const rect: Polygon = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ]
    const tris = triangulate(rect)
    expect(tris).toHaveLength(2)
    const totalMm2 = tris.reduce((sum, t) => sum + rawTriangleAreaMm2(t.vertices), 0)
    expect(totalMm2).toBeCloseTo(12_000_000, 1)
    // base/height/area should be 0 (deferred to area-calc)
    for (const t of tris) {
      expect(t.base).toBe(0)
      expect(t.height).toBe(0)
      expect(t.area).toBe(0)
    }
  })

  it('triangulates an L-shape into multiple triangles preserving total area', () => {
    const lShape: Polygon = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 3000 },
      { x: 0, y: 3000 },
    ]
    const tris = triangulate(lShape)
    // L-shape: 4x2 + 2x1 = 8 + 2 = 10m² = 10_000_000mm²
    const totalMm2 = tris.reduce((sum, t) => sum + rawTriangleAreaMm2(t.vertices), 0)
    expect(totalMm2).toBeCloseTo(10_000_000, 1)
    expect(tris.length).toBeGreaterThanOrEqual(2)
  })

  it('throws on self-intersecting input (delegates to validator)', () => {
    const figureEight: Polygon = [
      { x: 0, y: 0 },
      { x: 4000, y: 4000 },
      { x: 0, y: 4000 },
      { x: 4000, y: 0 },
    ]
    expect(() => triangulate(figureEight)).toThrow()
  })

  it('throws on polygons with fewer than 3 points', () => {
    expect(() => triangulate([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow()
  })
})
