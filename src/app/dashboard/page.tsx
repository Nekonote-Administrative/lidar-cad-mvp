import Link from 'next/link'

export default function DashboardPage() {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-bold">プロジェクト一覧</h1>
      <p className="mb-6 text-gray-600">
        Phase 3 (現状): DXF をアップロードして 1 件の図面をその場で編集できます。
        プロジェクトの保存機能は Phase 5 で追加予定です。
      </p>
      <Link
        href="/dashboard/editor"
        className="inline-block rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
      >
        新しい図面を編集する
      </Link>
    </main>
  )
}
