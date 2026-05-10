'use client'

import { Stage, Layer, Line, Rect } from 'react-konva'
import { useEditorStore } from '@/lib/editor/store'
import { ZONE_COLORS } from '@/lib/editor/types'

const CANVAS_PADDING = 40
const CANVAS_W = 800
const CANVAS_H = 600

type FitTransform = { scale: number; offsetX: number; offsetY: number }

function useFitTransform(): FitTransform | null {
  const bbox = useEditorStore((s) => s.bbox)
  if (!bbox) return null
  const dxMm = Math.max(bbox.maxX - bbox.minX, 1)
  const dyMm = Math.max(bbox.maxY - bbox.minY, 1)
  const availableW = CANVAS_W - CANVAS_PADDING * 2
  const availableH = CANVAS_H - CANVAS_PADDING * 2
  const scale = Math.min(availableW / dxMm, availableH / dyMm)
  const offsetX = CANVAS_PADDING - bbox.minX * scale
  const offsetY = CANVAS_PADDING - bbox.minY * scale
  return { scale, offsetX, offsetY }
}

export function DxfCanvas() {
  const dxf = useEditorStore((s) => s.dxf)
  const zones = useEditorStore((s) => s.zones)
  const tx = useFitTransform()
  if (!dxf || !tx) return null

  const wallPoints = dxf.walls.flatMap((p) => [
    p.x * tx.scale + tx.offsetX,
    p.y * tx.scale + tx.offsetY,
  ])

  return (
    <Stage width={CANVAS_W} height={CANVAS_H} className="border border-gray-200">
      <Layer>
        {/* 壁ポリライン (closed) */}
        <Line points={wallPoints} closed stroke="#111827" strokeWidth={2} />
        {/* ゾーン (Phase 3 は矩形のみ) */}
        {zones.map((zone) => {
          const minX = Math.min(zone.rect.x1, zone.rect.x2)
          const maxX = Math.max(zone.rect.x1, zone.rect.x2)
          const minY = Math.min(zone.rect.y1, zone.rect.y2)
          const maxY = Math.max(zone.rect.y1, zone.rect.y2)
          return (
            <Rect
              key={zone.id}
              x={minX * tx.scale + tx.offsetX}
              y={minY * tx.scale + tx.offsetY}
              width={(maxX - minX) * tx.scale}
              height={(maxY - minY) * tx.scale}
              fill={ZONE_COLORS[zone.type]}
              opacity={0.3}
              stroke={ZONE_COLORS[zone.type]}
              strokeWidth={2}
            />
          )
        })}
      </Layer>
    </Stage>
  )
}
