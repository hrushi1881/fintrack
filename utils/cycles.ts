/**
 * Cycles Engine
 * Provides period-based views of commitments for recurring transactions, goals, liabilities, and budgets.
 * Cycles are computed dynamically from activity parameters and actual transaction data.
 */

import { Transaction } from '@/types';
import { calculateNextOccurrence } from './recurrence';
import { RecurrenceDefinition } from '@/types/recurrence';

export type CycleStatus = 
  | 'paid_on_time' 
  | 'paid_late' 
  | 'underpaid' 
  | 'overpaid' 
  | 'not_paid' 
  | 'upcoming'
  | 'partial';

export interface Cycle {
  cycleNumber: number;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  expectedAmount: number;
  expectedDate: string; // The due date within this cycle
  actualAmount: number;
  actualDate?: string;
  status: CycleStatus;
  transactions: Transaction[];
  notes?: string;
  daysLate?: number; // Only for late payments
  amountShort?: number; // Only for underpaid
  amountOver?: number; // Only for overpaid
  // Interest breakdown (for liabilities)
  expectedPrincipal?: number;
  expectedInterest?: number;
  remainingBalance?: number; // Balance after this cycle
  // Actual interest and principal paid (from payment records)
  actualInterest?: number;
  actualPrincipal?: number;
}

export interface CycleGenerationOptions {
  startDate: string; // ISO date string (activity start date)
  endDate?: string | null; // ISO date string (activity end date, null = ongoing)
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  interval: number; // e.g., 1 for monthly, 2 for bi-weekly
  customUnit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  dueDay?: number; // Day of month/week for payment (e.g., 2nd of month)
  amount: number; // Expected amount per cycle
  maxCycles?: number; // Limit number of cycles to generate (default: 12)
  currentDate?: string; // Current date for status calculation (default: today)
  // Interest calculation options (for liabilities)
  interestRate?: number; // Annual interest rate (e.g., 8.5 for 8.5%)
  startingBalance?: number; // Starting principal balance for interest calculation
  interestIncluded?: boolean; // Whether interest is included in amount (default: true)
}

export interface TransactionMatchOptions {
  tolerance: number; // Days tolerance for matching (default: 2)
  amountTolerance: number; // Percentage tolerance for amount (default: 0.01 = 1%)
}

/**
 * Generate cycles for an activity
 * @param options Cycle generation options
 * @returns Array of cycles
 */
