'use client'

import dynamic from 'next/dynamic'
import { useEditorStore } from '@/lib/editor/store'
import { DxfDropzone } from '@/components/editor/DxfDropzone'
import { ZoneTypeSelector } from '@/components/editor/ZoneTypeSelector'
import { AreaTablePanel } from '@/components/editor/AreaTablePanel'

const DxfCanvas = dynamic(() => import('@/components/editor/DxfCanvas').then((m) => m.DxfCanvas), {
  ssr: false,
  loading: () => (
    <p className="text-sm text-gray-500 dark:text-gray-400">キャンバスを読み込み中...</p>
  ),
})

export default function EditorPage() {
  const dxf = useEditorStore((s) => s.dxf)
  const reset = useEditorStore((s) => s.resetDxf)

  if (!dxf) {
    return (
      <main className="p-6">
        <h1 className="mb-4 text-2xl font-bold">図面エディタ</h1>
        <DxfDropzone />
      </main>
    )
  }

  return (
    <main className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">図面エディタ</h1>
        <button
          type="button"
          onClick={reset}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
        >
          別の DXF を読み込む
        </button>
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <ZoneTypeSelector />
          <DxfCanvas />
        </div>
        <AreaTablePanel />
      </div>
    </main>
  )
}
