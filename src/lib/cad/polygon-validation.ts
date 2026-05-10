import polygonClipping from 'polygon-clipping'
import type { Polygon } from './types'

/**
 * 単純多角形であることを検証。 自己交差・退化 (3 点未満 / 連続重複点) を reject。
 * Earcut が自己交差ポリゴンでクラッシュする (ADR-0005 既知リスク) のを未然防止する。
 *
 * 自己交差判定は polygon-clipping の union(self) を使う代理判定。
 * 厳密な segment-segment intersection 判定は O(n²) のため MVP では採用しない。
 */
export function validatePolygonOrThrow(polygon: Polygon): void {
  if (polygon.length < 3) {
    throw new Error(`Polygon must have at least 3 points, got ${polygon.length}`)
  }
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    if (a.x === b.x && a.y === b.y) {
      throw new Error(`Polygon has duplicate/degenerate consecutive points at index ${i}`)
    }
  }

  const ring = polygon.map<[number, number]>((p) => [p.x, p.y])
  ring.push(ring[0]!)
  const result = polygonClipping.union([ring])
  if (result.length !== 1 || result[0]!.length !== 1) {
    throw new Error('Polygon is self-intersecting')
  }
}