export function generateCycles(options: CycleGenerationOptions): Cycle[] {
  const {
    startDate,
    endDate,
    frequency,
    interval,
    customUnit,
    dueDay,
    amount,
    maxCycles = 12,
    currentDate = new Date().toISOString().split('T')[0],
    interestRate,
    startingBalance,
    interestIncluded = true,
  } = options;

  const cycles: Cycle[] = [];
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const current = new Date(currentDate);
  
  // Reset times for date-only comparison
  start.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);
  if (end) end.setHours(0, 0, 0, 0);

  let cycleStart = new Date(start);
  let cycleNumber = 1;
  let count = 0;
  
  // Track balance for interest calculation (if interest rate provided)
  let currentBalance = startingBalance || 0;
  const hasInterest = interestRate !== undefined && interestRate > 0 && startingBalance !== undefined && startingBalance > 0;

  // Calculate period rate based on frequency
  let periodRate = 0;
  if (hasInterest) {
    const periodsPerYear: Record<string, number> = {
      daily: 365,
      weekly: 52,
      monthly: 12,
      quarterly: 4,
      yearly: 1,
    };
    const periods = periodsPerYear[frequency] || 12;
    periodRate = (interestRate || 0) / 100 / periods;
  }

  while (count < maxCycles) {
    const cycleEnd = calculateCycleEnd(cycleStart, frequency, interval, customUnit);
    
    // Check if we've passed the end date
    if (end && cycleStart > end) {
      break;
    }

    // Calculate expected payment date within this cycle
    const expectedDate = calculateExpectedDate(cycleStart, cycleEnd, dueDay, frequency);
    
    // Determine if this cycle is in the past, present, or future
    const cycleEndDate = new Date(cycleEnd);
    cycleEndDate.setHours(0, 0, 0, 0);
    
    // Calculate interest and principal for this cycle (if interest rate provided)
    let expectedInterest = 0;
    let expectedPrincipal = amount;
    let remainingBalance = currentBalance;
    
    if (hasInterest && currentBalance > 0) {
      // Calculate interest on current balance
      expectedInterest = Math.round(currentBalance * periodRate * 100) / 100;
      
      if (interestIncluded) {
        // Interest is included in payment amount
        // Principal = Payment - Interest
        expectedPrincipal = Math.max(0, amount - expectedInterest);
      } else {
        // Interest is separate, principal = payment amount
        expectedPrincipal = amount;
      }
      
      // Update balance: reduce by principal paid
      remainingBalance = Math.max(0, currentBalance - expectedPrincipal);
      remainingBalance = Math.round(remainingBalance * 100) / 100;
      
      // Update for next cycle
      currentBalance = remainingBalance;
    }
    
    const cycle: Cycle = {
      cycleNumber,
      startDate: formatDate(cycleStart),
      endDate: formatDate(cycleEnd),
      expectedAmount: amount,
      expectedDate: formatDate(expectedDate),
      actualAmount: 0,
      status: cycleEndDate < current ? 'not_paid' : 'upcoming',
      transactions: [],
      // Add interest breakdown if calculated
      ...(hasInterest && {
        expectedPrincipal,
        expectedInterest,
        remainingBalance,
      }),
    };

    cycles.push(cycle);

    // Move to next cycle
    cycleStart = new Date(cycleEnd);
    cycleStart.setDate(cycleStart.getDate() + 1); // Start day after previous cycle ended
    cycleNumber++;
    count++;

    // Safety check
    if (count > 1000) {
      console.warn('Cycle generation hit safety limit');
      break;
    }
    
    // Stop if balance is paid off (for interest calculations)
    if (hasInterest && remainingBalance <= 0.01) {
      break;
    }
  }

  return cycles;
}

/**
 * Calculate the end date of a cycle based on frequency
 * @param startDate Start date of the cycle
 * @param frequency Frequency of recurrence
 * @param interval Interval between occurrences
 * @param customUnit Custom unit if frequency is 'custom'
 * @returns End date of the cycle
 */
function calculateCycleEnd(
  startDate: Date,
  frequency: string,
  interval: number,
  customUnit?: string
): Date {
  const endDate = new Date(startDate);
  const actualFrequency = frequency === 'custom' ? customUnit! : frequency;
  const actualInterval = interval;

  switch (actualFrequency) {
    case 'daily':
      endDate.setDate(startDate.getDate() + actualInterval - 1);
      break;
    case 'weekly':
      endDate.setDate(startDate.getDate() + (actualInterval * 7) - 1);
      break;
    case 'monthly':
      endDate.setMonth(startDate.getMonth() + actualInterval);
      endDate.setDate(endDate.getDate() - 1); // Day before next cycle starts
      break;
    case 'quarterly':
      endDate.setMonth(startDate.getMonth() + (actualInterval * 3));
      endDate.setDate(endDate.getDate() - 1);
      break;
    case 'yearly':
      endDate.setFullYear(startDate.getFullYear() + actualInterval);
      endDate.setDate(endDate.getDate() - 1);
      break;
    default:
      // Default to monthly
      endDate.setMonth(startDate.getMonth() + 1);
      endDate.setDate(endDate.getDate() - 1);
  }

  return endDate;
}

/**
 * Calculate the expected payment date within a cycle
 * @param cycleStart Start date of the cycle
 * @param cycleEnd End date of the cycle
 * @param dueDay Day of month/week for payment
 * @param frequency Frequency of recurrence
 * @returns Expected payment date
 */
