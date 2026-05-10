'use client'

import { useState } from 'react'
import { useEditorStore } from '@/lib/editor/store'
import { parsePolycamDxf } from '@/lib/cad/dxf-parser'

export function DxfDropzone() {
  const loadDxf = useEditorStore((s) => s.loadDxf)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    setPending(true)
    try {
      const text = await file.text()
      const dxf = parsePolycamDxf(text)
      if (dxf.walls.length < 3) {
        throw new Error(
          `壁ポリラインが ${dxf.walls.length} 点しか抽出できませんでした (最低 3 点必要)`,
        )
      }
      loadDxf(dxf)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-gray-300 p-8 hover:border-blue-500">
        <span className="text-sm text-gray-600">
          DXF ファイルを選択 (Polycam Room Capture が出力した DXF)
        </span>
        <input
          type="file"
          accept=".dxf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
      </label>
      {pending && <p className="text-sm text-gray-500">読み込み中...</p>}
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  )
}
