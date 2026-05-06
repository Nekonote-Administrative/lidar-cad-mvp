import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="mb-4 text-3xl font-bold">LiDAR×AI 自動作図 (β)</h1>
      <p className="mb-8 text-gray-600">
        風営法 / 深夜酒類届出の図面を AI 補助で自動生成
      </p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          ログイン
        </Link>
        <Link
          href="/signup"
          className="rounded border border-blue-600 px-6 py-2 text-blue-600 hover:bg-blue-50"
        >
          新規登録
        </Link>
      </div>
    </main>
  )
}
