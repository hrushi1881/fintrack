/**
 * Liability Amortization Calculations
 * Based on the reference payment system logic
 */

/**
 * Calculate monthly payment for a loan using the amortization formula
 * PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
 * 
 * @param principal - Loan principal amount
 * @param annualRate - Annual interest rate (e.g., 8.5 for 8.5%)
 * @param months - Number of months
 * @returns Monthly payment amount
 */
export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  months: number
): number {
  if (annualRate === 0) {
    return principal / months;
  }
  
  const monthlyRate = annualRate / 100 / 12;
  const payment =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);
  
  return Math.round(payment * 100) / 100;
}

/**
 * Calculate the number of months needed to pay off a loan
 * 
 * @param principal - Loan principal amount
 * @param annualRate - Annual interest rate
 * @param monthlyPayment - Monthly payment amount
 * @returns Number of months needed
 */
export function calculateLoanTerm(
  principal: number,
  annualRate: number,
  monthlyPayment: number
): number {
  if (annualRate === 0) {
    return Math.ceil(principal / monthlyPayment);
  }
  
  const monthlyRate = annualRate / 100 / 12;
  
  if (monthlyPayment <= principal * monthlyRate) {
    // Payment is too small, will never pay off
    return Infinity;
  }
  
  const months =
    Math.log(monthlyPayment / (monthlyPayment - principal * monthlyRate)) /
    Math.log(1 + monthlyRate);
  
  return Math.ceil(months);
}

/**
 * Calculate interest rate given principal, payment, and term
 * Uses Newton's method to solve for interest rate
 * 
 * @param principal - Loan principal amount
 * @param monthlyPayment - Monthly payment amount
 * @param months - Number of months
 * @returns Annual interest rate (e.g., 8.5 for 8.5%)
 */
export function calculateInterestRate(
  principal: number,
  monthlyPayment: number,
  months: number
): number {
  if (monthlyPayment * months <= principal) {
    // No interest
    return 0;
  }
  
  // Use Newton's method to solve for interest rate
  let rate = 0.1; // starting guess of 10% annual
  const precision = 0.0001;
  const maxIterations = 100;
  
  for (let i = 0; i < maxIterations; i++) {
    const monthlyRate = rate / 12;
    const calculatedPayment =
      (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1);
    
    const diff = calculatedPayment - monthlyPayment;
    
    if (Math.abs(diff) < precision) {
      return Math.round(rate * 100 * 100) / 100; // round to 2 decimal places
    }
    
    // Adjust rate using derivative approximation
    const rateUp = rate + 0.001;
    const rateDown = rate - 0.001;
    const paymentUp = calculateMonthlyPaymentWithRate(principal, rateUp, months);
    const paymentDown = calculateMonthlyPaymentWithRate(principal, rateDown, months);
    const derivative = (paymentUp - paymentDown) / 0.002;
    
    if (Math.abs(derivative) < 0.0001) {
      // Derivative is too small, can't converge
      break;
    }
    
    rate = rate - diff / derivative;
    
    // Clamp rate to reasonable bounds
    if (rate < 0) rate = 0.001;
    if (rate > 1) rate = 0.99; // 99% max
  }
  
  return Math.round(rate * 100 * 100) / 100;
}

/**
 * Helper function to calculate monthly payment with a specific rate
 */
function calculateMonthlyPaymentWithRate(
  principal: number,
  annualRate: number,
  months: number
): number {
  if (annualRate === 0) return principal / months;
  const monthlyRate = annualRate / 12;
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1)
  );
}

/**
 * Generate amortization schedule (all bills for a liability)
 * Uses reducing balance method with accurate interest calculations
 * 
 * @param principal - Loan principal amount
 * @param annualRate - Annual interest rate (e.g., 8.5 for 8.5%)
 * @param paymentAmount - Payment amount per period
 * @param startDate - First payment date
 * @param liabilityId - Liability ID
 * @param interestIncluded - Whether interest is included in payment amount
 * @param frequency - Payment frequency (daily, weekly, bi-weekly, monthly, quarterly, yearly)
 * @returns Array of bills
 */
