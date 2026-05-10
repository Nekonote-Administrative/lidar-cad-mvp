import type { AreaTable } from './types'
import { truncateToFixed } from './truncate'

export type IntegrityResult = { ok: true } | { ok: false; violations: string[] }

/**
 * ADR-0008 の整合性条件を検証:
 *
 * 整合 1 (図面表示 ↔ 求積表): Phase 4 (PDF 出力) で図面オブジェクトと突き合わせる時にチェック。
 *                              本関数はスコープ外。
 * 整合 2 (per-triangle):    triangle.area = truncateToFixed(base * height / 2, 2)
 * 整合 3 (total):            total       = truncateToFixed(sum(triangle.area), 2)
 *
 * @returns ok: true なら整合、 ok: false なら違反リスト付き
 */
export function validateAreaIntegrity(table: AreaTable): IntegrityResult {
  const violations: string[] = []

  for (let i = 0; i < table.triangles.length; i++) {
    const t = table.triangles[i]!
    const expected = truncateToFixed((t.base * t.height) / 2, 2)
    if (t.area !== expected) {
      violations.push(
        `triangle[${i}]: area=${t.area} but truncate(base*height/2)=${expected} (base=${t.base}, height=${t.height})`,
      )
    }
  }

  const expectedTotal = truncateToFixed(
    table.triangles.reduce((s, t) => s + t.area, 0),
    2,
  )
  if (table.total !== expectedTotal) {
    violations.push(`total: declared=${table.total} but sum=${expectedTotal}`)
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations }
}
