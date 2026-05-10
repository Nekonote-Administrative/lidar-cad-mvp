#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'
import { parsePolycamDxf } from '../lib/cad/dxf-parser'
import { triangulate } from '../lib/cad/triangulate'
import { calculateAreaTable } from '../lib/cad/area-calc'
import { validateAreaIntegrity } from '../lib/cad/area-integrity'

function main(): void {
  const args = process.argv.slice(2)
  const dxfPath = args[0]
  if (!dxfPath || dxfPath === '--help' || dxfPath === '-h') {
    console.error('Usage: parse-dxf <path.dxf> [--zone <name>]')
    process.exit(2)
  }
  const zoneIdx = args.indexOf('--zone')
  const zoneName = zoneIdx >= 0 ? (args[zoneIdx + 1] ?? 'Zone') : 'Zone'

  const text = readFileSync(dxfPath, 'utf8')
  const parsed = parsePolycamDxf(text)
  if (parsed.walls.length < 3) {
    console.error(`Walls polygon has ${parsed.walls.length} points, need at least 3`)
    process.exit(1)
  }

  const triangles = triangulate(parsed.walls)
  const table = calculateAreaTable(zoneName, triangles)
  const integrity = validateAreaIntegrity(table)
  if (!integrity.ok) {
    console.error('Area integrity check failed:')
    for (const v of integrity.violations) {
      console.error(`  - ${v}`)
    }
    process.exit(1)
  }

  console.log(JSON.stringify({ parsed, table, integrity }, null, 2))
}

main()