export interface AmortizationBill {
  id: string;
  liabilityId: string;
  dueDate: Date;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  status: 'scheduled' | 'paid' | 'overdue' | 'cancelled';
  paymentNumber: number;
  remainingBalance: number;
  paidDate?: Date;
  paidAmount?: number;
}

export function generateAmortizationSchedule(
  principal: number,
  annualRate: number,
  paymentAmount: number,
  startDate: Date,
  liabilityId: string,
  interestIncluded: boolean = true,
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly' = 'monthly',
  startingPaymentNumber: number = 1
): AmortizationBill[] {
  const bills: AmortizationBill[] = [];
  let remainingBalance = principal;
  
  // Calculate period rate based on frequency
  const periodsPerYear = {
    daily: 365,
    weekly: 52,
    'bi-weekly': 26,
    monthly: 12,
    quarterly: 4,
    yearly: 1,
  }[frequency] || 12;
  
  const periodRate = annualRate > 0 ? annualRate / 100 / periodsPerYear : 0;
  
  let currentDate = new Date(startDate);
  let paymentNumber = startingPaymentNumber;
  
  // Calculate days to add based on frequency
  const daysToAdd = {
    daily: 1,
    weekly: 7,
    'bi-weekly': 14,
    monthly: 30,
    quarterly: 90,
    yearly: 365,
  }[frequency] || 30;
  
  while (remainingBalance > 0.01) {
    // Continue until balance is essentially zero
    // Calculate interest for this payment period
    // For non-monthly frequencies, adjust interest calculation
    const daysInPeriod = daysToAdd;
    const daysInYear = 365;
    const interestAmount = periodRate > 0
      ? Math.round(remainingBalance * periodRate * 100) / 100
      : 0;
    
    // Calculate principal
    let principalAmount: number;
    let billAmount: number;
    
    if (interestIncluded) {
      // Interest included in payment amount
      principalAmount = Math.max(0, paymentAmount - interestAmount);
      billAmount = paymentAmount;
    } else {
      // Interest separate
      principalAmount = paymentAmount;
      billAmount = paymentAmount;
    }
    
    // Last payment adjustment
    if (principalAmount >= remainingBalance) {
      principalAmount = remainingBalance;
      if (interestIncluded) {
        billAmount = principalAmount + interestAmount;
      } else {
        billAmount = principalAmount;
      }
    }
    
    // Ensure principal is not negative
    if (principalAmount < 0) {
      principalAmount = 0;
    }
    
    // Calculate actual payment
    const actualPayment = interestIncluded
      ? Math.round((principalAmount + interestAmount) * 100) / 100
      : billAmount;
    
    // Update remaining balance
    remainingBalance -= principalAmount;
    remainingBalance = Math.max(0, Math.round(remainingBalance * 100) / 100);
    
    bills.push({
      id: `${liabilityId}-bill-${paymentNumber}`,
      liabilityId,
      dueDate: new Date(currentDate),
      amount: actualPayment,
      principalAmount: Math.round(principalAmount * 100) / 100,
      interestAmount: Math.round(interestAmount * 100) / 100,
      status: 'scheduled',
      paymentNumber,
      remainingBalance,
    });
    
    // Move to next payment date
    if (frequency === 'monthly') {
      currentDate = addMonths(currentDate, 1);
    } else {
      currentDate = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + daysToAdd);
    }
    paymentNumber++;
    
    // Safety check - prevent infinite loops
    if (paymentNumber > 600) break; // max 50 years of monthly payments
    if (remainingBalance <= 0.01) break; // balance paid off
  }
  
  return bills;
}

/**
 * Add months to a date
 */
export function addMonths(date: Date, months: number): Date {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() + months);
  return newDate;
}

/**
 * Calculate total interest for a liability
 * 
 * @param bills - Array of bills
 * @returns Total interest amount
 */
export function calculateTotalInterest(bills: AmortizationBill[]): number {
  return bills.reduce((sum, bill) => sum + bill.interestAmount, 0);
}

/**
 * Calculate total interest paid so far
 * 
 * @param bills - Array of bills
 * @returns Total interest paid
 */
