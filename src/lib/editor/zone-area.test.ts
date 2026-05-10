import { describe, it, expect } from 'vitest'
import { computeZoneAreaTable, aggregateZoneAreas } from './zone-area'
import type { Zone } from './types'

describe('computeZoneAreaTable', () => {
  it('computes 12.00m² area for a 4x3m rectangle zone', () => {
    const zone: Zone = {
      id: 'z1',
      type: 'guest',
      rect: { x1: 0, y1: 0, x2: 4000, y2: 3000 },
    }
    const table = computeZoneAreaTable(zone)
    expect(table.zoneName).toBe('客室')
    expect(table.total).toBe(12)
  })

  it('computes consistent results regardless of corner order', () => {
    const a: Zone = { id: 'a', type: 'guest', rect: { x1: 0, y1: 0, x2: 4000, y2: 3000 } }
    const b: Zone = { id: 'b', type: 'guest', rect: { x1: 4000, y1: 3000, x2: 0, y2: 0 } }
    expect(computeZoneAreaTable(a).total).toBe(computeZoneAreaTable(b).total)
  })

  it('throws if rect has zero size', () => {
    const zone: Zone = {
      id: 'zero',
      type: 'guest',
      rect: { x1: 0, y1: 0, x2: 0, y2: 0 },
    }
    expect(() => computeZoneAreaTable(zone)).toThrow()
  })

  it('uses zone.type label (営業所/客室/調理場)', () => {
    const business: Zone = { id: 'b', type: 'business', rect: { x1: 0, y1: 0, x2: 1000, y2: 1000 } }
    expect(computeZoneAreaTable(business).zoneName).toBe('営業所')
    const kitchen: Zone = { id: 'k', type: 'kitchen', rect: { x1: 0, y1: 0, x2: 1000, y2: 1000 } }
    expect(computeZoneAreaTable(kitchen).zoneName).toBe('調理場')
  })
})

describe('aggregateZoneAreas', () => {
  it('returns zero totals for empty input', () => {
    const r = aggregateZoneAreas([])
    expect(r.totalsByType).toEqual({ business: 0, guest: 0, kitchen: 0 })
  })

  it('groups by type and sums totals correctly', () => {
    const zones: Zone[] = [
      { id: '1', type: 'guest', rect: { x1: 0, y1: 0, x2: 4000, y2: 3000 } }, // 12m²
      { id: '2', type: 'guest', rect: { x1: 0, y1: 0, x2: 2000, y2: 1000 } }, // 2m²
      { id: '3', type: 'kitchen', rect: { x1: 0, y1: 0, x2: 1000, y2: 1000 } }, // 1m²
    ]
    const r = aggregateZoneAreas(zones)
    expect(r.byType.guest).toHaveLength(2)
    expect(r.byType.kitchen).toHaveLength(1)
    expect(r.byType.business).toHaveLength(0)
    // truncation may make these slightly off; bound check
    expect(r.totalsByType.guest).toBeGreaterThanOrEqual(13.5)
    expect(r.totalsByType.guest).toBeLessThanOrEqual(14)
    expect(r.totalsByType.kitchen).toBeGreaterThanOrEqual(0.95)
    expect(r.totalsByType.kitchen).toBeLessThanOrEqual(1)
    expect(r.totalsByType.business).toBe(0)
  })
})
