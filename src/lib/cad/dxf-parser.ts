import DxfParser from 'dxf-parser'
import type { ParsedDxf, Point, Polygon } from './types'

type DxfEntity = {
  type?: string
  layer?: string
  vertices?: { x: number; y: number }[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
}

type DxfDocument = {
  entities?: DxfEntity[]
  header?: Record<string, number | undefined>
}

function extractPoints(entity: DxfEntity): Polygon {
  if (entity.vertices && entity.vertices.length > 0) {
    return entity.vertices.map(({ x, y }) => ({ x, y }))
  }
  if (entity.start && entity.end) {
    return [
      { x: entity.start.x, y: entity.start.y },
      { x: entity.end.x, y: entity.end.y },
    ]
  }
  return []
}

/**
 * Polycam Room Capture が出力する DXF を解析。
 *
 * レイヤー命名規則:
 *   - WALLS    → 壁ポリライン (closed)
 *   - DOORS    → ドア開口 (短い線分または小さい矩形)
 *   - WINDOWS  → 窓開口
 *   - PILLARS  → 柱 (V1 では無視、 V2 で対応予定)
 *   - その他    → silently ignored
 *
 * `$INSUNITS = 4` (DXF header) を mm 単位として認識。 それ以外 / 未指定は `'unknown'`。
 *
 * @throws DXF パース失敗時
 */
export function parsePolycamDxf(dxfText: string): ParsedDxf {
  const parser = new DxfParser()
  let dxf: unknown
  try {
    dxf = parser.parseSync(dxfText)
  } catch (err) {
    throw new Error(`Failed to parse DXF: ${(err as Error).message}`)
  }
  if (!dxf || typeof dxf !== 'object') {
    throw new Error('Failed to parse DXF: no document returned')
  }
  const doc = dxf as DxfDocument

  const wallsAccum: Point[] = []
  const doors: Polygon[] = []
  const windows: Polygon[] = []

  for (const e of doc.entities ?? []) {
    const t = e.type
    if (t !== 'LWPOLYLINE' && t !== 'POLYLINE' && t !== 'LINE') continue
    const layer = (e.layer ?? '').toUpperCase()
    const points = extractPoints(e)
    if (points.length === 0) continue
    if (layer === 'WALLS') {
      wallsAccum.push(...points)
    } else if (layer === 'DOORS') {
      doors.push(points)
    } else if (layer === 'WINDOWS') {
      windows.push(points)
    }
    // PILLARS and other layers: silently dropped (V1 spec)
  }

  const insunits = doc.header?.['$INSUNITS']
  const units: 'mm' | 'unknown' = insunits === 4 ? 'mm' : 'unknown'

  return {
    walls: wallsAccum,
    doors,
    windows,
    meta: { units },
  }
}
