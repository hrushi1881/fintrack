/**
 * Recurring Transaction Cycles Utilities
 * Specialized cycle generation for recurring transactions (containers)
 * 
 * Key Rules:
 * - If end_date is not provided, generate minimum 6 cycles
 * - Cycles are calculated on-the-fly (not stored)
 * - Bills are generated from cycles (3 days before cycle's expected date)
 */

import { Cycle, generateCycles, CycleGenerationOptions } from './cycles';
import { RecurringTransaction } from './recurringTransactions';
import { calculateNextOccurrence } from './recurrence';

/**
 * Generate cycles for a recurring transaction container
 * Ensures minimum 6 cycles if end_date is not provided
 */
export function generateCyclesForRecurringTransaction(
  container: RecurringTransaction
): Cycle[] {
  const {
    start_date,
    end_date,
    frequency,
    interval = 1,
    date_of_occurrence,
    custom_unit,
    custom_interval,
    amount,
    estimated_amount,
  } = container;

  // Determine amount to use
  const cycleAmount = amount || estimated_amount || 0;

  // Map database frequency to cycles format
  const frequencyMap: Record<string, 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'> = {
    'day': 'daily',
    'week': 'weekly',
    'month': 'monthly',
    'quarter': 'quarterly',
    'year': 'yearly',
    'custom': 'custom',
    // Backward compatibility
    'daily': 'daily',
    'weekly': 'weekly',
    'monthly': 'monthly',
    'quarterly': 'quarterly',
    'yearly': 'yearly',
  };

  const dbFrequency = String(frequency || 'month').toLowerCase();
  const cyclesFrequency = frequencyMap[dbFrequency] || 'monthly';

  // If end_date is not provided, calculate minimum 6 cycles
  let effectiveEndDate: string | null = end_date || null;
  
  if (!effectiveEndDate) {
    // Calculate date after 6 cycles
    effectiveEndDate = calculateDateAfterNCycles(
      start_date,
      cyclesFrequency,
      interval,
      6, // minimum cycles
      date_of_occurrence,
      custom_unit,
      custom_interval
    );
  }

  // Generate cycles
  const options: CycleGenerationOptions = {
    startDate: start_date,
    endDate: effectiveEndDate,
    frequency: cyclesFrequency,
    interval,
    customUnit: custom_unit as any,
    dueDay: date_of_occurrence ? parseInt(date_of_occurrence.toString()) : undefined,
    amount: cycleAmount,
    maxCycles: 1000, // High limit, but end_date will stop it
    currentDate: new Date().toISOString().split('T')[0],
  };

  const cycles = generateCycles(options);

  // Ensure minimum 6 cycles if no end_date
  if (!end_date && cycles.length < 6) {
    // Generate more cycles to reach minimum 6
    const lastCycle = cycles[cycles.length - 1];
    if (lastCycle) {
      const additionalCycles = generateCycles({
        ...options,
        startDate: lastCycle.endDate,
        endDate: calculateDateAfterNCycles(
          lastCycle.endDate,
          cyclesFrequency,
          interval,
          6 - cycles.length,
          date_of_occurrence,
          custom_unit,
          custom_interval
        ),
      });

      // Adjust cycle numbers
      const startCycleNumber = cycles.length + 1;
      additionalCycles.forEach((cycle, index) => {
        cycle.cycleNumber = startCycleNumber + index;
      });

      cycles.push(...additionalCycles);
    }
  }

  return cycles;
}

/**
 * Calculate date after N cycles from a start date
 */
function calculateDateAfterNCycles(
  startDate: string,
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom',
  interval: number,
  numberOfCycles: number,
  dateOfOccurrence?: number | string,
  customUnit?: string,
  customInterval?: number
): string {
  let currentDate = new Date(startDate);
  const actualFrequency = frequency === 'custom' ? customUnit! : frequency;
  const actualInterval = frequency === 'custom' ? customInterval! : interval;

  // Calculate N cycles forward
  for (let i = 0; i < numberOfCycles; i++) {
    switch (actualFrequency) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() + actualInterval);
        break;
      case 'weekly':
        currentDate.setDate(currentDate.getDate() + (actualInterval * 7));
        break;
      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + actualInterval);
        // Handle day of month if specified
        if (dateOfOccurrence) {
          const day = typeof dateOfOccurrence === 'string' 
            ? parseInt(dateOfOccurrence) 
            : dateOfOccurrence;
          const lastDayOfMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            0
          ).getDate();
          currentDate.setDate(Math.min(day, lastDayOfMonth));
        }
        break;
      case 'quarterly':
        currentDate.setMonth(currentDate.getMonth() + (actualInterval * 3));
        if (dateOfOccurrence) {
          const day = typeof dateOfOccurrence === 'string' 
            ? parseInt(dateOfOccurrence) 
            : dateOfOccurrence;
          const lastDayOfMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            0
          ).getDate();
          currentDate.setDate(Math.min(day, lastDayOfMonth));
        }
        break;
      case 'yearly':
        currentDate.setFullYear(currentDate.getFullYear() + actualInterval);
        if (dateOfOccurrence) {
          const day = typeof dateOfOccurrence === 'string' 
            ? parseInt(dateOfOccurrence) 
            : dateOfOccurrence;
          const lastDayOfMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            0
          ).getDate();
          currentDate.setDate(Math.min(day, lastDayOfMonth));
        }
        break;
      default:
        // Default to monthly
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  return currentDate.toISOString().split('T')[0];
}

/**
 * Find bill for a specific cycle
 */
export async function findBillForCycle(
  recurringTransactionId: string,
  cycleNumber: number
): Promise<any | null> {
  const { supabase } = await import('@/lib/supabase');
  const { data: user } = await supabase.auth.getUser();
  
  if (!user.user) return null;

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('user_id', user.user.id)
    .eq('is_deleted', false)
    .eq('metadata->>recurring_transaction_id', recurringTransactionId)
    .eq('metadata->>cycle_number', cycleNumber.toString())
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

/**
 * Get all bills for a recurring transaction
 */
export async function getBillsForRecurringTransaction(
  recurringTransactionId: string
): Promise<any[]> {
  const { supabase } = await import('@/lib/supabase');
  const { data: user } = await supabase.auth.getUser();
  
  if (!user.user) return [];

  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('user_id', user.user.id)
    .eq('is_deleted', false)
    .eq('metadata->>recurring_transaction_id', recurringTransactionId)
    .order('due_date', { ascending: true });

  if (error || !data) return [];
  return data;
}

/**
 * Match cycles to bills
 * Returns cycles with linked bill information
 */
export function matchCyclesToBills(
  cycles: Cycle[],
  bills: any[]
): Array<Cycle & { bill?: any; hasBill: boolean }> {
  return cycles.map(cycle => {
    const bill = bills.find(b => {
      const cycleNumber = b.metadata?.cycle_number;
      return cycleNumber === cycle.cycleNumber.toString() || 
             cycleNumber === cycle.cycleNumber;
    });

    return {
      ...cycle,
      bill: bill || undefined,
      hasBill: !!bill,
    };
  });
}

/**
 * Calculate which cycles need bills created today
 */
export function getCyclesNeedingBillsToday(
  cycles: Cycle[],
  today: string,
  daysBefore: number = 3
): Cycle[] {
  return cycles.filter(cycle => {
    const billCreationDate = subtractDays(cycle.expectedDate, daysBefore);
    return billCreationDate === today;
  });
}

/**
 * Subtract days from a date string
 */
function subtractDays(dateString: string, days: number): string {
  const date = new Date(dateString);
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}


