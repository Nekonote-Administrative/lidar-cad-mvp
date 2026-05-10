import type { Zone, ZoneType } from './types'
import { rectToPolygon, ZONE_LABELS } from './types'
import { triangulate } from '@/lib/cad/triangulate'
import { calculateAreaTable } from '@/lib/cad/area-calc'
import { validateAreaIntegrity } from '@/lib/cad/area-integrity'
import type { AreaTable } from '@/lib/cad/types'

export function computeZoneAreaTable(zone: Zone): AreaTable {
  const polygon = rectToPolygon(zone.rect)
  const triangles = triangulate(polygon)
  const table = calculateAreaTable(ZONE_LABELS[zone.type], triangles)
  const integrity = validateAreaIntegrity(table)
  if (!integrity.ok) {
    throw new Error(`Zone area integrity check failed: ${integrity.violations.join(', ')}`)
  }
  return table
}

export function aggregateZoneAreas(zones: Zone[]): {
  byType: Record<ZoneType, AreaTable[]>
  totalsByType: Record<ZoneType, number>
} {
  const byType: Record<ZoneType, AreaTable[]> = {
    business: [],
    guest: [],
    kitchen: [],
  }
  for (const zone of zones) {
    byType[zone.type].push(computeZoneAreaTable(zone))
  }
  const totalsByType = (Object.entries(byType) as Array<[ZoneType, AreaTable[]]>).reduce(
    (acc, [t, tables]) => {
      acc[t] = tables.reduce((s, table) => s + table.total, 0)
      return acc
    },
    { business: 0, guest: 0, kitchen: 0 } as Record<ZoneType, number>,
  )
  return { byType, totalsByType }
}