function calculateExpectedDate(
  cycleStart: Date,
  cycleEnd: Date,
  dueDay: number | undefined,
  frequency: string
): Date {
  if (!dueDay) {
    // If no specific due day, default to cycle start
    return new Date(cycleStart);
  }

  const expectedDate = new Date(cycleStart);

  if (frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly') {
    // Set to specific day of month
    const lastDayOfMonth = new Date(
      expectedDate.getFullYear(),
      expectedDate.getMonth() + 1,
      0
    ).getDate();
    
    // Ensure we don't exceed the last day of the month
    const actualDay = Math.min(dueDay, lastDayOfMonth);
    expectedDate.setDate(actualDay);

    // If the expected date is before cycle start, it means the due day already passed
    // So move to next month
    if (expectedDate < cycleStart) {
      expectedDate.setMonth(expectedDate.getMonth() + 1);
      const nextLastDay = new Date(
        expectedDate.getFullYear(),
        expectedDate.getMonth() + 1,
        0
      ).getDate();
      expectedDate.setDate(Math.min(dueDay, nextLastDay));
    }

    // If expected date is after cycle end, use cycle end
    if (expectedDate > cycleEnd) {
      return new Date(cycleEnd);
    }
  } else if (frequency === 'weekly') {
    // Set to specific day of week
    const targetDay = dueDay % 7; // 0 = Sunday, 1 = Monday, etc.
    const currentDay = expectedDate.getDay();
    let daysToAdd = targetDay - currentDay;
    
    if (daysToAdd < 0) {
      daysToAdd += 7;
    }
    
    expectedDate.setDate(expectedDate.getDate() + daysToAdd);

    // If expected date is after cycle end, use cycle end
    if (expectedDate > cycleEnd) {
      return new Date(cycleEnd);
    }
  }

  return expectedDate;
}

/**
 * Match transactions to cycles and determine status
 * @param cycles Array of cycles
 * @param transactions Array of transactions
 * @param options Matching options
 * @returns Updated cycles with matched transactions and status
 */
export function matchTransactionsToCycles(
  cycles: Cycle[],
  transactions: Transaction[],
  options: Partial<TransactionMatchOptions> = {}
): Cycle[] {
  const { tolerance = 2, amountTolerance = 0.01 } = options;

  return cycles.map((cycle) => {
    // Find transactions that fall within this cycle's date range
    const cycleTransactions = transactions.filter((tx) => {
      const txDate = new Date(tx.date);
      const cycleStart = new Date(cycle.startDate);
      const cycleEnd = new Date(cycle.endDate);
      
      // Reset times for date-only comparison
      txDate.setHours(0, 0, 0, 0);
      cycleStart.setHours(0, 0, 0, 0);
      cycleEnd.setHours(0, 0, 0, 0);

      return txDate >= cycleStart && txDate <= cycleEnd;
    });

    if (cycleTransactions.length === 0) {
      // No transactions found
      return {
        ...cycle,
        status: determineCycleStatus(cycle, 0, undefined),
        actualAmount: 0,
        transactions: [],
      };
    }

    // Sum up all transaction amounts
    const totalAmount = cycleTransactions.reduce(
      (sum, tx) => sum + Math.abs(tx.amount),
      0
    );

    // Calculate actual interest and principal from payment metadata
    let actualInterest = 0;
    let actualPrincipal = 0;
    
    cycleTransactions.forEach((tx) => {
      // Extract interest and principal from metadata if available (from liability_payments)
      if (tx.metadata) {
        const interest = typeof tx.metadata.interest === 'number' ? tx.metadata.interest : 
                        typeof tx.metadata.interest_component === 'number' ? tx.metadata.interest_component :
                        typeof tx.metadata.interest_amount === 'number' ? tx.metadata.interest_amount : 0;
        const principal = typeof tx.metadata.principal === 'number' ? tx.metadata.principal :
                          typeof tx.metadata.principal_component === 'number' ? tx.metadata.principal_component :
                          typeof tx.metadata.principal_amount === 'number' ? tx.metadata.principal_amount : 0;
        
        actualInterest += interest;
        actualPrincipal += principal;
      }
    });

    // If no metadata available, estimate from amount (for backward compatibility)
    if (actualInterest === 0 && actualPrincipal === 0 && totalAmount > 0) {
      // If cycle has expected interest breakdown, use proportional split
      if (cycle.expectedInterest !== undefined && cycle.expectedPrincipal !== undefined) {
        const expectedTotal = cycle.expectedPrincipal + cycle.expectedInterest;
        if (expectedTotal > 0) {
          const ratio = totalAmount / (cycle.expectedAmount || expectedTotal);
          actualPrincipal = cycle.expectedPrincipal * ratio;
          actualInterest = cycle.expectedInterest * ratio;
        } else {
          // Fallback: split 50/50 if no expected breakdown
          actualPrincipal = totalAmount * 0.5;
          actualInterest = totalAmount * 0.5;
        }
      } else {
        // No expected breakdown, split 50/50
        actualPrincipal = totalAmount * 0.5;
        actualInterest = totalAmount * 0.5;
      }
    }

    // Find the date of the last/most relevant transaction
    const latestTx = cycleTransactions.reduce((latest, tx) =>
      new Date(tx.date) > new Date(latest.date) ? tx : latest
    );

    const actualDate = latestTx.date;
    const status = determineCycleStatus(cycle, totalAmount, actualDate);

    // Calculate additional status information
    const statusInfo = calculateStatusInfo(cycle, totalAmount, actualDate, tolerance);

    return {
      ...cycle,
      actualAmount: totalAmount,
      actualDate,
      status,
      transactions: cycleTransactions,
      // Add actual interest and principal if calculated
      ...(actualInterest > 0 || actualPrincipal > 0 ? {
        actualInterest: Math.round(actualInterest * 100) / 100,
        actualPrincipal: Math.round(actualPrincipal * 100) / 100,
      } : {}),
      ...statusInfo,
    };
  });
}

