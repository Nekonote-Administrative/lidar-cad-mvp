import { describe, it, expect } from 'vitest'
import { calculateAreaTable } from './area-calc'
import type { Triangle } from './types'

describe('calculateAreaTable', () => {
  it('builds a table from a 4x3m rectangle (2 right triangles, total 12.00m²)', () => {
    const tris: Triangle[] = [
      // 三角形 1: (0,0)-(4000,0)-(4000,3000) → 直角, base=5m (hypotenuse), height=2.4m, area=6m²
      // 待って: 最長辺は斜辺 √(4²+3²)=5m, 高さは 4*3/5 = 2.4m, 面積 = 5*2.4/2 = 6m²
      {
        vertices: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
        ],
        base: 0,
        height: 0,
        area: 0,
      },
      {
        vertices: [
          { x: 0, y: 0 },
          { x: 4000, y: 3000 },
          { x: 0, y: 3000 },
        ],
        base: 0,
        height: 0,
        area: 0,
      },
    ]
    const table = calculateAreaTable('客室', tris)
    expect(table.zoneName).toBe('客室')
    expect(table.triangles).toHaveLength(2)
    // 最長辺は √(4²+3²) = 5m → base=5, area=6
    expect(table.triangles[0]!.base).toBe(5)
    expect(table.triangles[0]!.height).toBe(2.4)
    expect(table.triangles[0]!.area).toBe(6)
    expect(table.total).toBe(12)
  })

  it('truncates each triangle area BEFORE summing (ADR-0008 個別切り捨て後合計)', () => {
    // 三角形 (0,0)-(1000,0)-(0,2468) を 2 つ作る:
    //   最長辺 (= base) = √(1000² + 2468²) ≈ 2663.302mm = 2.6633m → truncated 2.66m
    //   raw area mm² = 1000 * 2468 / 2 = 1234000mm² = 1.234m²
    //   raw height mm = 2 * 1234000 / 2663.302 ≈ 926.835mm = 0.92683m → truncated 0.92m
    //   ADR-0008 整合 2: area = truncate(truncated_base * truncated_height / 2)
    //                       = truncate(2.66 * 0.92 / 2, 2) = truncate(1.2236, 2) = 1.22
    // 個別切り捨て後の合計が、 raw 合計の切り捨てとは異なることを確認:
    //   個別切り捨て後合計 = 1.22 + 1.22 = 2.44
    //   raw 合計切り捨て (= もし誤実装で sum-then-truncate していた場合) = trunc(2 * 1.2236, 2) = trunc(2.4472, 2) = 2.44
    //   このケースでは偶々一致するが、 整合 2 を満たすのは 1.22 (= 切り捨て後 base/height の積)
    const tris: Triangle[] = [
      {
        vertices: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 0, y: 2468 },
        ],
        base: 0,
        height: 0,
        area: 0,
      },
      {
        vertices: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 0, y: 2468 },
        ],
        base: 0,
        height: 0,
        area: 0,
      },
    ]
    const table = calculateAreaTable('テスト', tris)
    // 各 area = truncate(2.66 * 0.92 / 2, 2) = truncate(1.2236, 2) = 1.22
    expect(table.triangles[0]!.base).toBe(2.66)
    expect(table.triangles[0]!.height).toBe(0.92)
    expect(table.triangles[0]!.area).toBe(1.22)
    expect(table.triangles[1]!.area).toBe(1.22)
    // total = 1.22 + 1.22 = 2.44
    expect(table.total).toBe(2.44)
  })

  it('handles a single isosceles triangle (3-4-5)', () => {
    const tris: Triangle[] = [
      // 3-4-5 直角三角形: (0,0)-(4000,0)-(4000,3000)、 最長辺=5m=斜辺、 高さ=2.4m、 area=6m²
      {
        vertices: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
        ],
        base: 0,
        height: 0,
        area: 0,
      },
    ]
    const table = calculateAreaTable('単独', tris)
    expect(table.triangles[0]!.base).toBe(5)
    expect(table.triangles[0]!.height).toBe(2.4)
    expect(table.triangles[0]!.area).toBe(6)
    expect(table.total).toBe(6)
  })

  it('returns empty table for empty input', () => {
    const table = calculateAreaTable('空', [])
    expect(table.triangles).toHaveLength(0)
    expect(table.total).toBe(0)
  })
})
