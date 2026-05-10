import { describe, it, expect } from 'vitest'
import { validatePolygonOrThrow } from './polygon-validation'
import type { Polygon } from './types'

describe('validatePolygonOrThrow', () => {
  const square: Polygon = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ]

  const figureEight: Polygon = [
    { x: 0, y: 0 },
    { x: 4000, y: 4000 },
    { x: 0, y: 4000 },
    { x: 4000, y: 0 },
  ]

  it('passes a simple convex polygon', () => {
    expect(() => validatePolygonOrThrow(square)).not.toThrow()
  })

  it('throws on a self-intersecting polygon', () => {
    expect(() => validatePolygonOrThrow(figureEight)).toThrow(/self-intersect/i)
  })

  it('throws on a polygon with fewer than 3 points', () => {
    expect(() => validatePolygonOrThrow([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow(/at least 3/i)
  })

  it('throws on a polygon with duplicated consecutive points', () => {
    const dup: Polygon = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
    ]
    expect(() => validatePolygonOrThrow(dup)).toThrow(/duplicate|degenerate/i)
  })

  it('passes a non-convex (L-shape) but simple polygon', () => {
    const lShape: Polygon = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 3000 },
      { x: 0, y: 3000 },
    ]
    expect(() => validatePolygonOrThrow(lShape)).not.toThrow()
  })
})
