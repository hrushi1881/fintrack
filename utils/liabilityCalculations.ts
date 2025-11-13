/**
 * Calculate principal and interest breakdown for a liability payment
 * Uses reducing balance method
 */

export interface PaymentBreakdown {
  totalAmount: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

/**
 * Calculate payment breakdown for a liability payment
 * @param paymentAmount - Amount being paid
 * @param currentBalance - Current liability balance
 * @param annualInterestRate - Annual interest rate (e.g., 8.5 for 8.5%)
 * @param paymentDate - Date of payment (optional, for accrued interest calculation)
 * @param lastPaymentDate - Date of last payment (optional, for accrued interest calculation)
 * @returns Payment breakdown with principal, interest, and remaining balance
 */
export function calculatePaymentBreakdown(
  paymentAmount: number,
  currentBalance: number,
  annualInterestRate: number,
  paymentDate?: Date,
  lastPaymentDate?: Date
): PaymentBreakdown {
  if (paymentAmount <= 0) {
    return {
      totalAmount: 0,
      principal: 0,
      interest: 0,
      remainingBalance: currentBalance,
    };
  }

  // Calculate monthly interest rate
  const monthlyRate = annualInterestRate > 0 ? annualInterestRate / 12 / 100 : 0;

  // Calculate interest for this payment (on current balance)
  // If dates are provided, calculate accrued interest based on days between payments
  let interest = 0;
  if (monthlyRate > 0) {
    if (paymentDate && lastPaymentDate) {
      // Calculate days between payments
      const daysBetween = Math.max(1, Math.floor((paymentDate.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24)));
      const daysInMonth = 30; // Approximate
      interest = currentBalance * monthlyRate * (daysBetween / daysInMonth);
    } else {
      // Standard monthly interest
      interest = currentBalance * monthlyRate;
    }
  }

  // Calculate principal (payment minus interest)
  const principal = Math.min(paymentAmount - interest, currentBalance);

  // Calculate remaining balance
  const remainingBalance = Math.max(0, currentBalance - principal);

  // If payment is more than balance + interest, adjust
  const totalOwed = currentBalance + interest;
  if (paymentAmount >= totalOwed) {
    // Payment covers everything
    return {
      totalAmount: paymentAmount,
      principal: currentBalance,
      interest: interest,
      remainingBalance: 0,
    };
  }

  return {
    totalAmount: paymentAmount,
    principal: Math.max(0, principal),
    interest: Math.max(0, interest),
    remainingBalance: Math.max(0, remainingBalance),
  };
}

/**
 * Calculate approximate number of payments remaining
 * @param currentBalance - Current liability balance
 * @param monthlyPayment - Monthly payment amount
 * @param annualInterestRate - Annual interest rate
 * @returns Approximate number of payments remaining
 */
export function calculateRemainingPayments(
  currentBalance: number,
  monthlyPayment: number,
  annualInterestRate: number
): number {
  if (monthlyPayment <= 0) return 0;
  if (currentBalance <= 0) return 0;

  const monthlyRate = annualInterestRate > 0 ? annualInterestRate / 12 / 100 : 0;

  if (monthlyRate === 0) {
    // No interest, simple calculation
    return Math.ceil(currentBalance / monthlyPayment);
  }

  // Use amortization formula to calculate number of payments
  // n = -log(1 - (P * r) / A) / log(1 + r)
  // Where:
  // n = number of payments
  // P = principal (current balance)
  // r = monthly rate
  // A = monthly payment

  const numerator = monthlyPayment;
  const denominator = currentBalance * monthlyRate;

  if (denominator >= numerator) {
    // Interest is greater than or equal to payment, will never pay off
    return Infinity;
  }

  const ratio = 1 - (numerator / denominator);
  if (ratio <= 0) {
    return Infinity;
  }

  const n = -Math.log(ratio) / Math.log(1 + monthlyRate);
  return Math.ceil(n);
}

/**
 * Calculate total interest that will be paid over remaining term
 * @param currentBalance - Current liability balance
 * @param monthlyPayment - Monthly payment amount
 * @param annualInterestRate - Annual interest rate
 * @returns Total interest that will be paid
 */
export function calculateTotalInterest(
  currentBalance: number,
  monthlyPayment: number,
  annualInterestRate: number
): number {
  if (monthlyPayment <= 0) return 0;
  if (currentBalance <= 0) return 0;

  const monthlyRate = annualInterestRate > 0 ? annualInterestRate / 12 / 100 : 0;
  if (monthlyRate === 0) return 0;

  const numberOfPayments = calculateRemainingPayments(currentBalance, monthlyPayment, annualInterestRate);
  if (numberOfPayments === Infinity) return Infinity;

  const totalPayments = numberOfPayments * monthlyPayment;
  return totalPayments - currentBalance;
}

