import Link from 'next/link'
import { signIn } from '../actions'

async function loginAction(formData: FormData): Promise<void> {
  'use server'
  // signIn returns { error } on validation/auth failure or redirects on success.
  // Phase 1 does not surface errors in the UI; default error page is acceptable.
  await signIn(formData)
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold">ログイン</h1>
        <form action={loginAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700">メールアドレス</span>
            <input
              type="email"
              name="email"
              required
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700">パスワード</span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            ログイン
          </button>
        </form>
        <p className="mt-6 text-sm text-gray-600">
          アカウントをお持ちでない方は{' '}
          <Link href="/signup" className="text-blue-600 hover:underline">
            新規登録
          </Link>
        </p>
      </div>
    </main>
  )
}
