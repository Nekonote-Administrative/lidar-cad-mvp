'use client'

import { useEditorStore } from '@/lib/editor/store'
import { DxfDropzone } from '@/components/editor/DxfDropzone'

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
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          別の DXF を読み込む
        </button>
      </div>
      <p className="text-gray-600">
        DXF を読み込みました ({dxf.walls.length} 点の壁を検出)。 キャンバス描画は Task 6
        で実装予定。
      </p>
    </main>
  )
}
