/**
 * Smart Payment Suggestions Engine
 * Calculates intelligent payment suggestions based on cycle payment history
 */

import { Cycle } from './cycles';

export interface PaymentSuggestion {
  suggestedAmount: number;
  reason: string;
  explanation: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface SuggestionContext {
  expectedAmount: number;
  previousCycles: Cycle[];
  currentCycle: Cycle | null;
  outstandingBalance: number;
  interestRate?: number;
}

/**
 * Calculate smart payment suggestion based on cycle history
 */
export function calculateSmartSuggestion(context: SuggestionContext): PaymentSuggestion | null {
  const { expectedAmount, previousCycles, currentCycle, outstandingBalance, interestRate } = context;

  // If no previous cycles, return expected amount
  if (previousCycles.length === 0) {
    return {
      suggestedAmount: expectedAmount,
      reason: 'first_payment',
      explanation: 'This is your first payment. Pay the expected amount.',
      urgency: 'low',
    };
  }

  // Analyze payment patterns
  const paidCycles = previousCycles.filter(c => 
    c.status === 'paid_on_time' || 
    c.status === 'paid_late' || 
    c.status === 'overpaid'
  );

  const underpaidCycles = previousCycles.filter(c => 
    c.status === 'underpaid' || 
    c.status === 'partial'
  );

  const missedCycles = previousCycles.filter(c => c.status === 'not_paid');

  // Calculate average payment
  const averagePayment = paidCycles.length > 0
    ? paidCycles.reduce((sum, c) => sum + c.actualAmount, 0) / paidCycles.length
    : expectedAmount;

  // Calculate total shortfall from underpaid cycles
  const totalShortfall = underpaidCycles.reduce((sum, c) => {
    const shortfall = c.expectedAmount - c.actualAmount;
    return sum + (shortfall > 0 ? shortfall : 0);
  }, 0);

  // Calculate total missed amount
  const totalMissed = missedCycles.reduce((sum, c) => sum + c.expectedAmount, 0);

  // Scenario 1: User has been consistently underpaying
  if (underpaidCycles.length >= 2 && totalShortfall > 0) {
    const catchUpAmount = expectedAmount + (totalShortfall / 2); // Suggest catching up over 2 cycles
    return {
      suggestedAmount: Math.ceil(catchUpAmount),
      reason: 'catch_up',
      explanation: `You've underpaid in ${underpaidCycles.length} cycles. Pay ₹${Math.ceil(catchUpAmount)} to catch up gradually.`,
      urgency: 'medium',
    };
  }

  // Scenario 2: User has missed payments
  if (missedCycles.length > 0 && totalMissed > 0) {
    const catchUpAmount = expectedAmount + (totalMissed / Math.max(2, missedCycles.length));
    return {
      suggestedAmount: Math.ceil(catchUpAmount),
      reason: 'missed_payments',
      explanation: `You've missed ${missedCycles.length} payment(s). Pay ₹${Math.ceil(catchUpAmount)} to catch up.`,
      urgency: 'high',
    };
  }

  // Scenario 3: User consistently pays more (they might want to continue)
  if (paidCycles.length >= 3) {
    const overpaidCount = paidCycles.filter(c => c.status === 'overpaid').length;
    if (overpaidCount >= 2) {
      const avgOverpayment = paidCycles
        .filter(c => c.status === 'overpaid')
        .reduce((sum, c) => sum + (c.actualAmount - c.expectedAmount), 0) / overpaidCount;
      
      return {
        suggestedAmount: Math.ceil(expectedAmount + avgOverpayment),
        reason: 'consistent_overpayment',
        explanation: `You've been paying extra. Continue with ₹${Math.ceil(expectedAmount + avgOverpayment)} to pay off faster.`,
        urgency: 'low',
      };
    }
  }

  // Scenario 4: User pays late frequently - suggest paying early/on-time
  const latePayments = previousCycles.filter(c => c.status === 'paid_late').length;
  if (latePayments >= 2 && previousCycles.length >= 3) {
    return {
      suggestedAmount: expectedAmount,
      reason: 'late_payment_reminder',
      explanation: `You've paid late ${latePayments} times. Pay ₹${expectedAmount} on time to avoid interest charges.`,
      urgency: 'medium',
    };
  }

  // Scenario 5: High interest rate - suggest paying more to save interest
  if (interestRate && interestRate > 10 && outstandingBalance > expectedAmount * 10) {
    const extraAmount = expectedAmount * 0.2; // Suggest 20% extra
    return {
      suggestedAmount: Math.ceil(expectedAmount + extraAmount),
      reason: 'high_interest',
      explanation: `High interest rate (${interestRate}%). Pay ₹${Math.ceil(expectedAmount + extraAmount)} to save on interest.`,
      urgency: 'medium',
    };
  }

  // Scenario 6: Near payoff - suggest paying off completely
  if (outstandingBalance <= expectedAmount * 1.5) {
    return {
      suggestedAmount: Math.ceil(outstandingBalance),
      reason: 'near_payoff',
      explanation: `You're close to paying off! Pay ₹${Math.ceil(outstandingBalance)} to clear the debt completely.`,
      urgency: 'low',
    };
  }

  // Default: Return expected amount
  return {
    suggestedAmount: expectedAmount,
    reason: 'standard',
    explanation: `Pay the expected amount of ₹${expectedAmount}.`,
    urgency: 'low',
  };
}

/**
 * Calculate suggested amount for a specific cycle
 */
export function getCycleSuggestion(
  cycle: Cycle,
  previousCycles: Cycle[],
  expectedAmount: number,
  outstandingBalance: number,
  interestRate?: number
): PaymentSuggestion | null {
  return calculateSmartSuggestion({
    expectedAmount,
    previousCycles,
    currentCycle: cycle,
    outstandingBalance,
    interestRate,
  });
}

/**
 * Format suggestion for display
 */
export function formatSuggestion(suggestion: PaymentSuggestion): {
  amount: string;
  message: string;
  color: string;
} {
  const urgencyColors = {
    low: '#10B981', // Green
    medium: '#F59E0B', // Orange
    high: '#EF4444', // Red
  };

  return {
    amount: `₹${suggestion.suggestedAmount.toLocaleString('en-IN')}`,
    message: suggestion.explanation,
    color: urgencyColors[suggestion.urgency],
  };
}

