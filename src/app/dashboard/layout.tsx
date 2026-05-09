import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '../(auth)/actions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <Link href="/dashboard" className="text-lg font-bold">
          LiDAR×AI 自動作図
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">{user?.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50"
            >
              サインアウト
            </button>
          </form>
        </div>
      </header>
      <div className="p-6">{children}</div>
    </div>
  )
}
