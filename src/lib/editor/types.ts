import type { ParsedDxf, Polygon } from '@/lib/cad/types'

/**
 * ゾーンの分類 (ADR-0003 色分けルール: 営業所青 / 客室赤 / 調理場緑)
 */
export type ZoneType = 'business' | 'guest' | 'kitchen'

export const ZONE_COLORS: Record<ZoneType, string> = {
  business: '#3b82f6', // blue-500
  guest: '#ef4444', // red-500
  kitchen: '#22c55e', // green-500
}

export const ZONE_LABELS: Record<ZoneType, string> = {
  business: '営業所',
  guest: '客室',
  kitchen: '調理場',
}

/**
 * 1 ゾーン: 矩形 (Phase 3 は矩形のみ、 自由多角形は Phase 4 前段)
 */
export type Zone = {
  id: string
  type: ZoneType
  /** 矩形の対角 2 点 (mm 単位、 Polycam DXF と同じ座標系) */
  rect: { x1: number; y1: number; x2: number; y2: number }
}

/**
 * Editor 全体の状態
 */
export type EditorState = {
  dxf: ParsedDxf | null
  /** Polygon 座標から派生した壁の bounding box (mm) — view fit 計算用 */
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null
  zones: Zone[]
  currentZoneType: ZoneType
}

/**
 * 矩形 → Polygon (4 点) 変換 (左下→右下→右上→左上 順、 mm 座標)
 */
export function rectToPolygon(rect: Zone['rect']): Polygon {
  const { x1, y1, x2, y2 } = rect
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
}