/**
 * Determine the status of a cycle based on payment
 * @param cycle Cycle information
 * @param actualAmount Actual amount paid
 * @param actualDate Date of payment
 * @returns Cycle status
 */
function determineCycleStatus(
  cycle: Cycle,
  actualAmount: number,
  actualDate?: string
): CycleStatus {
  const currentDate = new Date();
  const expectedDate = new Date(cycle.expectedDate);
  const cycleEnd = new Date(cycle.endDate);
  
  // Reset times
  currentDate.setHours(0, 0, 0, 0);
  expectedDate.setHours(0, 0, 0, 0);
  cycleEnd.setHours(0, 0, 0, 0);

  // Check if cycle hasn't started yet or is current but no payment expected yet
  if (cycleEnd > currentDate) {
    if (actualAmount > 0) {
      // Payment made in advance
      if (actualAmount >= cycle.expectedAmount * 0.99) {
        return 'paid_on_time';
      } else if (actualAmount > 0) {
        return 'partial';
      }
    }
    return 'upcoming';
  }

  // No payment made
  if (actualAmount === 0) {
    return 'not_paid';
  }

  // Calculate payment accuracy
  const amountDiff = actualAmount - cycle.expectedAmount;
  const amountRatio = actualAmount / cycle.expectedAmount;

  // Check if payment date is available
  if (!actualDate) {
    // We have amount but no specific date
    if (amountRatio >= 0.99 && amountRatio <= 1.01) {
      return 'paid_on_time'; // Assume on time if amount is correct
    } else if (amountRatio < 0.99) {
      return 'underpaid';
    } else {
      return 'overpaid';
    }
  }

  const paymentDate = new Date(actualDate);
  paymentDate.setHours(0, 0, 0, 0);

  // Calculate days difference from expected date
  const daysDiff = Math.floor(
    (paymentDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Determine status based on timing and amount
  const isOnTime = Math.abs(daysDiff) <= 2; // Within ±2 days
  const isCorrectAmount = amountRatio >= 0.99 && amountRatio <= 1.01; // Within ±1%

  if (isCorrectAmount) {
    if (isOnTime) {
      return 'paid_on_time';
    } else if (daysDiff > 2) {
      return 'paid_late';
    } else {
      // Paid early
      return 'paid_on_time';
    }
  } else if (amountRatio < 0.99) {
    return 'underpaid';
  } else {
    return 'overpaid';
  }
}

/**
 * Calculate additional status information
 * @param cycle Cycle information
 * @param actualAmount Actual amount paid
 * @param actualDate Date of payment
 * @param tolerance Days tolerance for on-time payment
 * @returns Additional status information
 */
function calculateStatusInfo(
  cycle: Cycle,
  actualAmount: number,
  actualDate: string | undefined,
  tolerance: number
): Partial<Cycle> {
  const info: Partial<Cycle> = {};

  if (actualDate) {
    const expectedDate = new Date(cycle.expectedDate);
    const paymentDate = new Date(actualDate);
    
    expectedDate.setHours(0, 0, 0, 0);
    paymentDate.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor(
      (paymentDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff > tolerance) {
      info.daysLate = daysDiff;
    }
  }

  const amountDiff = actualAmount - cycle.expectedAmount;
  
  if (amountDiff < -0.01) {
    // Underpaid
    info.amountShort = Math.abs(amountDiff);
  } else if (amountDiff > 0.01) {
    // Overpaid
    info.amountOver = amountDiff;
  }

  return info;
}

/**
 * Get cycle by number
 * @param cycles Array of cycles
 * @param cycleNumber Cycle number to retrieve
 * @returns Cycle or undefined
 */
export function getCycleByNumber(cycles: Cycle[], cycleNumber: number): Cycle | undefined {
  return cycles.find((c) => c.cycleNumber === cycleNumber);
}

/**
 * Get current cycle (the one that includes today's date)
 * @param cycles Array of cycles
 * @param currentDate Current date (default: today)
 * @returns Current cycle or undefined
 */
export function getCurrentCycle(
  cycles: Cycle[],
  currentDate: string = new Date().toISOString().split('T')[0]
): Cycle | undefined {
  const today = new Date(currentDate);
  today.setHours(0, 0, 0, 0);

  return cycles.find((cycle) => {
    const start = new Date(cycle.startDate);
    const end = new Date(cycle.endDate);
    
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    return today >= start && today <= end;
  });
}

/**
 * Get upcoming cycles (future cycles)
 * @param cycles Array of cycles
 * @param currentDate Current date (default: today)
 * @returns Array of upcoming cycles
 */
export function getUpcomingCycles(
  cycles: Cycle[],
  currentDate: string = new Date().toISOString().split('T')[0]
): Cycle[] {
  const today = new Date(currentDate);
  today.setHours(0, 0, 0, 0);

  return cycles.filter((cycle) => {
    const start = new Date(cycle.startDate);
    start.setHours(0, 0, 0, 0);
    return start > today;
  });
}

/**
 * Get past cycles
 * @param cycles Array of cycles
 * @param currentDate Current date (default: today)
 * @returns Array of past cycles
 */
export function getPastCycles(
  cycles: Cycle[],
  currentDate: string = new Date().toISOString().split('T')[0]
): Cycle[] {
  const today = new Date(currentDate);
  today.setHours(0, 0, 0, 0);

  return cycles.filter((cycle) => {
    const end = new Date(cycle.endDate);
    end.setHours(0, 0, 0, 0);
    return end < today;
  });
}

/**
 * Format date to ISO date string (YYYY-MM-DD)
 * @param date Date object
 * @returns ISO date string
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get cycle statistics
 * @param cycles Array of cycles
 * @returns Cycle statistics
 */
export function getCycleStatistics(cycles: Cycle[]) {
  const total = cycles.length;
  const paid = cycles.filter(
    (c) => c.status === 'paid_on_time' || c.status === 'paid_late' || c.status === 'overpaid'
  ).length;
  const notPaid = cycles.filter((c) => c.status === 'not_paid').length;
  const upcoming = cycles.filter((c) => c.status === 'upcoming').length;
  const late = cycles.filter((c) => c.status === 'paid_late').length;
  const underpaid = cycles.filter((c) => c.status === 'underpaid').length;
  const overpaid = cycles.filter((c) => c.status === 'overpaid').length;
  const partial = cycles.filter((c) => c.status === 'partial').length;

  const totalExpected = cycles.reduce((sum, c) => sum + c.expectedAmount, 0);
  const totalActual = cycles.reduce((sum, c) => sum + c.actualAmount, 0);

  const completionRate = total > 0 ? (paid / total) * 100 : 0;
  const onTimeRate = total > 0 ? ((paid - late) / total) * 100 : 0;

  return {
    total,
    paid,
    notPaid,
    upcoming,
    late,
    underpaid,
    overpaid,
    partial,
    totalExpected,
    totalActual,
    completionRate: Math.round(completionRate * 10) / 10,
    onTimeRate: Math.round(onTimeRate * 10) / 10,
  };
}

