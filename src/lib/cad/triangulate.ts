import earcut from 'earcut'
import type { Polygon, Triangle } from './types'
import { validatePolygonOrThrow } from './polygon-validation'

/**
 * 単純多角形を三角形に分割する (Earcut)。
 * 戻り値の Triangle.base / height / area は **未計算 (0)**。
 * 求積表示用の底辺・高さ・面積は area-calc.ts の calculateAreaTable() で確定する。
 *
 * @throws 自己交差・退化ポリゴンの場合 (validatePolygonOrThrow に委譲)
 */
export function triangulate(polygon: Polygon): Triangle[] {
  validatePolygonOrThrow(polygon)

  const flat: number[] = []
  for (const p of polygon) {
    flat.push(p.x, p.y)
  }
  const indices = earcut(flat)

  const triangles: Triangle[] = []
  for (let i = 0; i < indices.length; i += 3) {
    const a = polygon[indices[i]!]!
    const b = polygon[indices[i + 1]!]!
    const c = polygon[indices[i + 2]!]!
    triangles.push({
      vertices: [a, b, c],
      base: 0,
      height: 0,
      area: 0,
    })
  }
  return triangles
}
