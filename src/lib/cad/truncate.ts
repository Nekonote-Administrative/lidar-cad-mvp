/**
 * value を fractionDigits 桁で切り捨てる (toward zero)。
 * ADR-0008: 「個別計算後切り捨て、 銀行家丸め / 四捨五入は使わない」
 *
 * @example
 *   truncateToFixed(1.239, 2)  // => 1.23
 *   truncateToFixed(-1.239, 2) // => -1.23
 */
export function truncateToFixed(value: number, fractionDigits: number): number {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0) {
    throw new Error(`fractionDigits must be a non-negative integer, got ${fractionDigits}`)
  }
  const factor = 10 ** fractionDigits
  return Math.trunc(value * factor) / factor
}
