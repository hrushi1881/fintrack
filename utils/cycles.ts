/**
 * Cycles Engine
 * Provides period-based views of commitments for recurring transactions, goals, liabilities, and budgets.
 * Cycles are computed dynamically from activity parameters and actual transaction data.
 */

import { Transaction } from '@/types';
import { calculateNextOccurrence } from './recurrence';
import { RecurrenceDefinition } from '@/types/recurrence';
import { resolveFrequencyWithCustom } from './frequency';

export type CycleStatus = 
  | 'paid_on_time' 
  | 'paid_early'
  | 'paid_within_window'
  | 'paid_late' 
  | 'underpaid' 
  | 'overpaid' 
  | 'not_paid' 
  | 'upcoming'
  | 'partial';

/**
 * Scheduled bill information attached to a cycle (for liabilities)
 */
export interface ScheduledBill {
  id: string;
  amount: number;
  dueDate: string;
  status: string;
  title: string;
}

export interface CycleBill {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  amount: number;
  totalAmount?: number | null;
}

export interface Cycle {
  cycleNumber: number;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  expectedAmount: number;
  minimumAmount?: number; // Optional minimum required payment
  expectedDate: string; // The due date within this cycle
  actualAmount: number;
  actualDate?: string;
  lastPaymentDate?: string;
  paymentCount?: number;
  timingStatus?: 'early' | 'on_time' | 'within_window' | 'late' | 'none';
  isWithinWindow?: boolean; // True if payment was within tolerance window
  daysFromDue?: number; // Days from due date (negative = early, positive = late)
  amountStatus?: 'over' | 'target' | 'partial' | 'below_minimum' | 'minimum_met' | 'none';
  statusLabel?: string;
  status: CycleStatus;
  transactions: Transaction[];
  notes?: string;
  // Pricing/phase metadata for recurring items
  phaseLabel?: string;
  prorated?: boolean;
  daysLate?: number; // Only for late payments
  daysEarly?: number; // Only for early payments
  amountShort?: number; // Only for underpaid
  amountOver?: number; // Only for overpaid
  // Interest breakdown (for liabilities)
  expectedPrincipal?: number;
  expectedInterest?: number;
  remainingBalance?: number; // Balance after this cycle
  // Actual interest and principal paid (from payment records)
  actualInterest?: number;
  actualPrincipal?: number;
  // Scheduled bill (for liabilities - shows planned payment before execution)
  scheduledBill?: ScheduledBill;
  // All bills linked to this cycle (liabilities)
  bills?: CycleBill[];
}

export interface CycleGenerationOptions {
  startDate: string; // ISO date string (activity start date)
  endDate?: string | null; // ISO date string (activity end date, null = ongoing)
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  interval: number; // e.g., 1 for monthly, 2 for bi-weekly
  customUnit?: 'day' | 'days' | 'week' | 'weeks' | 'month' | 'months' | 'quarter' | 'quarters' | 'year' | 'years';
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
  tolerance: number; // Days tolerance for matching and on-time window (default: 2)
  amountTolerance: number; // Percentage tolerance for expected vs actual (default: 0.01 = 1%)
}

/**
 * Default tolerance values for liability cycles
 */
