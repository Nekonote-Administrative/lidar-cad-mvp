'use client'

import { useState } from 'react'
import { Stage, Layer, Line, Rect } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useEditorStore } from '@/lib/editor/store'
import { ZONE_COLORS } from '@/lib/editor/types'

const CANVAS_PADDING = 40
const CANVAS_W = 800
const CANVAS_H = 600
const MIN_ZONE_SIZE_MM = 100 // ドラッグ最小サイズ (mm)

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

type DragState = {
  startX: number
  startY: number
  endX: number
  endY: number
}

export function DxfCanvas() {
  const dxf = useEditorStore((s) => s.dxf)
  const zones = useEditorStore((s) => s.zones)
  const addZone = useEditorStore((s) => s.addZone)
  const currentZoneType = useEditorStore((s) => s.currentZoneType)
  const tx = useFitTransform()
  const [drag, setDrag] = useState<DragState | null>(null)

  if (!dxf || !tx) return null

  const wallPoints = dxf.walls.flatMap((p) => [
    p.x * tx.scale + tx.offsetX,
    p.y * tx.scale + tx.offsetY,
  ])

  const canvasToMm = (px: number, py: number) => ({
    x: (px - tx.offsetX) / tx.scale,
    y: (py - tx.offsetY) / tx.scale,
  })

  const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    setDrag({ startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y })
  }
  const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!drag) return
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    setDrag({ ...drag, endX: pos.x, endY: pos.y })
  }
  const onMouseUp = () => {
    if (!drag) return
    const a = canvasToMm(drag.startX, drag.startY)
    const b = canvasToMm(drag.endX, drag.endY)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    if (w >= MIN_ZONE_SIZE_MM && h >= MIN_ZONE_SIZE_MM) {
      addZone({
        id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: currentZoneType,
        rect: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
      })
    }
    setDrag(null)
  }

  return (
    <Stage
      width={CANVAS_W}
      height={CANVAS_H}
      className="cursor-crosshair border border-gray-200"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
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
        {/* ドラッグ中プレビュー (現在の zone type 色) */}
        {drag && (
          <Rect
            x={Math.min(drag.startX, drag.endX)}
            y={Math.min(drag.startY, drag.endY)}
            width={Math.abs(drag.endX - drag.startX)}
            height={Math.abs(drag.endY - drag.startY)}
            fill={ZONE_COLORS[currentZoneType]}
            opacity={0.2}
            dash={[6, 4]}
            stroke={ZONE_COLORS[currentZoneType]}
            strokeWidth={1}
          />
        )}
      </Layer>
    </Stage>
  )
}
