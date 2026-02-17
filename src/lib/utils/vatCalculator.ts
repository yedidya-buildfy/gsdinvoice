/**
 * Calculate VAT amount in agorot from total amount (VAT-inclusive price)
 * Israeli VAT is calculated as: VAT = Total * (vatRate / (100 + vatRate))
 * This extracts VAT from an inclusive price
 */
export function calculateVatFromTotal(
  totalAgorot: number,
  vatPercentage: number
): number {
  if (!vatPercentage || vatPercentage <= 0) return 0
  // VAT = Total * (rate / (100 + rate))
  const vatAmount = Math.abs(totalAgorot) * (vatPercentage / (100 + vatPercentage))
  return Math.round(vatAmount)
}

/**
 * Get the effective amount for VAT calculation.
 * For foreign currency transactions, amount_agorot may be 0 - use foreign_amount_cents instead.
 */
export function getEffectiveAmount(tx: { amount_agorot: number; foreign_amount_cents?: number | null }): number {
  if (tx.foreign_amount_cents != null && tx.foreign_amount_cents !== 0) {
    return tx.foreign_amount_cents
  }
  return tx.amount_agorot
}

/**
 * Calculate the net amount (before VAT) from a VAT-inclusive total
 */
export function calculateNetFromTotal(
  totalAgorot: number,
  vatPercentage: number
): number {
  if (!vatPercentage || vatPercentage <= 0) return totalAgorot
  // Net = Total / (1 + rate/100) = Total * 100 / (100 + rate)
  const netAmount = Math.abs(totalAgorot) * (100 / (100 + vatPercentage))
  return Math.round(netAmount)
}
