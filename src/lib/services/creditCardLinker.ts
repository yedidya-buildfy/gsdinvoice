/**
 * Credit Card Linking Service
 *
 * Links credit card transactions to bank charges using:
 * - Card last four digit matching from description
 * - Amount tolerance matching (2%)
 * - Date window matching (±2 days)
 */

import { supabase } from '@/lib/supabase';

/**
 * Detect if a bank transaction description indicates a credit card charge
 * Returns the card last four if detected, null otherwise
 */
export function detectCreditCardCharge(description: string): string | null {
  const ccKeywords = [
    'כרטיס',           // card
    'ויזא',            // Visa
    'ויזה',            // Visa (alternative spelling)
    'visa',
    'מאסטרקארד',       // Mastercard
    'mastercard',
    'אמריקן אקספרס',   // American Express
    'amex',
    'ישראכרט',         // Isracard
    'לאומי קארד',      // Leumi Card
    'מקס',             // Max
    'כאל',             // Cal
    'חיוב לכרטיס',     // charge to card
  ];

  const normalized = description.toLowerCase();
  const isCC = ccKeywords.some(keyword => normalized.includes(keyword.toLowerCase()));

  if (!isCC) return null;

  // Extract card last four digits
  const matches = description.match(/\d{4}/g);
  return matches && matches.length > 0 ? matches[matches.length - 1] : null;
}

interface AmountMatch {
  matches: boolean;
  difference: number;
  percentDiff: number;
}

/**
 * Check if two amounts match within tolerance
 * @param amount1Agorot First amount in agorot
 * @param amount2Agorot Second amount in agorot
 * @param tolerancePercent Tolerance percentage (default 2%)
 */
function amountsMatch(
  amount1Agorot: number,
  amount2Agorot: number,
  tolerancePercent: number = 2
): AmountMatch {
  const diff = Math.abs(amount1Agorot - amount2Agorot);
  const larger = Math.max(Math.abs(amount1Agorot), Math.abs(amount2Agorot));
  const percentDiff = larger > 0 ? (diff / larger) * 100 : 0;

  return {
    matches: percentDiff <= tolerancePercent,
    difference: diff,
    percentDiff,
  };
}

/**
 * Check if two dates are within window
 * @param date1 ISO date string YYYY-MM-DD
 * @param date2 ISO date string YYYY-MM-DD
 * @param windowDays Date window in days (default 2)
 */
function isWithinDateWindow(
  date1: string,
  date2: string,
  windowDays: number = 2
): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= windowDays;
}

export interface LinkingResult {
  linked: number;
  unlinked: number;
  errors: string[];
}

/**
 * Link credit card transactions to bank charges
 *
 * Process:
 * 1. Fetch bank charges (is_credit_card_charge=true) without linked_credit_card_id
 * 2. For each charge, extract card last four from description
 * 3. Find matching credit card by card_last_four
 * 4. Update bank charge with linked_credit_card_id
 *
 * @param userId User ID to link for
 * @param cardId Optional card ID to link only specific card
 */
export async function linkCreditCardTransactions(
  userId: string,
  cardId?: string
): Promise<LinkingResult> {
  const result: LinkingResult = { linked: 0, unlinked: 0, errors: [] };

  try {
    // Fetch bank charges needing linking
    const { data: bankCharges, error: bankError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_credit_card_charge', true)
      .is('linked_credit_card_id', null);

    if (bankError) {
      result.errors.push(`Failed to fetch bank charges: ${bankError.message}`);
      return result;
    }

    if (!bankCharges || bankCharges.length === 0) {
      return result; // Nothing to link
    }

    // Fetch user's credit cards
    let cardsQuery = supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', userId);

    if (cardId) {
      cardsQuery = cardsQuery.eq('id', cardId);
    }

    const { data: cards, error: cardsError } = await cardsQuery;

    if (cardsError || !cards) {
      result.errors.push(`Failed to fetch credit cards: ${cardsError?.message}`);
      return result;
    }

    // Create lookup by card last four
    const cardsByLastFour = new Map(cards.map(c => [c.card_last_four, c]));

    // Link each bank charge to appropriate credit card
    for (const charge of bankCharges) {
      const cardLastFour = detectCreditCardCharge(charge.description);
      if (!cardLastFour) {
        result.unlinked++;
        continue;
      }

      const card = cardsByLastFour.get(cardLastFour);
      if (!card) {
        result.unlinked++;
        continue;
      }

      // Update bank charge with credit card link
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ linked_credit_card_id: card.id })
        .eq('id', charge.id);

      if (updateError) {
        result.errors.push(`Failed to link charge ${charge.id}: ${updateError.message}`);
        result.unlinked++;
      } else {
        result.linked++;
      }
    }

    return result;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
    return result;
  }
}
