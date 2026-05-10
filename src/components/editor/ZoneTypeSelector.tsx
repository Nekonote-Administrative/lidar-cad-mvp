'use client'

import { useEditorStore } from '@/lib/editor/store'
import { ZONE_COLORS, ZONE_LABELS, type ZoneType } from '@/lib/editor/types'

const TYPES: ZoneType[] = ['business', 'guest', 'kitchen']

export function ZoneTypeSelector() {
  const current = useEditorStore((s) => s.currentZoneType)
  const set = useEditorStore((s) => s.setCurrentZoneType)
  return (
    <div className="mb-2 flex gap-2">
      {TYPES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => set(t)}
          className={`rounded border px-3 py-1 text-sm ${
            current === t ? 'border-2 font-bold' : 'border-gray-300'
          }`}
          style={{
            color: ZONE_COLORS[t],
            borderColor: current === t ? ZONE_COLORS[t] : undefined,
          }}
        >
          {ZONE_LABELS[t]}
        </button>
      ))}
    </div>
  )
}
