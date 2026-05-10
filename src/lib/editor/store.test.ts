import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from './store'
import { rectToPolygon } from './types'
import type { ParsedDxf } from '@/lib/cad/types'

const mockDxf: ParsedDxf = {
  walls: [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ],
  doors: [],
  windows: [],
  meta: { units: 'mm' },
}

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  it('loadDxf sets dxf and computes bbox', () => {
    useEditorStore.getState().loadDxf(mockDxf)
    const s = useEditorStore.getState()
    expect(s.dxf).toBe(mockDxf)
    expect(s.bbox).toEqual({ minX: 0, minY: 0, maxX: 4000, maxY: 3000 })
    expect(s.zones).toHaveLength(0)
  })

  it('addZone appends to zones', () => {
    useEditorStore.getState().loadDxf(mockDxf)
    useEditorStore.getState().addZone({
      id: 'z1',
      type: 'guest',
      rect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
    })
    expect(useEditorStore.getState().zones).toHaveLength(1)
  })

  it('removeZone drops the zone with matching id', () => {
    useEditorStore.getState().addZone({
      id: 'z1',
      type: 'guest',
      rect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
    })
    useEditorStore.getState().addZone({
      id: 'z2',
      type: 'business',
      rect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
    })
    useEditorStore.getState().removeZone('z1')
    const zones = useEditorStore.getState().zones
    expect(zones).toHaveLength(1)
    expect(zones[0]!.id).toBe('z2')
  })

  it('setCurrentZoneType updates the type', () => {
    useEditorStore.getState().setCurrentZoneType('kitchen')
    expect(useEditorStore.getState().currentZoneType).toBe('kitchen')
  })

  it('rectToPolygon normalizes corner order regardless of input order', () => {
    const poly = rectToPolygon({ x1: 4000, y1: 3000, x2: 0, y2: 0 })
    expect(poly).toEqual([
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ])
  })

  it('resetDxf returns to initial state', () => {
    useEditorStore.getState().loadDxf(mockDxf)
    useEditorStore.getState().addZone({
      id: 'z1',
      type: 'guest',
      rect: { x1: 0, y1: 0, x2: 1000, y2: 1000 },
    })
    useEditorStore.getState().resetDxf()
    const s = useEditorStore.getState()
    expect(s.dxf).toBeNull()
    expect(s.bbox).toBeNull()
    expect(s.zones).toHaveLength(0)
  })
})
