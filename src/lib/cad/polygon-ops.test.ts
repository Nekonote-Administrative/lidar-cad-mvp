import { describe, it, expect } from 'vitest'
import { subtractPolygon } from './polygon-ops'
import type { Polygon } from './types'

describe('subtractPolygon', () => {
  it('subtracts a small square (柱) from a larger square (部屋)', () => {
    const room: Polygon = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 8000 },
      { x: 0, y: 8000 },
    ]
    const pillar: Polygon = [
      { x: 4000, y: 3000 },
      { x: 5000, y: 3000 },
      { x: 5000, y: 4000 },
      { x: 4000, y: 4000 },
    ]
    const result = subtractPolygon(room, pillar)
    expect(result).toHaveLength(1)
    const piece = result[0]!
    expect(piece.outer.length).toBeGreaterThanOrEqual(4)
    expect(piece.holes).toHaveLength(1)
    expect(piece.holes[0]!.length).toBeGreaterThanOrEqual(4)
  })

  it('returns the unchanged polygon when the subtractor is fully outside', () => {
    const room: Polygon = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ]
    const outside: Polygon = [
      { x: 2000, y: 2000 },
      { x: 3000, y: 2000 },
      { x: 3000, y: 3000 },
      { x: 2000, y: 3000 },
    ]
    const result = subtractPolygon(room, outside)
    expect(result).toHaveLength(1)
    expect(result[0]!.holes).toHaveLength(0)
    expect(result[0]!.outer.length).toBe(4)
  })

  it('returns empty array when subtractor fully contains the polygon', () => {
    const small: Polygon = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ]
    const enclosing: Polygon = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ]
    const result = subtractPolygon(small, enclosing)
    expect(result).toHaveLength(0)
  })

  it('throws when either input is invalid (delegates to validator)', () => {
    const valid: Polygon = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ]
    const figureEight: Polygon = [
      { x: 0, y: 0 },
      { x: 4000, y: 4000 },
      { x: 0, y: 4000 },
      { x: 4000, y: 0 },
    ]
    expect(() => subtractPolygon(valid, figureEight)).toThrow()
    expect(() => subtractPolygon(figureEight, valid)).toThrow()
  })

  it('handles partial overlap (cuts a notch out of the polygon)', () => {
    const room: Polygon = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 4000 },
      { x: 0, y: 4000 },
    ]
    const notch: Polygon = [
      { x: 3000, y: 1000 },
      { x: 5000, y: 1000 },
      { x: 5000, y: 3000 },
      { x: 3000, y: 3000 },
    ]
    const result = subtractPolygon(room, notch)
    expect(result).toHaveLength(1)
    expect(result[0]!.holes).toHaveLength(0) // notch is on the edge, not a hole
    // outer should now have more vertices (the notch creates a concave corner)
    expect(result[0]!.outer.length).toBeGreaterThan(4)
  })
})
