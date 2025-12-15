/**
 * Payment Impact Calculations
 * Calculates the impact of a payment on liability balances and dates
 */

import { calculatePaymentBreakdown } from './liabilityCalculations';
import { calculateLoanTerm, addMonths } from './liabilityAmortization';

export interface PaymentImpact {
  currentBalance: number;
  newBalance: number;
  principalPaid: number;
  interestPaid: number;
  feesPaid: number;
  nextDueDate?: string;
  newNextDueDate?: string;
  payoffDate?: string;
  newPayoffDate?: string;
  daysAhead?: number; // How many days ahead of schedule
  monthsReduced?: number; // How many months reduced from payoff date
}

export interface LiabilityPaymentAllocation {
  liabilityId: string;
  liabilityTitle: string;
  allocatedAmount: number;
  interest: number;
  fees: number;
  principal: number;
  dueDate?: string;
}

export interface MultiLiabilityPaymentData {
  totalAmount: number;
  allocations: LiabilityPaymentAllocation[];
  paymentDate: Date;
}

/**
 * Calculate payment impact for a single liability
 */
export function calculatePaymentImpact(
  liability: {
    id: string;
    current_balance: number;
    interest_rate_apy?: number;
    periodical_payment?: number;
    periodical_frequency?: string;
    next_due_date?: string;
    targeted_payoff_date?: string;
    start_date?: string;
  },
  paymentAmount: number,
  interestAmount: number,
  feesAmount: number,
  paymentDate: Date
): PaymentImpact {
  const currentBalance = Number(liability.current_balance || 0);
  const principalPaid = paymentAmount - interestAmount - feesAmount;
  const newBalance = Math.max(0, currentBalance - principalPaid);

  // Calculate next due date impact
  let nextDueDate = liability.next_due_date;
  let newNextDueDate: string | undefined;
  let daysAhead: number | undefined;

  if (nextDueDate) {
    const dueDate = new Date(nextDueDate);
    const daysUntilDue = Math.floor((dueDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue > 0) {
      daysAhead = daysUntilDue;
    }

    // If payment is more than expected, calculate new due date
    const expectedPayment = Number(liability.periodical_payment || 0);
    if (paymentAmount > expectedPayment && expectedPayment > 0) {
      const extraAmount = paymentAmount - expectedPayment;
      const extraPayments = Math.floor(extraAmount / expectedPayment);
      
      if (extraPayments > 0 && liability.periodical_frequency) {
        const frequency = liability.periodical_frequency.toLowerCase();
        let monthsToAdd = 0;
        
        if (frequency === 'monthly') monthsToAdd = extraPayments;
        else if (frequency === 'quarterly') monthsToAdd = extraPayments * 3;
        else if (frequency === 'yearly') monthsToAdd = extraPayments * 12;
        else if (frequency === 'weekly') monthsToAdd = Math.floor(extraPayments * 7 / 30);
        else if (frequency === 'biweekly' || frequency === 'bi-weekly') monthsToAdd = Math.floor(extraPayments * 14 / 30);
        
        if (monthsToAdd > 0) {
          const newDate = addMonths(dueDate, monthsToAdd);
          newNextDueDate = newDate.toISOString().split('T')[0];
        }
      }
    }
  }

  // Calculate payoff date impact
  let payoffDate = liability.targeted_payoff_date;
  let newPayoffDate: string | undefined;
  let monthsReduced: number | undefined;

  if (payoffDate && liability.interest_rate_apy && liability.periodical_payment) {
    const currentPayoffDate = new Date(payoffDate);
    const monthlyPayment = Number(liability.periodical_payment);
    const interestRate = Number(liability.interest_rate_apy);

    if (newBalance > 0 && monthlyPayment > 0) {
      // Calculate new term with reduced balance
      const newTermMonths = calculateLoanTerm(newBalance, interestRate, monthlyPayment);
      
      if (newTermMonths !== Infinity && liability.start_date) {
        const startDate = new Date(liability.start_date);
        const newPayoff = addMonths(startDate, newTermMonths);
        newPayoffDate = newPayoff.toISOString().split('T')[0];
        
        const currentPayoff = new Date(payoffDate);
        const monthsDiff = (currentPayoff.getFullYear() - newPayoff.getFullYear()) * 12 + 
                          (currentPayoff.getMonth() - newPayoff.getMonth());
        if (monthsDiff > 0) {
          monthsReduced = monthsDiff;
        }
      }
    } else if (newBalance <= 0) {
      // Paid off
      newPayoffDate = paymentDate.toISOString().split('T')[0];
      if (payoffDate) {
        const currentPayoff = new Date(payoffDate);
        const monthsDiff = (currentPayoff.getFullYear() - paymentDate.getFullYear()) * 12 + 
                          (currentPayoff.getMonth() - paymentDate.getMonth());
        if (monthsDiff > 0) {
          monthsReduced = monthsDiff;
        }
      }
    }
  }

  return {
    currentBalance,
    newBalance,
    principalPaid,
    interestPaid: interestAmount,
    feesPaid: feesAmount,
    nextDueDate,
    newNextDueDate,
    payoffDate,
    newPayoffDate,
    daysAhead,
    monthsReduced,
  };
}

/**
 * Calculate payment intelligence message
 */
export function calculatePaymentIntelligence(
  impact: PaymentImpact,
  paymentAmount: number
): {
  message: string;
  color: string;
  icon: string;
} {
  const principalReduction = impact.principalPaid;
  const interestPaid = impact.interestPaid;
  
  let message = '';
  let color = '#10B981'; // Green
  let icon = 'information-circle';

  if (impact.daysAhead && impact.daysAhead > 0) {
    message = `Your ₹${paymentAmount.toLocaleString('en-IN')} payment reduced your total by ₹${principalReduction.toLocaleString('en-IN')} (₹${interestPaid.toLocaleString('en-IN')} interest). You&apos;re now ${impact.daysAhead} day${impact.daysAhead > 1 ? 's' : ''} ahead.`;
    
    if (impact.newNextDueDate) {
      const newDate = new Date(impact.newNextDueDate);
      const dateStr = newDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      message += ` New due date: ${dateStr}.`;
    }
  } else if (impact.monthsReduced && impact.monthsReduced > 0) {
    message = `Your ₹${paymentAmount.toLocaleString('en-IN')} payment reduced your total by ₹${principalReduction.toLocaleString('en-IN')} (₹${interestPaid.toLocaleString('en-IN')} interest). Payoff date moved up by ${impact.monthsReduced} month${impact.monthsReduced > 1 ? 's' : ''}.`;
    
    if (impact.newPayoffDate) {
      const newDate = new Date(impact.newPayoffDate);
      const dateStr = newDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      message += ` New payoff: ${dateStr}.`;
    }
  } else {
    message = `Your ₹${paymentAmount.toLocaleString('en-IN')} payment reduced your total by ₹${principalReduction.toLocaleString('en-IN')} (₹${interestPaid.toLocaleString('en-IN')} interest).`;
  }

  return { message, color, icon };
}

/**
 * Auto-allocate payment across multiple liabilities
 */
export function autoAllocatePayment(
  totalAmount: number,
  liabilities: Array<{
    id: string;
    title: string;
    current_balance: number;
    interest_rate_apy?: number;
    next_due_date?: string;
    periodical_payment?: number;
  }>
): LiabilityPaymentAllocation[] {
  // Sort by due date (earliest first)
  const sorted = [...liabilities].sort((a, b) => {
    if (!a.next_due_date) return 1;
    if (!b.next_due_date) return -1;
    return new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime();
  });

  const allocations: LiabilityPaymentAllocation[] = [];
  let remaining = totalAmount;

  for (const liability of sorted) {
    if (remaining <= 0) break;

    const expectedPayment = Number(liability.periodical_payment || 0);
    const currentBalance = Number(liability.current_balance || 0);
    const interestRate = Number(liability.interest_rate_apy || 0);

    // Calculate interest for this liability
    const monthlyRate = interestRate > 0 ? interestRate / 12 / 100 : 0;
    const interest = Math.round(currentBalance * monthlyRate * 100) / 100;

    // Allocate minimum of: expected payment, remaining amount, or what's needed
    const allocateAmount = Math.min(
      expectedPayment || remaining,
      remaining,
      currentBalance + interest
    );

    if (allocateAmount > 0) {
      const principal = Math.max(0, allocateAmount - interest);
      const fees = 0; // Fees can be added manually

      allocations.push({
        liabilityId: liability.id,
        liabilityTitle: liability.title,
        allocatedAmount: allocateAmount,
        interest,
        fees,
        principal,
        dueDate: liability.next_due_date,
      });

      remaining -= allocateAmount;
    }
  }

  return allocations;
}

