import Link from 'next/link'
import { signUp } from '../actions'

async function signupAction(formData: FormData): Promise<void> {
  'use server'
  // signUp returns { error } on validation/auth failure or redirects on success.
  // Phase 1 does not surface errors in the UI; default error page is acceptable.
  await signUp(formData)
}

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold">新規登録</h1>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          14 日間の無料トライアルをご利用いただけます。
        </p>
        <form action={signupAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700 dark:text-gray-200">メールアドレス</span>
            <input
              type="email"
              name="email"
              required
              className="rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700 dark:text-gray-200">
              パスワード (8 文字以上)
            </span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              className="rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            登録してトライアル開始
          </button>
        </form>
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-blue-600 hover:underline dark:text-blue-400">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  )
}
