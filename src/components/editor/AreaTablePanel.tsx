'use client'

import { useMemo } from 'react'
import { useEditorStore } from '@/lib/editor/store'
import { aggregateZoneAreas } from '@/lib/editor/zone-area'
import { ZONE_COLORS, ZONE_LABELS, type ZoneType } from '@/lib/editor/types'
import type { AreaTable } from '@/lib/cad/types'

const TYPES: ZoneType[] = ['business', 'guest', 'kitchen']

type Summary =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ok'
      byType: Record<ZoneType, AreaTable[]>
      totalsByType: Record<ZoneType, number>
    }

export function AreaTablePanel() {
  const zones = useEditorStore((s) => s.zones)
  const removeZone = useEditorStore((s) => s.removeZone)

  const summary: Summary = useMemo(() => {
    if (zones.length === 0) return { kind: 'empty' }
    try {
      const r = aggregateZoneAreas(zones)
      return { kind: 'ok', byType: r.byType, totalsByType: r.totalsByType }
    } catch (err) {
      return { kind: 'error', message: (err as Error).message }
    }
  }, [zones])

  if (summary.kind === 'empty') {
    return (
      <aside className="w-80 rounded border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="mb-2 text-lg font-bold">求積表</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          ゾーンが未設定です。 キャンバスでドラッグして追加してください。
        </p>
      </aside>
    )
  }

  if (summary.kind === 'error') {
    return (
      <aside className="w-80 rounded border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
        <h2 className="mb-2 text-lg font-bold text-red-700 dark:text-red-400">整合性エラー</h2>
        <p className="text-sm">{summary.message}</p>
      </aside>
    )
  }

  // 個別ゾーン表示用に「同タイプ内での通し番号」を求める
  // zones は元の追加順、 summary.byType は同じく追加順 (aggregateZoneAreas が for-of で push しているため)
  // よって zones[i].type で各タイプ内の i 番目 = byType[type] の i 番目に対応
  const indexByZoneId = new Map<string, number>()
  const counters: Record<ZoneType, number> = { business: 0, guest: 0, kitchen: 0 }
  for (const z of zones) {
    indexByZoneId.set(z.id, counters[z.type]++)
  }

  return (
    <aside className="w-80 rounded border border-gray-200 p-4 dark:border-gray-700">
      <h2 className="mb-2 text-lg font-bold">求積表</h2>
      <ul className="mb-4 space-y-1 text-sm">
        {TYPES.map((t) => (
          <li key={t} className="flex justify-between">
            <span style={{ color: ZONE_COLORS[t] }}>{ZONE_LABELS[t]} 合計</span>
            <span>{summary.totalsByType[t].toFixed(2)} m²</span>
          </li>
        ))}
      </ul>
      <h3 className="mb-2 text-sm font-bold">個別ゾーン</h3>
      {zones.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">なし</p>
      ) : (
        <ul className="space-y-2">
          {zones.map((z) => {
            const idx = indexByZoneId.get(z.id) ?? 0
            const table = summary.byType[z.type][idx]
            return (
              <li key={z.id} className="flex items-center justify-between gap-2 text-sm">
                <span style={{ color: ZONE_COLORS[z.type] }}>
                  {ZONE_LABELS[z.type]} {table ? `${table.total.toFixed(2)} m²` : '計算中'}
                </span>
                <button
                  type="button"
                  onClick={() => removeZone(z.id)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  削除
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
