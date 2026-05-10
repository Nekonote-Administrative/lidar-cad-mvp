import type { Triangle, AreaTable, Point } from './types'
import { truncateToFixed } from './truncate'

const MM_TO_M = 1 / 1000

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function rawAreaMm2(t: readonly [Point, Point, Point]): number {
  const [a, b, c] = t
  return Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2)
}

/**
 * 三角形の base (= 最長辺) と、 それに対する高さ (m 単位、 第 2 位切り捨て)、 面積 (m², 第 2 位切り捨て) を計算。
 *
 * ADR-0008 の整合性 3 条件:
 *   - 整合 1 (図面 ↔ 寸法): Phase 4 (PDF 出力) で図面オブジェクトと突き合わせる時にチェック。 本関数はスコープ外。
 *   - 整合 2: triangle.area = truncateToFixed(base * height / 2, 2)
 *   - 整合 3: total = truncateToFixed(sum(triangle.area), 2)
 *
 * 注意: 整合 2 を満たすため、 base/height は表示用に truncate された値を使い、
 *       area は **truncated base × truncated height / 2** を再度 truncate する。
 *       (mm 単位の生面積から直接 m² に変換 + truncate ではない — そうすると
 *        整合 2 が破れるケースが発生する。)
 */
export function calculateAreaTable(zoneName: string, rawTriangles: Triangle[]): AreaTable {
  const triangles: Triangle[] = rawTriangles.map(({ vertices }) => {
    const [a, b, c] = vertices
    const sides = [
      { length: distance(a, b) },
      { length: distance(b, c) },
      { length: distance(c, a) },
    ]
    const baseSide = sides.reduce((longest, s) => (s.length > longest.length ? s : longest))
    const baseMm = baseSide.length
    const areaMm2 = rawAreaMm2(vertices)
    const heightMm = (areaMm2 * 2) / baseMm
    const baseM = truncateToFixed(baseMm * MM_TO_M, 2)
    const heightM = truncateToFixed(heightMm * MM_TO_M, 2)
    // ADR-0008 整合 2: area = truncate(base * height / 2) using the truncated base/height
    const areaM2 = truncateToFixed((baseM * heightM) / 2, 2)
    return { vertices, base: baseM, height: heightM, area: areaM2 }
  })
  const totalRaw = triangles.reduce((s, t) => s + t.area, 0)
  return {
    zoneName,
    triangles,
    total: truncateToFixed(totalRaw, 2),
  }
}