export function calculateInterestPaid(bills: AmortizationBill[]): number {
  return bills
    .filter(bill => bill.status === 'paid')
    .reduce((sum, bill) => sum + bill.interestAmount, 0);
}

/**
 * Calculate principal paid so far
 * 
 * @param bills - Array of bills
 * @returns Total principal paid
 */
export function calculatePrincipalPaid(bills: AmortizationBill[]): number {
  return bills
    .filter(bill => bill.status === 'paid')
    .reduce((sum, bill) => sum + bill.principalAmount, 0);
}

/**
 * Check if bill is overdue
 * 
 * @param bill - Bill to check
 * @returns True if bill is overdue
 */
export function isBillOverdue(bill: { dueDate: Date; status: string }): boolean {
  if (bill.status === 'paid' || bill.status === 'cancelled') return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dueDate = new Date(bill.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < now;
}

/**
 * Calculate days until date
 * 
 * @param date - Date to calculate from
 * @returns Number of days until date
 */
export function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const diff = targetDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Calculate options for handling extra payment
 */
export interface ExtraPaymentOption {
  type: 'reduce_payment' | 'reduce_term' | 'skip_payments' | 'reduce_principal';
  label: string;
  description: string;
  newMonthlyPayment?: number;
  newEndDate?: Date;
  interestSaved?: number;
  monthsSkipped?: number;
}

export interface LiabilityInfo {
  id: string;
  currentBalance: number;
  originalAmount: number;
  monthlyPayment: number;
  interestRate: number;
  endDate: Date;
  bills: AmortizationBill[];
}

export function calculateExtraPaymentOptions(
  liability: LiabilityInfo,
  extraAmount: number
): ExtraPaymentOption[] {
  const options: ExtraPaymentOption[] = [];
  const remainingBills = liability.bills.filter(
    b => b.status === 'scheduled' || b.status === 'overdue'
  );
  
  if (remainingBills.length === 0) return options;
  
  const currentBalance = liability.currentBalance;
  const newBalance = Math.max(0, currentBalance - extraAmount);
  const monthlyRate = liability.interestRate / 100 / 12;
  
  // Option 1: Reduce Monthly Payment (keep same end date)
  const remainingMonths = remainingBills.length;
  const newPayment = calculateMonthlyPayment(
    newBalance,
    liability.interestRate,
    remainingMonths
  );
  
  if (newPayment < liability.monthlyPayment && remainingMonths > 0) {
    const oldTotalInterest = calculateTotalInterest(remainingBills);
    const newSchedule = generateAmortizationSchedule(
      newBalance,
      liability.interestRate,
      newPayment,
      remainingBills[0].dueDate,
      liability.id,
      true
    );
    const newTotalInterest = calculateTotalInterest(newSchedule);
    
    options.push({
      type: 'reduce_payment',
      label: 'Reduce Monthly Payment',
      description: `Lower your payment to ${formatCurrency(newPayment)} while keeping the same end date`,
      newMonthlyPayment: newPayment,
      newEndDate: liability.endDate,
      interestSaved: oldTotalInterest - newTotalInterest,
    });
  }
  
  // Option 2: Reduce Term (keep same payment)
  const newMonths = calculateLoanTerm(
    newBalance,
    liability.interestRate,
    liability.monthlyPayment
  );
  
  if (newMonths < remainingMonths && newMonths !== Infinity) {
    const monthsSaved = remainingMonths - newMonths;
    const newEndDate = addMonths(remainingBills[0].dueDate, newMonths - 1);
    const oldTotalInterest = calculateTotalInterest(remainingBills);
    const newSchedule = generateAmortizationSchedule(
      newBalance,
      liability.interestRate,
      liability.monthlyPayment,
      remainingBills[0].dueDate,
      liability.id,
      true
    );
    const newTotalInterest = calculateTotalInterest(newSchedule);
    
    options.push({
      type: 'reduce_term',
      label: 'Reduce Loan Term',
      description: `Finish ${monthsSaved} months earlier (${formatDate(newEndDate)})`,
      newMonthlyPayment: liability.monthlyPayment,
      newEndDate,
      interestSaved: oldTotalInterest - newTotalInterest,
    });
  }
  
  // Option 3: Skip Next Payments
  const paymentsSkipped = Math.floor(extraAmount / liability.monthlyPayment);
  if (paymentsSkipped > 0 && paymentsSkipped < remainingBills.length) {
    const nextDueDate = addMonths(
      remainingBills[0].dueDate,
      paymentsSkipped
    );
    
    options.push({
      type: 'skip_payments',
      label: 'Skip Next Payments',
      description: `Pre-pay for next ${paymentsSkipped} month(s). No payment due until ${formatDate(nextDueDate)}`,
      monthsSkipped: paymentsSkipped,
      newEndDate: liability.endDate,
      interestSaved: 0, // Actually costs more interest
    });
  }
  
  // Option 4: Just Reduce Principal
  options.push({
    type: 'reduce_principal',
    label: 'Just Reduce Principal',
    description: `Keep everything the same but owe ${formatCurrency(extraAmount)} less`,
    newMonthlyPayment: liability.monthlyPayment,
    newEndDate: liability.endDate,
    interestSaved: 0,
  });
  
  return options;
}

/**
 * Calculate impact of editing liability parameters
 */
export interface EditImpact {
  currentPayment: number;
  newPayment: number;
  currentEndDate: Date;
  newEndDate: Date;
  currentTotalInterest: number;
  newTotalInterest: number;
  interestDifference: number;
}

export function calculateEditImpact(
  liability: LiabilityInfo,
  newAmount?: number,
  newRate?: number,
  newEndDate?: Date,
  newPayment?: number
): EditImpact {
  const currentTotalInterest = calculateTotalInterest(liability.bills);
  const remainingBills = liability.bills.filter(
    b => b.status === 'scheduled' || b.status === 'overdue'
  );
  const remainingMonths = remainingBills.length;
  
  let actualNewAmount = newAmount ?? liability.currentBalance;
  let actualNewRate = newRate ?? liability.interestRate;
  let actualNewPayment = newPayment ?? liability.monthlyPayment;
  let actualNewEndDate = newEndDate ?? liability.endDate;
  
  // Calculate based on what changed
  if (newAmount && !newPayment && !newEndDate) {
    // Amount changed, keep payment same, recalculate end date
    const newMonths = calculateLoanTerm(
      actualNewAmount,
      actualNewRate,
      actualNewPayment
    );
    if (newMonths !== Infinity && remainingBills.length > 0) {
      actualNewEndDate = addMonths(remainingBills[0].dueDate, newMonths - 1);
    }
  } else if (newEndDate && !newPayment) {
    // End date changed, recalculate payment
    const monthsDiff = Math.ceil(
      (newEndDate.getTime() - (remainingBills[0]?.dueDate.getTime() || Date.now())) /
        (30 * 24 * 60 * 60 * 1000)
    );
    if (monthsDiff > 0) {
      actualNewPayment = calculateMonthlyPayment(
        actualNewAmount,
        actualNewRate,
        monthsDiff
      );
    }
  } else if (newPayment && !newEndDate) {
    // Payment changed, recalculate end date
    const newMonths = calculateLoanTerm(
      actualNewAmount,
      actualNewRate,
      actualNewPayment
    );
    if (newMonths !== Infinity && remainingBills.length > 0) {
      actualNewEndDate = addMonths(remainingBills[0].dueDate, newMonths - 1);
    }
  }
  
  // Generate new schedule to calculate new total interest
  const newSchedule = generateAmortizationSchedule(
    actualNewAmount,
    actualNewRate,
    actualNewPayment,
    remainingBills[0]?.dueDate || new Date(),
    liability.id,
    true
  );
  const newTotalInterest = calculateTotalInterest(newSchedule);
  
  return {
    currentPayment: liability.monthlyPayment,
    newPayment: actualNewPayment,
    currentEndDate: liability.endDate,
    newEndDate: actualNewEndDate,
    currentTotalInterest,
    newTotalInterest,
    interestDifference: newTotalInterest - currentTotalInterest,
  };
}

/**
 * Format currency (simple helper)
 */
function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/**
 * Format date (simple helper)
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

