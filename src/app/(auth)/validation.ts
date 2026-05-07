export type ValidateInput = { email: string; password: string }
export type ValidateResult = { ok: true } | { ok: false; error: string }

export function validateAuthInput(input: ValidateInput): ValidateResult {
  const email = input.email.trim()
  if (email.length === 0) {
    return { ok: false, error: 'メールアドレスを入力してください' }
  }
  if (!email.includes('@')) {
    return { ok: false, error: 'メールアドレスの形式が正しくありません' }
  }
  if (input.password.length < 8) {
    return { ok: false, error: 'パスワードは 8 文字以上で入力してください' }
  }
  return { ok: true }
}
