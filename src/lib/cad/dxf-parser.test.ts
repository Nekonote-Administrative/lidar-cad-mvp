import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePolycamDxf } from './dxf-parser'

const __dirname_ = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(__dirname_, '../../../tests/fixtures')

describe('parsePolycamDxf', () => {
  it('parses a synthetic rectangle room (4m x 3m, walls only)', () => {
    const buffer = readFileSync(join(FIXTURES, 'synthetic-rectangle-room.dxf'), 'utf8')
    const parsed = parsePolycamDxf(buffer)
    expect(parsed.walls).toHaveLength(4)
    expect(parsed.walls[0]).toEqual({ x: 0, y: 0 })
    expect(parsed.walls[1]).toEqual({ x: 4000, y: 0 })
    expect(parsed.walls[2]).toEqual({ x: 4000, y: 3000 })
    expect(parsed.walls[3]).toEqual({ x: 0, y: 3000 })
    expect(parsed.meta.units).toBe('mm')
    expect(parsed.doors).toHaveLength(0)
    expect(parsed.windows).toHaveLength(0)
  })

  it('parses a room with a PILLARS layer but ignores it (V1 spec)', () => {
    const buffer = readFileSync(join(FIXTURES, 'synthetic-with-pillar.dxf'), 'utf8')
    const parsed = parsePolycamDxf(buffer)
    expect(parsed.walls).toHaveLength(4)
    expect(parsed.walls[0]).toEqual({ x: 0, y: 0 })
    expect(parsed.walls[2]).toEqual({ x: 10000, y: 8000 })
    // V1 doesn't extract PILLARS — pillars info is silently dropped
    expect(parsed.doors).toHaveLength(0)
    expect(parsed.windows).toHaveLength(0)
  })

  it('throws on completely invalid DXF input', () => {
    expect(() => parsePolycamDxf('not a dxf file')).toThrow()
  })

  it('returns empty arrays for an entity-less but valid DXF', () => {
    const minimal = `  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n  0\nEOF\n`
    const parsed = parsePolycamDxf(minimal)
    expect(parsed.walls).toHaveLength(0)
    expect(parsed.doors).toHaveLength(0)
    expect(parsed.windows).toHaveLength(0)
    expect(parsed.meta.units).toBe('unknown')
  })
})
