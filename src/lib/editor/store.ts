import { create } from 'zustand'
import type { EditorState, Zone, ZoneType } from './types'
import type { ParsedDxf } from '@/lib/cad/types'

type EditorActions = {
  loadDxf: (dxf: ParsedDxf) => void
  resetDxf: () => void
  addZone: (zone: Zone) => void
  removeZone: (id: string) => void
  setCurrentZoneType: (type: ZoneType) => void
  reset: () => void
}

const initialState: EditorState = {
  dxf: null,
  bbox: null,
  zones: [],
  currentZoneType: 'guest',
}

function computeBbox(walls: ParsedDxf['walls']): EditorState['bbox'] {
  if (walls.length === 0) return null
  let minX = walls[0]!.x
  let maxX = walls[0]!.x
  let minY = walls[0]!.y
  let maxY = walls[0]!.y
  for (const p of walls) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export const useEditorStore = create<EditorState & EditorActions>((set) => ({
  ...initialState,
  loadDxf: (dxf) => set({ dxf, bbox: computeBbox(dxf.walls), zones: [] }),
  resetDxf: () => set({ ...initialState }),
  addZone: (zone) => set((s) => ({ zones: [...s.zones, zone] })),
  removeZone: (id) => set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),
  setCurrentZoneType: (type) => set({ currentZoneType: type }),
  reset: () => set({ ...initialState }),
}))