export const DEFAULT_LIABILITY_TOLERANCE_DAYS = 7; // ±7 days window for matching payments
export const DEFAULT_LIABILITY_AMOUNT_TOLERANCE = 0.01; // 1% tolerance for amount matching

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

  // Resolve effective frequency (handles custom unit)
  const actualFrequency = resolveFrequencyWithCustom(frequency, customUnit);

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
    const periods = periodsPerYear[actualFrequency] || 12;
    periodRate = (interestRate || 0) / 100 / periods;
  }

  while (count < maxCycles) {
    const cycleEnd = calculateCycleEnd(cycleStart, actualFrequency, interval);
    
    // Check if we've passed the end date
    if (end && cycleStart > end) {
      break;
    }

    // Calculate expected payment date within this cycle
    const expectedDate = calculateExpectedDate(cycleStart, cycleEnd, dueDay, actualFrequency);
    
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

    // Check for duplicate before adding
    const isDuplicate = cycles.some(c => 
      c.cycleNumber === cycleNumber &&
      c.startDate === formatDate(cycleStart) &&
      c.endDate === formatDate(cycleEnd)
    );

    if (!isDuplicate) {
      cycles.push(cycle);
    } else {
      console.warn('Duplicate cycle detected during generation:', {
        cycleNumber,
        startDate: formatDate(cycleStart),
        endDate: formatDate(cycleEnd),
      });
    }

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
  interval: number
): Date {
  const endDate = new Date(startDate);
  const actualInterval = interval;

  switch (frequency) {
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
 * Match transactions to cycles and determine status.
 * 
 * MATCHING LOGIC:
 * - Transactions are matched to cycles if their date falls within:
 *   [cycle.startDate - tolerance, cycle.endDate + tolerance]
 * - This allows early payments (before cycle starts) and late payments (after cycle ends)
 * - Multiple payments can match to the same cycle (all are aggregated)
 * - Amount tolerance (default 1%) is used for status determination, not matching
 * 
 * MULTIPLE PAYMENTS HANDLING:
 * - All payments within the tolerance window are matched to the cycle
 * - Amounts are summed together
 * - Earliest payment date is used for timeliness status check
 * - Interest/principal components are summed from all payments
 * 
 * TOLERANCE DEFAULTS:
 * - Date tolerance: 7 days for liabilities (DEFAULT_LIABILITY_TOLERANCE_DAYS)
 * - Amount tolerance: 1% (0.01) for rounding differences
 * 
 * @param cycles Array of cycles
 * @param transactions Array of transactions
 * @param options Matching options with tolerance and amountTolerance
 * @returns Updated cycles with matched transactions and status
 */
export function matchTransactionsToCycles(
  cycles: Cycle[],
  transactions: Transaction[],
  options: Partial<TransactionMatchOptions> = {}
): Cycle[] {
  const { tolerance = 2, amountTolerance = 0.01 } = options;

  return cycles.map((cycle) => {
    // Find transactions that fall within the cycle window, allowing early/late by tolerance days
    const cycleTransactions = transactions.filter((tx) => {
      const txDate = new Date(tx.date);
      const cycleStart = new Date(cycle.startDate);
      const cycleEnd = new Date(cycle.endDate);

      // If transaction explicitly carries cycle_number, honor it
      const txCycleNumber = (tx as any)?.metadata?.cycle_number;
      if (typeof txCycleNumber === 'number' && txCycleNumber === cycle.cycleNumber) {
        return true;
      }

      // Extend window by tolerance on both sides to allow early/late payments
      const windowStart = new Date(cycleStart);
      windowStart.setDate(windowStart.getDate() - tolerance);
      const windowEnd = new Date(cycleEnd);
      windowEnd.setDate(windowEnd.getDate() + tolerance);
      
      // Reset times for date-only comparison
      txDate.setHours(0, 0, 0, 0);
      windowStart.setHours(0, 0, 0, 0);
      windowEnd.setHours(0, 0, 0, 0);

      return txDate >= windowStart && txDate <= windowEnd;
    });

    // Sort transactions by date
    const sortedTx = [...cycleTransactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Sum up all transaction amounts
    const totalAmount = sortedTx.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    // Calculate actual interest and principal from payment metadata
    let actualInterest = 0;
    let actualPrincipal = 0;
    
    sortedTx.forEach((tx) => {
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

    const firstTx = sortedTx[0];
    const lastTx = sortedTx[sortedTx.length - 1];
    const actualDate = firstTx?.date;
    const lastPaymentDate = lastTx?.date;

    const statusInfo = buildCycleStatus(
      cycle,
      {
        totalAmount,
        paymentCount: sortedTx.length,
        firstPaymentDate: actualDate,
        lastPaymentDate,
      },
      { tolerance, amountTolerance }
    );

    return {
      ...cycle,
      actualAmount: totalAmount,
      actualDate,
      lastPaymentDate,
      paymentCount: sortedTx.length,
      status: statusInfo.status,
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

type PaymentSummary = {
  totalAmount: number;
  paymentCount: number;
  firstPaymentDate?: string;
  lastPaymentDate?: string;
};

type StatusBuildOptions = {
  tolerance: number;
  amountTolerance: number;
};

function buildCycleStatus(
  cycle: Cycle,
  payments: PaymentSummary,
  options: StatusBuildOptions
): Partial<Cycle> & { status: CycleStatus } {
  const { tolerance, amountTolerance } = options;
  const expected = cycle.expectedAmount || 0;
  const minimum = cycle.minimumAmount || 0;
  const total = payments.totalAmount || 0;
  const hasPayments = payments.paymentCount > 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(cycle.expectedDate);
  dueDate.setHours(0, 0, 0, 0);
  const cycleEnd = new Date(cycle.endDate);
  cycleEnd.setHours(0, 0, 0, 0);

  // No payments
  if (!hasPayments) {
    if (cycleEnd >= today) {
      return {
        status: 'upcoming',
        statusLabel: 'Upcoming - no payments yet',
        amountStatus: 'none',
        timingStatus: 'none',
        isWithinWindow: false,
      };
  }
    return {
      status: 'not_paid',
      statusLabel: 'Missed - no payment',
      amountStatus: 'none',
      timingStatus: 'none',
      isWithinWindow: false,
    };
  }

  // Use first payment date for timing evaluation (primary payment timing)
  const firstPaymentDate = payments.firstPaymentDate ? new Date(payments.firstPaymentDate) : dueDate;
  firstPaymentDate.setHours(0, 0, 0, 0);

  // Calculate days difference from due date
  const daysDiff = Math.floor(
    (firstPaymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  /**
   * TIMING STATUS BASED ON CYCLE WINDOW RULES:
   * 
   * | Payment Timing                           | Status          | isWithinWindow |
   * |------------------------------------------|-----------------|----------------|
   * | Before (due - tolerance)                 | early           | true           |
   * | Between (due - tolerance) and due date   | on_time (early) | true           |
   * | Exactly on due date                      | on_time         | true           |
   * | Between due date and (due + tolerance)   | within_window   | true           |
   * | After (due + tolerance)                  | late            | false          |
   */

  let timingStatus: Cycle['timingStatus'] = 'on_time';
  let isWithinWindow = true;
  let daysLate: number | undefined;
  let daysEarly: number | undefined;

  if (daysDiff < -tolerance) {
    // Paid more than tolerance days before due date - early (ahead of window)
    timingStatus = 'early';
    daysEarly = Math.abs(daysDiff);
    isWithinWindow = true; // Still acceptable
  } else if (daysDiff < 0) {
    // Paid before due date but within tolerance window - on_time (early)
    timingStatus = 'early';
    daysEarly = Math.abs(daysDiff);
    isWithinWindow = true;
  } else if (daysDiff === 0) {
    // Paid exactly on due date
    timingStatus = 'on_time';
    isWithinWindow = true;
  } else if (daysDiff <= tolerance) {
    // Paid after due date but within tolerance window - within_window
    timingStatus = 'within_window';
    daysLate = daysDiff;
    isWithinWindow = true;
  } else {
    // Paid more than tolerance days after due date - late (outside window)
    timingStatus = 'late';
    daysLate = daysDiff;
    isWithinWindow = false;
    }

  // Amount evaluation
  const expectedFloor = expected > 0 ? expected * (1 - amountTolerance) : expected;
  const expectedCeil = expected > 0 ? expected * (1 + amountTolerance) : expected;

  let amountStatus: Cycle['amountStatus'] = 'none';
  let amountShort: number | undefined;
  let amountOver: number | undefined;

  if (total >= expectedCeil && expected > 0) {
    amountStatus = 'over';
    amountOver = total - expected;
  } else if (expected > 0 && total >= expectedFloor) {
    amountStatus = 'target';
  } else if (minimum > 0 && total < minimum) {
    amountStatus = 'below_minimum';
    amountShort = expected > 0 ? expected - total : undefined;
  } else if (minimum > 0 && total >= minimum && total < expectedFloor) {
    amountStatus = 'minimum_met';
    amountShort = expected > 0 ? expected - total : undefined;
  } else if (total > 0 && expected > 0) {
    amountStatus = 'partial';
    amountShort = expected - total;
  }

  /**
   * MAP TO CYCLE STATUS:
   * 
   * Priority order:
   * 1. Amount status determines base status (overpaid, underpaid, partial)
   * 2. Timing status modifies the base status
   * 3. Within window payments get preferential treatment
   */
  let status: CycleStatus = 'partial';
  
  if (amountStatus === 'over') {
    // Overpaid - timing matters for label but always positive
    if (timingStatus === 'late') {
      status = 'paid_late'; // Late but overpaid
    } else if (timingStatus === 'early') {
      status = 'paid_early'; // Early and overpaid
    } else if (timingStatus === 'within_window') {
      status = 'paid_within_window'; // Within window and overpaid
    } else {
      status = 'overpaid';
    }
  } else if (amountStatus === 'target' || amountStatus === 'minimum_met') {
    // Target or minimum met
    if (timingStatus === 'late') {
      status = 'paid_late';
    } else if (timingStatus === 'early') {
      status = 'paid_early';
    } else if (timingStatus === 'within_window') {
      status = 'paid_within_window';
    } else {
      status = 'paid_on_time';
    }
  } else if (amountStatus === 'below_minimum' || amountStatus === 'partial') {
    // Underpaid or partial
    if (!isWithinWindow) {
      status = 'underpaid'; // Late and underpaid
    } else {
      status = 'partial'; // Still within window, can add more
    }
  } else if (amountStatus === 'none') {
    status = 'not_paid';
  }

  // Build status label with window context
  let timingLabel = '';
  if (timingStatus === 'early') {
    timingLabel = daysEarly && daysEarly > tolerance 
      ? `${daysEarly} days early`
      : `${daysEarly} day${(daysEarly ?? 0) > 1 ? 's' : ''} before due`;
  } else if (timingStatus === 'on_time') {
    timingLabel = 'On time';
  } else if (timingStatus === 'within_window') {
    timingLabel = `${daysLate} day${(daysLate ?? 0) > 1 ? 's' : ''} after due (within window)`;
  } else if (timingStatus === 'late') {
    timingLabel = `${daysLate} day${(daysLate ?? 0) > 1 ? 's' : ''} late (outside window)`;
  } else {
    timingLabel = 'No timing';
  }

  let amountLabel = 'Paid';
  if (amountStatus === 'over') {
    amountLabel = 'Overpaid';
  } else if (amountStatus === 'target') {
    amountLabel = 'Full payment';
  } else if (amountStatus === 'minimum_met') {
    amountLabel = 'Minimum paid';
  } else if (amountStatus === 'below_minimum') {
    amountLabel = 'Below minimum';
  } else if (amountStatus === 'partial') {
    amountLabel = 'Partial';
  } else if (amountStatus === 'none') {
    amountLabel = 'No payment';
  }

  const windowLabel = isWithinWindow ? '✓' : '✗';
  const statusLabel = `${amountLabel} - ${timingLabel} ${windowLabel}`;

  const info: Partial<Cycle> & { status: CycleStatus } = {
    status,
    statusLabel,
    timingStatus,
    amountStatus,
    isWithinWindow,
    daysFromDue: daysDiff,
  };

  if (typeof daysLate === 'number') info.daysLate = daysLate;
  if (typeof daysEarly === 'number') info.daysEarly = daysEarly;
  if (typeof amountShort === 'number') info.amountShort = amountShort;
  if (typeof amountOver === 'number') info.amountOver = amountOver;

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
 * Find the cycle that a payment/bill should be mapped to based on date
 * @param cycles Array of cycles
 * @param paymentDate Payment or bill date (ISO date string)
 * @param tolerance Days tolerance for matching (default: 7 for liabilities)
 * @returns Cycle number if found, null otherwise
 */
export function findCycleForPayment(
  cycles: Cycle[],
  paymentDate: string,
  tolerance: number = DEFAULT_LIABILITY_TOLERANCE_DAYS
): number | null {
  const txDate = new Date(paymentDate);
  txDate.setHours(0, 0, 0, 0);

  for (const cycle of cycles) {
    const cycleStart = new Date(cycle.startDate);
    const cycleEnd = new Date(cycle.endDate);
    
    // Extend window by tolerance on both sides
    const windowStart = new Date(cycleStart);
    windowStart.setDate(windowStart.getDate() - tolerance);
    const windowEnd = new Date(cycleEnd);
    windowEnd.setDate(windowEnd.getDate() + tolerance);
    
    windowStart.setHours(0, 0, 0, 0);
    windowEnd.setHours(0, 0, 0, 0);

    if (txDate >= windowStart && txDate <= windowEnd) {
      return cycle.cycleNumber;
    }
  }

  return null;
}

/**
 * Get cycle statistics
 * @param cycles Array of cycles
 * @returns Cycle statistics
 */
export function getCycleStatistics(cycles: Cycle[]) {
  const total = cycles.length;
  
  // Count paid cycles (any successful payment status)
  const paid = cycles.filter(
    (c) => c.status === 'paid_on_time' || c.status === 'paid_early' || 
           c.status === 'paid_within_window' || c.status === 'paid_late' || 
           c.status === 'overpaid'
  ).length;
  
  const notPaid = cycles.filter((c) => c.status === 'not_paid').length;
  const upcoming = cycles.filter((c) => c.status === 'upcoming').length;
  
  // Timing-based counts
  const paidEarly = cycles.filter((c) => c.status === 'paid_early').length;
  const paidOnTime = cycles.filter((c) => c.status === 'paid_on_time').length;
  const paidWithinWindow = cycles.filter((c) => c.status === 'paid_within_window').length;
  const paidLate = cycles.filter((c) => c.status === 'paid_late').length;
  
  // Amount-based counts
  const underpaid = cycles.filter((c) => c.status === 'underpaid').length;
  const overpaid = cycles.filter((c) => c.status === 'overpaid').length;
  const partial = cycles.filter((c) => c.status === 'partial').length;
  
  // Window compliance
  const withinWindow = cycles.filter((c) => c.isWithinWindow === true).length;
  const outsideWindow = cycles.filter((c) => c.isWithinWindow === false && c.actualAmount > 0).length;

  const totalExpected = cycles.reduce((sum, c) => sum + c.expectedAmount, 0);
  const totalActual = cycles.reduce((sum, c) => sum + c.actualAmount, 0);

  // Calculate early payments using timingStatus
  const early = cycles.filter((c) => c.timingStatus === 'early').length;

  // Completion rate (any payment made)
  const completionRate = total > 0 ? (paid / total) * 100 : 0;
  
  // On-time rate = (early + on_time + within_window) / total paid
  const goodTimingCount = paidEarly + paidOnTime + paidWithinWindow;
  const onTimeRate = paid > 0 ? (goodTimingCount / paid) * 100 : 0;
  
  // Window compliance rate
  const windowComplianceRate = (withinWindow + outsideWindow) > 0 
    ? (withinWindow / (withinWindow + outsideWindow)) * 100 
    : 100;

  // Calculate streak (consecutive on-time/early/within-window payments)
  let currentStreak = 0;
  const sortedCycles = [...cycles].sort((a, b) => a.cycleNumber - b.cycleNumber);
  for (let i = sortedCycles.length - 1; i >= 0; i--) {
    const c = sortedCycles[i];
    // Good statuses for streak
    if (c.status === 'paid_on_time' || c.status === 'paid_early' || 
        c.status === 'paid_within_window' || c.status === 'overpaid') {
      currentStreak++;
    } else if (c.status !== 'upcoming') {
      break;
    }
  }

  return {
    total,
    paid,
    notPaid,
    upcoming,
    // Timing-based
    paidEarly,
    paidOnTime,
    paidWithinWindow,
    paidLate,
    late: paidLate, // Alias for backward compatibility
    early,
    // Amount-based
    underpaid,
    overpaid,
    partial,
    // Window compliance
    withinWindow,
    outsideWindow,
    windowComplianceRate: Math.round(windowComplianceRate * 10) / 10,
    // Totals
    totalExpected,
    totalActual,
    completionRate: Math.round(completionRate * 10) / 10,
    onTimeRate: Math.round(onTimeRate * 10) / 10,
    currentStreak,
    averagePayment: paid > 0 ? Math.round(totalActual / paid * 100) / 100 : 0,
  };
}

/**
 * Get human-readable status message for a cycle
 * Uses simple, clear language without jargon
 * @param cycle The cycle to get status for
 * @returns Status message with details
 */
export function getCycleStatusMessage(cycle: Cycle): {
  title: string;
  subtitle: string;
  color: string;
  icon: string;
} {
  const { status, daysLate, amountShort, amountOver, paymentCount, isWithinWindow, daysFromDue } = cycle;
  
  // Default values
  let title = 'Unknown';
  let subtitle = '';
  let color = '#6B7280'; // Gray
  let icon = 'ellipse';
  
  switch (status) {
    case 'paid_on_time':
      title = 'Paid ✓';
      subtitle = paymentCount && paymentCount > 1 ? `${paymentCount} payments` : 'On time';
      color = '#10B981'; // Green
      icon = 'checkmark-circle';
      break;
      
    case 'paid_early':
      title = 'Paid ✓';
      const daysEarlyNum = cycle.daysEarly || Math.abs(daysFromDue || 0);
      subtitle = daysEarlyNum > 0 ? `${daysEarlyNum} day${daysEarlyNum > 1 ? 's' : ''} early` : 'Early';
      color = '#059669'; // Emerald
      icon = 'checkmark-done-circle';
      break;
      
    case 'paid_within_window':
      title = 'Paid ✓';
      const daysAfterDue = daysLate || daysFromDue || 0;
      subtitle = daysAfterDue > 0 ? `${daysAfterDue} day${daysAfterDue > 1 ? 's' : ''} after due` : 'Completed';
      color = '#6366F1'; // Indigo
      icon = 'checkmark-circle-outline';
      break;
      
    case 'paid_late':
      title = 'Paid late';
      subtitle = daysLate ? `${daysLate} day${daysLate > 1 ? 's' : ''} late` : 'After due date';
      color = '#F59E0B'; // Amber
      icon = 'time';
      break;
      
    case 'overpaid':
      title = 'Paid more';
      subtitle = amountOver ? `Extra paid` : 'More than expected';
      color = '#8B5CF6'; // Purple
      icon = 'arrow-up-circle';
      break;
      
    case 'underpaid':
      title = 'Paid less';
      subtitle = !isWithinWindow ? `Late & incomplete` : amountShort ? `Short` : 'Below target';
      color = '#EF4444'; // Red
      icon = 'alert-circle';
      break;
      
    case 'partial':
      title = 'Paid less';
      subtitle = isWithinWindow ? `Can add more` : amountShort ? `Incomplete` : 'Partial';
      color = '#F59E0B'; // Amber
      icon = 'pie-chart';
      break;
      
    case 'not_paid':
      title = 'Missed';
      subtitle = 'No payment';
      color = '#EF4444'; // Red
      icon = 'close-circle';
      break;
      
    case 'upcoming':
      title = 'Due';
      const expectedDate = new Date(cycle.expectedDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expectedDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((expectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntil === 0) {
        subtitle = 'Today';
        color = '#F59E0B'; // Amber
        icon = 'alert';
      } else if (daysUntil === 1) {
        subtitle = 'Tomorrow';
        color = '#6366F1'; // Indigo
        icon = 'calendar';
      } else if (daysUntil > 0 && daysUntil <= 7) {
        subtitle = `In ${daysUntil} days`;
        color = '#6366F1'; // Indigo
        icon = 'calendar';
      } else if (daysUntil < 0) {
        // Past due but still upcoming status (no payment yet)
        const daysPast = Math.abs(daysUntil);
        if (daysPast <= DEFAULT_LIABILITY_TOLERANCE_DAYS) {
          subtitle = `${daysPast} day${daysPast > 1 ? 's' : ''} past due (within window)`;
          color = '#F59E0B'; // Amber warning
          icon = 'alert';
        } else {
          subtitle = `${daysPast} days overdue`;
          color = '#EF4444'; // Red
          icon = 'alert-circle';
        }
      } else {
        subtitle = `Due on ${expectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        color = '#6B7280'; // Gray
        icon = 'calendar-outline';
      }
      break;
  }
  
  return { title, subtitle, color, icon };
}

/**
 * Get cycle rules based on cycle configuration
 * @param cycle The cycle
 * @param options Additional options
 * @returns Array of rule strings with icons
 */
export function getCycleRules(
  cycle: Cycle,
  options?: {
    tolerance?: number;
    minimumPaymentPercent?: number;
  }
): { text: string; icon: string; type: 'info' | 'success' | 'warning' }[] {
  const rules: { text: string; icon: string; type: 'info' | 'success' | 'warning' }[] = [];
  const tolerance = options?.tolerance ?? DEFAULT_LIABILITY_TOLERANCE_DAYS;
  
  // Payment window rule (most important)
  rules.push({
    text: `Payment window: ±${tolerance} days from due date`,
    icon: 'calendar',
    type: 'info',
  });
  
  // Window timing breakdown
  rules.push({
    text: `Early: Before due date (bonus)`,
    icon: 'checkmark-done',
    type: 'success',
  });
  
  rules.push({
    text: `On time: Exactly on due date`,
    icon: 'checkmark',
    type: 'success',
  });
  
  rules.push({
    text: `Within window: Up to ${tolerance} days after due`,
    icon: 'checkmark-circle-outline',
    type: 'info',
  });
  
  rules.push({
    text: `Late: More than ${tolerance} days after due`,
    icon: 'alert',
    type: 'warning',
  });
  
  // Target amount rule
  rules.push({
    text: `Target: Full expected amount`,
    icon: 'cash',
    type: 'info',
  });
  
  // Minimum amount rule
  if (cycle.minimumAmount && cycle.minimumAmount > 0) {
    rules.push({
      text: `Minimum required: At least this amount`,
      icon: 'remove-circle',
      type: 'warning',
    });
  }
  
  // Multiple payments rule
  rules.push({
    text: `Multiple payments: Allowed within window`,
    icon: 'layers',
    type: 'info',
  });
  
  // Amount tolerance rule
  rules.push({
    text: `Amount tolerance: ±1% for exact match`,
    icon: 'swap-horizontal',
    type: 'info',
  });
  
  return rules;
}

/**
 * Get simple rule strings (backward compatibility)
 */
export function getCycleRulesSimple(
  cycle: Cycle,
  options?: { tolerance?: number }
): string[] {
  const tolerance = options?.tolerance ?? DEFAULT_LIABILITY_TOLERANCE_DAYS;
  return [
    `Payment window: ±${tolerance} days`,
    `Multiple payments: Allowed`,
    `Early payment: Encouraged`,
    `Amount tolerance: ±1%`,
  ];
}

