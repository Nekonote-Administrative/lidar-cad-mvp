import { describe, it, expect } from 'vitest'
import { validateAuthInput } from './validation'

describe('validateAuthInput', () => {
  it('returns error when email is empty', () => {
    const result = validateAuthInput({ email: '', password: 'longenough123' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/メールアドレス/)
    }
  })

  it('returns error when password is shorter than 8', () => {
    const result = validateAuthInput({ email: 'a@b.com', password: '1234567' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/パスワード/)
    }
  })

  it('returns ok for valid input', () => {
    const result = validateAuthInput({
      email: 'admin@example.com',
      password: 'longenough123',
    })
    expect(result.ok).toBe(true)
  })
})
