import polygonClipping, { type MultiPolygon, type Pair } from 'polygon-clipping'
import type { Polygon, PolygonWithHoles } from './types'
import { validatePolygonOrThrow } from './polygon-validation'

function toMultiPolygon(p: Polygon): MultiPolygon {
  const ring: Pair[] = p.map((pt) => [pt.x, pt.y])
  ring.push(ring[0]!) // close
  return [[ring]]
}

function fromMulti(multi: ReadonlyArray<ReadonlyArray<Pair>>): PolygonWithHoles {
  const [outerRing, ...holeRings] = multi
  return {
    outer: outerRing!.slice(0, -1).map(([x, y]) => ({ x, y })), // drop closing point
    holes: holeRings.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))),
  }
}

/**
 * a から b を差し引く (= 柱の控除など)。
 * 戻り値は分離されたピースの配列 (通常 1 件、 b が a を分断する形なら複数)。
 * b が a を完全に覆う場合は空配列。
 *
 * @throws どちらかの入力が自己交差 / 退化していた場合
 */
export function subtractPolygon(a: Polygon, b: Polygon): PolygonWithHoles[] {
  validatePolygonOrThrow(a)
  validatePolygonOrThrow(b)
  const result = polygonClipping.difference(toMultiPolygon(a), toMultiPolygon(b))
  return result.map((multi) => fromMulti(multi))
}
