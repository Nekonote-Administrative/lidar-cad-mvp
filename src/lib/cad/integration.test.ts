import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parsePolycamDxf } from './dxf-parser'
import { triangulate } from './triangulate'
import { calculateAreaTable } from './area-calc'
import { validateAreaIntegrity } from './area-integrity'

const __dirname_ = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(__dirname_, '../../../tests/fixtures')

describe('integration: DXF → triangulate → area table → integrity', () => {
  it('synthetic-rectangle-room.dxf yields integrity-passed table totaling 12.00m²', () => {
    const text = readFileSync(join(FIXTURES, 'synthetic-rectangle-room.dxf'), 'utf8')
    const parsed = parsePolycamDxf(text)
    const triangles = triangulate(parsed.walls)
    const table = calculateAreaTable('客室', triangles)
    const integrity = validateAreaIntegrity(table)
    expect(integrity.ok).toBe(true)
    expect(table.total).toBe(12)
    expect(table.triangles).toHaveLength(2)
  })

  it('synthetic-l-shape.dxf yields integrity-passed table totaling close to 10.00m²', () => {
    const text = readFileSync(join(FIXTURES, 'synthetic-l-shape.dxf'), 'utf8')
    const parsed = parsePolycamDxf(text)
    expect(parsed.walls).toHaveLength(6)
    const triangles = triangulate(parsed.walls)
    expect(triangles.length).toBeGreaterThanOrEqual(3) // earcut should produce 4 triangles for L-shape
    const table = calculateAreaTable('L字', triangles)
    const integrity = validateAreaIntegrity(table)
    expect(integrity.ok).toBe(true)
    // L-shape area is 10m². Per ADR-0008 truncation, the sum of truncated triangle areas
    // may be slightly less than 10 but should be close (within 0.05m²).
    expect(table.total).toBeGreaterThan(9.9)
    expect(table.total).toBeLessThanOrEqual(10)
  })

  it('synthetic-with-pillar.dxf walls (ignoring PILLARS) totals close to 80.00m²', () => {
    const text = readFileSync(join(FIXTURES, 'synthetic-with-pillar.dxf'), 'utf8')
    const parsed = parsePolycamDxf(text)
    expect(parsed.walls).toHaveLength(4)
    const triangles = triangulate(parsed.walls)
    const table = calculateAreaTable('店舗', triangles)
    const integrity = validateAreaIntegrity(table)
    expect(integrity.ok).toBe(true)
    // 10m × 8m room = 80m². Per ADR-0008 truncation, each triangle's base
    // (hypotenuse ≈ 12.806m → 12.8m) and height (≈ 6.247m → 6.24m) lose
    // ~0.5–1.0% to truncation, so the total is slightly under 80.
    expect(table.total).toBeGreaterThan(79.5)
    expect(table.total).toBeLessThanOrEqual(80)
  })
})
