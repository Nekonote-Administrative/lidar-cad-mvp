/**
 * 2D 座標 (mm 単位)
 * Polycam DXF は mm 単位整数で出力されるため、座標は number で OK。
 */
export type Point = { x: number; y: number }

/**
 * 単純多角形 (穴なし)。最初の点と最後の点は一致しない (closed と仮定して扱う)。
 * 自己交差禁止。validatePolygonOrThrow で事前チェック必須。
 */
export type Polygon = Point[]

/**
 * 穴付き多角形 (柱控除など)。outer + holes[]。
 * holes は outer の内側に完全に含まれる単純多角形。
 */
export type PolygonWithHoles = {
  outer: Polygon
  holes: Polygon[]
}

/**
 * 三斜分割の出力単位。3 点で構成される三角形。
 * base/height は求積表表示用 (m 単位、第 2 位)。
 */
export type Triangle = {
  vertices: [Point, Point, Point]
  /** 求積表に表示する底辺 (m 単位、小数点第 2 位、切り捨て済) */
  base: number
  /** 求積表に表示する高さ (m 単位、小数点第 2 位、切り捨て済) */
  height: number
  /** = truncateToFixed(base * height / 2, 2) */
  area: number
}

/**
 * 求積表 (1 ゾーン分)。
 * triangles[i].area の合計と total が一致する (= ADR-0008 整合 3)。
 */
export type AreaTable = {
  zoneName: string
  triangles: Triangle[]
  /** = sum(triangles[].area)、 個別切り捨て後の合計を再度切り捨てない (ADR-0008) */
  total: number
}

/**
 * Polycam DXF パース結果。
 */
export type ParsedDxf = {
  /** 壁ポリライン (= レイヤー名 'WALLS' 等) */
  walls: Polygon
  /** ドア (= レイヤー名 'DOORS' 等) — 各要素は 1 つのドア開口を表す線分または矩形 */
  doors: Polygon[]
  /** 窓 (= レイヤー名 'WINDOWS' 等) */
  windows: Polygon[]
  /** メタデータ (例: ヘッダから取得した単位) */
  meta: {
    units: 'mm' | 'unknown'
    /** Polycam の出力時刻など、 取得できれば */
    sourceHint?: string
  }
}
